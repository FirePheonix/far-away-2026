import { createPlan } from "../ai/planner.js";
import { executeAction } from "../tools/registry.js";
import {
  createExecutionContext,
  recordStepResult,
  resolveActionParams,
} from "../utils/context.js";
import type { ExecutionPlan, StepExecutionRecord } from "../types/index.js";
import {
  abandonAssistantRun,
  completeAssistantRun,
  startAssistantRun,
} from "../services/assistant-runs.service.js";
import { ASSISTANT_EVENTS, inngest } from "./inngest.js";

// ---------------------------------------------------------------------------
// Error class used to signal a user-initiated run abandonment from inside
// the waitForEvent loop so the outer catch block can handle it cleanly.
// ---------------------------------------------------------------------------
class RunAbandonedError extends Error {
  constructor(
    public readonly reason: string,
    public readonly runId?: string,
    public readonly requestId?: string,
  ) {
    super(`Run abandoned by user: ${reason}`);
    this.name = "RunAbandonedError";
  }
}

// ---------------------------------------------------------------------------
// Main Inngest workflow
// ---------------------------------------------------------------------------
export const assistantWorkflow = inngest.createFunction(
  {
    id: "assistant-voice-workflow",
    retries: 3,
    // Kill the whole workflow if the dashboard sends a run_abandoned event
    // whose data.requestId matches the triggering event's data.requestId.
    cancelOn: [
      {
        event: ASSISTANT_EVENTS.runAbandoned,
        match: "data.requestId",
      },
    ],
  },
  { event: ASSISTANT_EVENTS.voiceRequestReceived },
  async ({ event, step }) => {
    const { transcript, requestId, source, clerkUserId } = event.data;
    const persistedRequestId = clerkUserId && requestId ? requestId : undefined;

    const runId = persistedRequestId
      ? await step.run("start-run", async () => startAssistantRun(persistedRequestId))
      : undefined;

    try {
      const plan = await step.run("planner", async () => {
        return createPlan(transcript, { clerkUserId });
      });

      const stepsExecuted: StepExecutionRecord[] = [];

      for (let i = 0; i < plan.actions.length; i++) {
        const action = plan.actions[i]!;
        const stepId = `execute-${i}-${action.tool}`;

        const stepResult = await step.run(stepId, async () => {
          const context = createExecutionContext(plan.actions.length, {
            clerkUserId,
            requestId: persistedRequestId,
            source,
          });
          for (const prev of stepsExecuted) {
            recordStepResult(context, prev.index, prev.tool, prev.result);
          }

          const started = Date.now();
          let result;
          try {
            result = await executeAction(action, context, i);
          } catch (err) {
            console.error(`Error executing tool ${action.tool}:`, err);
            result = { error: err instanceof Error ? err.message : String(err) };
          }

          return {
            index: i,
            tool: action.tool,
            params: resolveActionParams(action.params, context),
            result,
            durationMs: Date.now() - started,
          } satisfies StepExecutionRecord;
        });

        const stepOutput =
          typeof stepResult.result === "object" && stepResult.result !== null
            ? (stepResult.result as Record<string, unknown>)
            : null;

        // -----------------------------------------------------------------------
        // waitForEvent loop — only entered when the tool is request_user_input
        // and the tool succeeded in creating a pending_tasks row.
        //
        // We race three possible responses from the dashboard:
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

          // Race all four possible dashboard responses simultaneously.
          const [submitEvent, skipEvent, abandonEvent, editEvent] = await Promise.all([
            step.waitForEvent(`wait-for-submit-${i}`, {
              event: ASSISTANT_EVENTS.userInputReceived,
              timeout: "24h",
              if: `async event.data.requestId == "${persistedRequestId}" && async event.data.taskId == "${taskId}"`,
            }),
            step.waitForEvent(`wait-for-skip-${i}`, {
              event: ASSISTANT_EVENTS.taskSkipped,
              timeout: "24h",
              if: `async event.data.requestId == "${persistedRequestId}" && async event.data.taskId == "${taskId}"`,
            }),
            step.waitForEvent(`wait-for-abandon-${i}`, {
              event: ASSISTANT_EVENTS.taskAbandoned,
              timeout: "24h",
              if: `async event.data.requestId == "${persistedRequestId}" && async event.data.taskId == "${taskId}"`,
            }),
            step.waitForEvent(`wait-for-edit-${i}`, {
              event: ASSISTANT_EVENTS.taskEdited,
              timeout: "24h",
              if: `async event.data.requestId == "${persistedRequestId}" && async event.data.taskId == "${taskId}"`,
            }),
          ]);

          // Only one should ever fire; check in priority order.
          if (abandonEvent) {
            // User abandoned this specific task — treat as full run abandonment.
            const reason: string = abandonEvent.data.reason ?? "User abandoned task";
            throw new RunAbandonedError(reason, runId ?? undefined, persistedRequestId);
          } else if (skipEvent) {
            stepOutput.skipped = true;
            stepOutput.skipReason = skipEvent.data.reason ?? "Skipped by user";
          } else if (submitEvent) {
            stepOutput.userInput = submitEvent.data.payload;
          } else if (editEvent) {
            stepOutput.userInput = editEvent.data.payload;
            stepOutput.editedFields = editEvent.data.editedFields ?? [];
          } else {
            // All four timed out (24 h).
            stepOutput.error = "User input timeout — no response within 24 hours";
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
        // Record abandonment separately so we get the reason stored in the DB.
        await step.run("abandon-run", async () =>
          abandonAssistantRun({
            requestId: err.requestId,
            runId: err.runId,
            reason: err.reason,
          }),
        );
        // Return a structured result instead of re-throwing so Inngest marks
        // this as a successful function completion (not a retriable error).
        return {
          success: false,
          abandoned: true,
          reason: err.reason,
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

  try {
    for (let i = 0; i < plan.actions.length; i++) {
      const action = plan.actions[i]!;
      const started = Date.now();

      let result;
      try {
        result = await executeAction(action, context, i);
      } catch (err) {
        console.error(`Error executing tool ${action.tool}:`, err);
        result = { error: err instanceof Error ? err.message : String(err) };
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
