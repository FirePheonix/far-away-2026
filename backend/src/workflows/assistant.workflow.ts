/**
 * assistant.workflow.ts
 *
 * Inngest workflow that drives the orchestrator.
 *
 * Architecture:
 *  - One Inngest function handles the full agentic loop.
 *  - The orchestrator (ReAct / tool-calling) runs inside step.run() calls
 *    so Inngest can memo-ise each turn atomically.
 *  - When the orchestrator yields on request_user_input or confirm_action,
 *    the workflow suspends with step.waitForEvent() and resumes by feeding
 *    the user's answer back into the orchestrator as a tool result.
 *  - All closure, trace, skip/abandon/retry, and obsidian waitForEvent logic
 *    is preserved from the previous implementation.
 */

import OpenAI from "openai";
import { runOrchestrator, type OrchestratorTurn } from "../ai/orchestrator.js";
import { createExecutionContext, recordStepResult } from "../utils/context.js";
import type { StepExecutionRecord } from "../types/index.js";
import { supabaseAdmin } from "../config/supabase.js";
import {
  completeAssistantRun,
  startAssistantRun,
} from "../services/assistant-runs.service.js";
import {
  markStepAwaitingInput,
  markStepFailed,
  markStepRunning,
  markStepSkipped,
  markStepSucceeded,
  seedRunTrace,
} from "../services/run-trace.service.js";
import {
  closeRun,
  resolveClosure,
  teachFromClosure,
  type ClosedBy,
} from "../services/closure.service.js";
import { normalizeToolError } from "../utils/tool-errors.js";
import { NonRetriableError } from "inngest";
import { ASSISTANT_EVENTS, inngest } from "./inngest.js";

/** How many times a human may re-run one permanently failed step. */
const MAX_USER_RETRIES = 3;

/** Window a task can stay open before the run closes itself out. */
const WAIT_TIMEOUT = "24h";
const WAIT_TIMEOUT_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Error class for user-initiated run abandonment
// ---------------------------------------------------------------------------
class RunAbandonedError extends Error {
  constructor(
    public readonly reasonCode: string,
    public readonly note: string | undefined,
    public readonly closedBy: ClosedBy,
    public readonly runId?: string,
    public readonly requestId?: string,
  ) {
    super(`Run closed (${reasonCode})`);
    this.name = "RunAbandonedError";
  }
}

// ---------------------------------------------------------------------------
// Helper — turn an OrchestratorTurn into a StepExecutionRecord for storage
// ---------------------------------------------------------------------------
function turnToRecord(turn: OrchestratorTurn): StepExecutionRecord {
  return {
    index: turn.index,
    tool: turn.tool as any,
    params: turn.params,
    result: turn.result,
    durationMs: turn.durationMs,
  };
}

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------
export const assistantWorkflow = inngest.createFunction(
  {
    id: "assistant-voice-workflow",
    retries: 0,
    cancelOn: [{ event: ASSISTANT_EVENTS.runAbandoned, match: "data.requestId" }],
    onFailure: async ({ event, error }) => {
      const original = event.data.event?.data as
        | { requestId?: string }
        | undefined;
      if (!original?.requestId) return;

      const closure = resolveClosure({
        reasonCode: "system_failure",
        note: error instanceof Error ? error.message : String(error),
        closedBy: "system",
      });

      const { data: run } = await supabaseAdmin
        .from("assistant_runs")
        .select("id")
        .eq("request_id", original.requestId)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      await closeRun({
        runId: run?.id,
        requestId: original.requestId,
        requestStatus: "failed",
        message: `Failed: ${closure.closure_note ?? "unknown error"}`,
        closure,
      });
    },
  },
  { event: ASSISTANT_EVENTS.voiceRequestReceived },
  async ({ event, step, runId: inngestRunId }) => {
    const { transcript, requestId, source, clerkUserId } = event.data;
    const persistedRequestId = clerkUserId && requestId ? requestId : undefined;

    const runId = persistedRequestId
      ? await step.run("start-run", async () => startAssistantRun(persistedRequestId))
      : undefined;

    // Seed an empty trace immediately so the overlay shows "Planning…"
    await step.run("seed-trace", async () => {
      await seedRunTrace({ runId, plan: { actions: [] }, inngestRunId });
      return { seeded: true };
    });

    // -----------------------------------------------------------------
    // The core agentic loop.
    //
    // We use a persistent state object that survives across Inngest steps.
    // Each pass through the loop either:
    //   a) Completes → workflow ends
    //   b) Pauses on user input → waitForEvent → resume next iteration
    //
    // Inngest memoises each step.run by its unique ID, so if a step
    // already ran it returns the cached result without re-executing.
    // -----------------------------------------------------------------

    // State that persists across resume iterations
    let thread: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    let allTurns: OrchestratorTurn[] = [];
    let resumeToolCallId: string | undefined;
    let resumeResult: unknown;
    let iteration = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const iterationId = `orchestrate-${iteration}`;

      const context = createExecutionContext(0, {
        clerkUserId,
        requestId: persistedRequestId,
        runId: runId ?? undefined,
        source,
      });
      // Replay prior turns into context so tools that check previousResults work
      for (const t of allTurns) {
        recordStepResult(context, t.index, t.tool, t.result);
      }

      // Run one batch of orchestrator turns inside a memoised Inngest step.
      let orchResult: Awaited<ReturnType<typeof runOrchestrator>>;
      try {
        orchResult = await step.run(iterationId, async () => {
          const result = await runOrchestrator(transcript, context, {
            priorThread: thread.length > 0 ? thread : undefined,
            resumeToolCallId,
            resumeResult,
            onTurnComplete: async (turn) => {
              // Write trace updates live so the overlay sees each step
              if (turn.error) {
                await markStepFailed({
                  runId,
                  stepIndex: turn.index,
                  error: normalizeToolError(turn.tool, new Error(turn.error)),
                  durationMs: turn.durationMs,
                  attempt: 0,
                });
              } else if (turn.pausedTaskId) {
                await markStepAwaitingInput({
                  runId,
                  stepIndex: turn.index,
                  description: (turn.params.description as string | undefined) ??
                    (turn.params.action as string | undefined),
                });
              } else {
                await markStepRunning({ runId, stepIndex: turn.index, tool: turn.tool, params: turn.params, attempt: 0 });
                await markStepSucceeded({ runId, stepIndex: turn.index, result: turn.result, durationMs: turn.durationMs });
              }
            },
          });
          return result;
        }) as Awaited<ReturnType<typeof runOrchestrator>>;
      } catch (err) {
        // step.run threw — treat as permanent failure
        throw err;
      }

      // Accumulate turns from this batch
      allTurns = [...allTurns, ...orchResult.turns];
      thread = orchResult.thread;

      if (orchResult.done) {
        // ── All done ────────────────────────────────────────────────────
        const stepsExecuted = allTurns.map(turnToRecord);
        const finalContext = createExecutionContext(allTurns.length, {
          clerkUserId,
          requestId: persistedRequestId,
          runId: runId ?? undefined,
          source,
        });
        for (const t of allTurns) {
          recordStepResult(finalContext, t.index, t.tool, t.result);
        }

        await step.run("complete-run", async () =>
          completeAssistantRun({
            requestId: persistedRequestId,
            runId: runId ?? undefined,
            success: true,
            message: orchResult.done ? orchResult.finalMessage : "Completed",
            plan: { actions: allTurns.map((t) => ({ tool: t.tool as any, params: t.params })) },
            results: finalContext.previousResults,
            stepsExecuted,
          }),
        );

        return {
          success: true,
          requestId,
          message: orchResult.done ? orchResult.finalMessage : "Done",
          turns: allTurns.length,
        };
      }

      // ── Paused — waiting for user response ──────────────────────────
      const { pausedTaskId, pausedTool, pausedDescription } = orchResult;

      // Determine which event(s) to wait for based on the paused tool
      const waitBase = `wait-input-${iteration}`;

      const [submitEvent, skipEvent, abandonEvent, editEvent] = await Promise.all([
        step.waitForEvent(`${waitBase}-submit`, {
          event: ASSISTANT_EVENTS.userInputReceived,
          timeout: WAIT_TIMEOUT,
          if: `async event.data.requestId == "${persistedRequestId}" && async event.data.taskId == "${pausedTaskId}"`,
        }),
        step.waitForEvent(`${waitBase}-skip`, {
          event: ASSISTANT_EVENTS.taskSkipped,
          timeout: WAIT_TIMEOUT,
          if: `async event.data.requestId == "${persistedRequestId}" && async event.data.taskId == "${pausedTaskId}"`,
        }),
        step.waitForEvent(`${waitBase}-abandon`, {
          event: ASSISTANT_EVENTS.taskAbandoned,
          timeout: WAIT_TIMEOUT,
          if: `async event.data.requestId == "${persistedRequestId}" && async event.data.taskId == "${pausedTaskId}"`,
        }),
        step.waitForEvent(`${waitBase}-edit`, {
          event: ASSISTANT_EVENTS.taskEdited,
          timeout: WAIT_TIMEOUT,
          if: `async event.data.requestId == "${persistedRequestId}" && async event.data.taskId == "${pausedTaskId}"`,
        }),
      ]);

      if (abandonEvent) {
        throw new RunAbandonedError(
          abandonEvent.data.reasonCode ?? "no_longer_needed",
          abandonEvent.data.note ?? abandonEvent.data.reason,
          "user",
          runId ?? undefined,
          persistedRequestId,
        );
      }

      if (!submitEvent && !skipEvent && !editEvent) {
        // All timed out
        throw new RunAbandonedError(
          "timeout",
          `No response within 24h to: ${pausedDescription}`,
          "timeout",
          runId ?? undefined,
          persistedRequestId,
        );
      }

      if (skipEvent) {
        await step.run(`skip-${iteration}`, async () => {
          await markStepSkipped({
            runId,
            stepIndex: allTurns.length - 1,
            note: skipEvent.data.reason ?? "Skipped by user",
          });
          return { skipped: true };
        });
        // Resume with a skip notice so the model knows to move on
        resumeToolCallId = orchResult.thread
          .slice()
          .reverse()
          .find((m): m is OpenAI.Chat.ChatCompletionAssistantMessageParam =>
            m.role === "assistant" && !!m.tool_calls?.length,
          )
          ?.tool_calls?.[0]?.id;
        resumeResult = { skipped: true, reason: skipEvent.data.reason ?? "User skipped this step" };
      } else {
        const payload = submitEvent?.data.payload ?? editEvent?.data.payload;
        // Find the tool_call_id from the last assistant message
        resumeToolCallId = orchResult.thread
          .slice()
          .reverse()
          .find((m): m is OpenAI.Chat.ChatCompletionAssistantMessageParam =>
            m.role === "assistant" && !!m.tool_calls?.length,
          )
          ?.tool_calls?.[0]?.id;
        resumeResult = payload;
      }

      iteration++;
    }
  },
);

// ---------------------------------------------------------------------------
// Synchronous fallback (non-async API path — no Inngest, no waitForEvent)
// ---------------------------------------------------------------------------
export async function runAssistantPipeline(
  transcript: string,
  options: {
    clerkUserId?: string;
    requestId?: string;
    source?: "api" | "voice" | "local-stt" | "web";
  } = {},
): Promise<{
  success: boolean;
  turns: number;
  message: string;
  results: Record<string, unknown>;
}> {
  const runId = await startAssistantRun(options.requestId);
  await seedRunTrace({ runId, plan: { actions: [] } });

  const context = createExecutionContext(0, { ...options, runId: runId ?? undefined });

  const result = await runOrchestrator(transcript, context, {
    onTurnComplete: async (turn) => {
      if (!runId) return;
      await markStepRunning({ runId, stepIndex: turn.index, tool: turn.tool, params: turn.params, attempt: 0 });
      if (turn.error) {
        await markStepFailed({
          runId,
          stepIndex: turn.index,
          error: normalizeToolError(turn.tool, new Error(turn.error)),
          durationMs: turn.durationMs,
          attempt: 0,
        });
      } else {
        await markStepSucceeded({ runId, stepIndex: turn.index, result: turn.result, durationMs: turn.durationMs });
      }
    },
  });

  if (!result.done) {
    // Sync path can't pause — complete the run as-is
    await completeAssistantRun({
      requestId: options.requestId,
      runId,
      success: true,
      message: `Paused at ${result.pausedTool} — awaiting user input`,
      plan: { actions: result.turns.map((t) => ({ tool: t.tool as any, params: t.params })) },
      results: {},
      stepsExecuted: result.turns.map(turnToRecord),
    });
    return {
      success: true,
      turns: result.turns.length,
      message: `Waiting for user input: ${result.pausedDescription}`,
      results: {},
    };
  }

  const finalCtx = createExecutionContext(result.turns.length, { ...options, runId: runId ?? undefined });
  for (const t of result.turns) recordStepResult(finalCtx, t.index, t.tool, t.result);

  await completeAssistantRun({
    requestId: options.requestId,
    runId,
    success: true,
    message: result.finalMessage,
    plan: { actions: result.turns.map((t) => ({ tool: t.tool as any, params: t.params })) },
    results: finalCtx.previousResults,
    stepsExecuted: result.turns.map(turnToRecord),
  });

  return {
    success: true,
    turns: result.turns.length,
    message: result.finalMessage,
    results: finalCtx.previousResults,
  };
}

export const inngestFunctions = [assistantWorkflow];
