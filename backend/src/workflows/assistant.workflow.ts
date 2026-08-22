import { createPlan } from "../ai/planner.js";
import { executeAction } from "../tools/registry.js";
import {
  createExecutionContext,
  recordStepResult,
  resolveActionParams,
} from "../utils/context.js";
import type { ExecutionPlan, StepExecutionRecord } from "../types/index.js";
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
  markStepUserRetry,
  seedRunTrace,
} from "../services/run-trace.service.js";
import {
  closeRun,
  createHandbackTask,
  resolveClosure,
  teachFromClosure,
  type ClosedBy,
} from "../services/closure.service.js";
import { describeStep, normalizeToolError, type NormalizedToolError } from "../utils/tool-errors.js";
import { NonRetriableError } from "inngest";
import { ASSISTANT_EVENTS, inngest } from "./inngest.js";

/** Must match `retries` in the function config below. */
const MAX_STEP_RETRIES = 3;

/** How many times a human may re-run one permanently failed step. */
const MAX_USER_RETRIES = 3;

/** Window a task can stay open before the run closes itself out. */
const WAIT_TIMEOUT = "24h";
const WAIT_TIMEOUT_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Error class used to signal a user-initiated run abandonment from inside
// the waitForEvent loop so the outer catch block can handle it cleanly.
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

type StepOutcome =
  | { ok: true; record: StepExecutionRecord }
  | { ok: false; error: NormalizedToolError; durationMs: number };

/** Which buttons the desktop should offer for a given failure. */
function actionsForFailure(error: NormalizedToolError, canRetry: boolean): string[] {
  const actions: string[] = [];
  if (error.kind === "auth") actions.push("reconnect");
  if (canRetry) actions.push("retry");
  actions.push("skip", "abandon");
  return actions;
}

// ---------------------------------------------------------------------------
// Main Inngest workflow
// ---------------------------------------------------------------------------
export const assistantWorkflow = inngest.createFunction(
  {
    id: "assistant-voice-workflow",
    retries: MAX_STEP_RETRIES,
    // Kill the whole workflow if the dashboard sends a run_abandoned event
    // whose data.requestId matches the triggering event's data.requestId.
    cancelOn: [
      {
        event: ASSISTANT_EVENTS.runAbandoned,
        match: "data.requestId",
      },
    ],
    // Reached only when the function itself dies — a planner outage, a bad
    // deploy, an unhandled throw. Cancellations do not come through here,
    // which is why run-level abandon writes its own closure in the handler.
    onFailure: async ({ event, error }) => {
      const original = event.data.event?.data as
        | { requestId?: string; clerkUserId?: string; transcript?: string }
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
        message: `Failed after retries: ${closure.closure_note ?? "unknown error"}`,
        closure,
      });
    },
  },
  { event: ASSISTANT_EVENTS.voiceRequestReceived },
  async ({ event, step, runId: inngestRunId, attempt }) => {
    const { transcript, requestId, source, clerkUserId } = event.data;
    const persistedRequestId = clerkUserId && requestId ? requestId : undefined;

    const runId = persistedRequestId
      ? await step.run("start-run", async () => startAssistantRun(persistedRequestId))
      : undefined;

    try {
      const plan = await step.run("planner", async () => {
        return createPlan(transcript, { clerkUserId });
      });

      // Persist intent before executing it so the overlay can show the whole
      // plan up front instead of one step at a time.
      await step.run("seed-trace", async () => {
        await seedRunTrace({ runId, plan, inngestRunId });
        return { seeded: plan.actions.length };
      });

      const stepsExecuted: StepExecutionRecord[] = [];

      for (let i = 0; i < plan.actions.length; i++) {
        const action = plan.actions[i]!;
        const stepTitle = describeStep(action.tool, action.params);
        let userRetry = 0;
        let stepResult: StepExecutionRecord | null = null;

        // Inner loop exists only for human-requested retries. Each pass uses a
        // fresh Inngest step id — replaying the original id would hand back the
        // memoized failure instead of executing anything.
        for (;;) {
          const stepId =
            userRetry === 0
              ? `execute-${i}-${action.tool}`
              : `execute-${i}-${action.tool}-r${userRetry}`;

          // `attempt` on the function handler is the function attempt, not the
          // step's. Using it to decide "last retry" would never hand a failed
          // step back — Inngest would exhaust the step, throw, and the run
          // would die. The contract is: throw so Inngest retries the step;
          // NonRetriableError skips remaining retries; a failed step.run
          // throws into this catch, which is where the human is asked.
          let outcome: StepOutcome;
          try {
            outcome = await step.run(stepId, async () => {
              const context = createExecutionContext(plan.actions.length, {
                clerkUserId,
                requestId: persistedRequestId,
                source,
              });
              for (const prev of stepsExecuted) {
                recordStepResult(context, prev.index, prev.tool, prev.result);
              }

              await markStepRunning({
                runId,
                stepIndex: i,
                tool: action.tool,
                params: action.params,
                attempt,
              });

              const started = Date.now();
              try {
                const result = await executeAction(action, context, i);
                const durationMs = Date.now() - started;

                await markStepSucceeded({ runId, stepIndex: i, result, durationMs });

                return {
                  ok: true as const,
                  record: {
                    index: i,
                    tool: action.tool,
                    params: resolveActionParams(action.params, context),
                    result,
                    durationMs,
                  } satisfies StepExecutionRecord,
                };
              } catch (err) {
                const durationMs = Date.now() - started;
                const normalized = normalizeToolError(action.tool, err);

                await markStepFailed({
                  runId,
                  stepIndex: i,
                  error: normalized,
                  durationMs,
                  attempt,
                });

                if (!normalized.retryable) {
                  throw new NonRetriableError(normalized.message, { cause: err });
                }
                throw err;
              }
            });
          } catch (err) {
            outcome = {
              ok: false,
              error: normalizeToolError(action.tool, err),
              durationMs: 0,
            };
          }

          if (outcome.ok) {
            stepResult = outcome.record;
            break;
          }

          // ------------------------------------------------------------------
          // Permanent failure. Hand the decision back to the human rather than
          // guessing whether the rest of the plan still makes sense.
          // ------------------------------------------------------------------
          const canRetry = userRetry < MAX_USER_RETRIES;
          const waitExpiresAt = new Date(Date.now() + WAIT_TIMEOUT_MS).toISOString();

          const taskId = persistedRequestId && clerkUserId
            ? await step.run(`handback-${i}-${userRetry}`, async () =>
                createHandbackTask({
                  clerkUserId,
                  requestId: persistedRequestId,
                  stepIndex: i,
                  tool: action.tool,
                  title: stepTitle,
                  error: outcome.error,
                  actions: actionsForFailure(outcome.error, canRetry),
                  waitExpiresAt,
                }),
              )
            : undefined;

          if (!taskId) {
            // Nothing to ask, nobody to ask. Close out with the failure.
            throw new RunAbandonedError(
              "system_failure",
              outcome.error.message,
              "system",
              runId ?? undefined,
              persistedRequestId,
            );
          }

          const decision = await step.waitForEvent(`wait-decision-${i}-${userRetry}`, {
            event: ASSISTANT_EVENTS.stepDecision,
            timeout: WAIT_TIMEOUT,
            if: `async event.data.requestId == "${persistedRequestId}" && async event.data.taskId == "${taskId}"`,
          });

          if (!decision) {
            throw new RunAbandonedError(
              "timeout",
              `No decision within 24h after ${stepTitle} failed: ${outcome.error.message}`,
              "timeout",
              runId ?? undefined,
              persistedRequestId,
            );
          }

          const choice = decision.data.decision as "retry" | "skip" | "abandon";

          if (choice === "abandon") {
            throw new RunAbandonedError(
              decision.data.reasonCode ?? "ai_got_it_wrong",
              decision.data.note,
              "user",
              runId ?? undefined,
              persistedRequestId,
            );
          }

          if (choice === "retry" && canRetry) {
            await step.run(`mark-retry-${i}-${userRetry}`, async () =>
              markStepUserRetry({ runId, stepIndex: i }),
            );
            userRetry += 1;
            continue;
          }

          // Skip, or a retry we can no longer honour.
          await step.run(`mark-skipped-${i}-${userRetry}`, async () => {
            await markStepSkipped({
              runId,
              stepIndex: i,
              note: decision.data.note ?? outcome.error.message,
            });
            return { skipped: true };
          });

          stepResult = {
            index: i,
            tool: action.tool,
            params: action.params,
            result: {
              skipped: true,
              reason: decision.data.note ?? outcome.error.message,
              error: outcome.error.message,
            },
            durationMs: outcome.durationMs,
          };
          break;
        }

        if (!stepResult) break;

        const stepOutput =
          typeof stepResult.result === "object" && stepResult.result !== null
            ? (stepResult.result as Record<string, unknown>)
            : null;

        // -----------------------------------------------------------------------
        // waitForEvent loop — only entered when the tool is request_user_input
        // and the tool succeeded in creating a pending_tasks row.
        //
        // We race four possible responses from the user:
        //   1. submit  (userInputReceived)  → inject user data and continue
        //   2. skip    (taskSkipped)        → mark skipped and continue
        //   3. abandon (taskAbandoned)      → throw, workflow stops
        //   4. edit    (taskEdited)         → inject edited payload and continue
        //
        // All four events are matched on data.requestId so that only events
        // originating from the same assistant request resume this workflow.
        // The taskId is also checked inside each branch for extra safety.
        // -----------------------------------------------------------------------
        if (action.tool === "request_user_input" && !stepOutput?.error && stepOutput?.taskId) {
          const taskId = stepOutput.taskId as string;

          await step.run(`awaiting-${i}`, async () => {
            await markStepAwaitingInput({
              runId,
              stepIndex: i,
              description: (action.params?.description as string | undefined) ?? stepTitle,
            });
            return { awaiting: true };
          });

          // Race all four possible dashboard responses simultaneously.
          const [submitEvent, skipEvent, abandonEvent, editEvent] = await Promise.all([
            step.waitForEvent(`wait-for-submit-${i}`, {
              event: ASSISTANT_EVENTS.userInputReceived,
              timeout: WAIT_TIMEOUT,
              if: `async event.data.requestId == "${persistedRequestId}" && async event.data.taskId == "${taskId}"`,
            }),
            step.waitForEvent(`wait-for-skip-${i}`, {
              event: ASSISTANT_EVENTS.taskSkipped,
              timeout: WAIT_TIMEOUT,
              if: `async event.data.requestId == "${persistedRequestId}" && async event.data.taskId == "${taskId}"`,
            }),
            step.waitForEvent(`wait-for-abandon-${i}`, {
              event: ASSISTANT_EVENTS.taskAbandoned,
              timeout: WAIT_TIMEOUT,
              if: `async event.data.requestId == "${persistedRequestId}" && async event.data.taskId == "${taskId}"`,
            }),
            step.waitForEvent(`wait-for-edit-${i}`, {
              event: ASSISTANT_EVENTS.taskEdited,
              timeout: WAIT_TIMEOUT,
              if: `async event.data.requestId == "${persistedRequestId}" && async event.data.taskId == "${taskId}"`,
            }),
          ]);

          // Only one should ever fire; check in priority order.
          if (abandonEvent) {
            // User abandoned this specific task — treat as full run abandonment.
            throw new RunAbandonedError(
              abandonEvent.data.reasonCode ?? "no_longer_needed",
              abandonEvent.data.note ?? abandonEvent.data.reason,
              "user",
              runId ?? undefined,
              persistedRequestId,
            );
          } else if (skipEvent) {
            stepOutput.skipped = true;
            stepOutput.skipReason = skipEvent.data.note ?? skipEvent.data.reason ?? "Skipped by user";
            await step.run(`skip-input-${i}`, async () => {
              await markStepSkipped({ runId, stepIndex: i, note: String(stepOutput.skipReason) });
              return { skipped: true };
            });
          } else if (submitEvent) {
            stepOutput.userInput = submitEvent.data.payload;
          } else if (editEvent) {
            stepOutput.userInput = editEvent.data.payload;
            stepOutput.editedFields = editEvent.data.editedFields ?? [];
          } else {
            // Nobody answered inside the wait window. That is an unresolved
            // follow-up, not a silent success.
            throw new RunAbandonedError(
              "timeout",
              `No response within 24h to: ${stepTitle}`,
              "timeout",
              runId ?? undefined,
              persistedRequestId,
            );
          }
        }

        // -----------------------------------------------------------------------
        // waitForEvent — Obsidian tools (local file I/O via desktop app)
        //
        // When an obsidian.* tool runs it inserts a row into obsidian_requests
        // and returns { obsidianRequestId }. The desktop app polls for pending
        // requests, executes the file operation locally, and POSTs the result
        // back. That POST fires obsidianResultReceived which we wait for here.
        // -----------------------------------------------------------------------
        if (
          action.tool.startsWith("obsidian.") &&
          !stepOutput?.error &&
          stepOutput?.obsidianRequestId
        ) {
          const obsidianRequestId = stepOutput.obsidianRequestId as string;

          const obsidianEvent = await step.waitForEvent(`wait-for-obsidian-${i}`, {
            event: ASSISTANT_EVENTS.obsidianResultReceived,
            timeout: "5m",
            if: `async event.data.obsidianRequestId == "${obsidianRequestId}"`,
          });

          if (obsidianEvent) {
            // Merge the desktop app's result into the step output so subsequent
            // steps can reference it (e.g. search results for append_to_note).
            stepOutput.obsidianResult = obsidianEvent.data.result;
          } else {
            stepOutput.error =
              "Obsidian request timed out — make sure the Clawvio desktop app is running.";
          }
        }

        stepsExecuted.push(stepResult);
      }

      const finalContext = createExecutionContext(plan.actions.length, {
        clerkUserId,
        requestId: persistedRequestId,
        source,
      });
      for (const stepRecord of stepsExecuted) {
        recordStepResult(finalContext, stepRecord.index, stepRecord.tool, stepRecord.result);
      }

      const message = `Completed ${stepsExecuted.length} step(s) for voice request`;
      await step.run("complete-run", async () =>
        completeAssistantRun({
          requestId: persistedRequestId,
          runId: runId ?? undefined,
          success: true,
          message,
          plan,
          results: finalContext.previousResults,
          stepsExecuted,
        }),
      );

      return {
        success: true,
        requestId,
        source,
        plan,
        stepsExecuted,
        results: finalContext.previousResults,
        message,
      };
    } catch (err) {
      if (err instanceof RunAbandonedError) {
        const closure = resolveClosure({
          reasonCode: err.reasonCode,
          note: err.note,
          closedBy: err.closedBy,
        });

        await step.run("close-run", async () => {
          await closeRun({
            runId: err.runId,
            requestId: err.requestId,
            requestStatus: "abandoned",
            message: `Closed: ${closure.abandonment_reason}`,
            closure,
          });
          await teachFromClosure({
            clerkUserId,
            closure,
            subject: transcript,
            requestId: err.requestId,
          });
          return { closed: true };
        });

        // Returning rather than re-throwing keeps this out of the failure
        // path — the user closing something is a normal outcome.
        return {
          success: false,
          abandoned: true,
          reasonCode: closure.closure_reason_code,
          reason: closure.abandonment_reason,
          followUpRequired: closure.follow_up_required,
          requestId,
        };
      }

      const message = err instanceof Error ? err.message : "Assistant workflow failed";
      await step.run("fail-run", async () =>
        completeAssistantRun({
          requestId: persistedRequestId,
          runId: runId ?? undefined,
          success: false,
          message,
          error: err,
        }),
      );
      throw err;
    }
  },
);

// ---------------------------------------------------------------------------
// Synchronous fallback (non-async API path) — no Inngest, no waitForEvent.
// request_user_input steps will still create pending_tasks rows but the caller
// is responsible for polling /assistant/tasks and re-submitting separately.
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
  plan: ExecutionPlan;
  stepsExecuted: StepExecutionRecord[];
  results: Record<string, unknown>;
  message: string;
}> {
  const runId = await startAssistantRun(options.requestId);
  const plan = await createPlan(transcript, { clerkUserId: options.clerkUserId });
  const context = createExecutionContext(plan.actions.length, options);
  const stepsExecuted: StepExecutionRecord[] = [];

  await seedRunTrace({ runId, plan });

  try {
    for (let i = 0; i < plan.actions.length; i++) {
      const action = plan.actions[i]!;
      const started = Date.now();

      await markStepRunning({
        runId,
        stepIndex: i,
        tool: action.tool,
        params: action.params,
        attempt: 0,
      });

      let result;
      try {
        result = await executeAction(action, context, i);
        await markStepSucceeded({ runId, stepIndex: i, result, durationMs: Date.now() - started });
      } catch (err) {
        const normalized = normalizeToolError(action.tool, err);
        await markStepFailed({
          runId,
          stepIndex: i,
          error: normalized,
          durationMs: Date.now() - started,
          attempt: 0,
        });
        result = { error: normalized.message, errorKind: normalized.kind, errorCode: normalized.code };
      }

      stepsExecuted.push({
        index: i,
        tool: action.tool,
        params: resolveActionParams(action.params, context),
        result,
        durationMs: Date.now() - started,
      });
    }

    const message = `Completed ${stepsExecuted.length} step(s)`;
    await completeAssistantRun({
      requestId: options.requestId,
      runId,
      success: true,
      message,
      plan,
      results: context.previousResults,
      stepsExecuted,
    });

    return {
      success: true,
      plan,
      stepsExecuted,
      results: context.previousResults,
      message,
    };
  } catch (err) {
    await completeAssistantRun({
      requestId: options.requestId,
      runId,
      success: false,
      message: err instanceof Error ? err.message : "Assistant pipeline failed",
      error: err,
      stepsExecuted,
    });
    throw err;
  }
}

export const inngestFunctions = [assistantWorkflow];
