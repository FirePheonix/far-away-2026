import { createPlan } from "../ai/planner.js";
import { executeAction } from "../tools/registry.js";
import {
  createExecutionContext,
  recordStepResult,
  resolveActionParams,
} from "../utils/context.js";
import type { ExecutionPlan, StepExecutionRecord } from "../types/index.js";
import {
  completeAssistantRun,
  startAssistantRun,
} from "../services/assistant-runs.service.js";
import { ASSISTANT_EVENTS, inngest } from "./inngest.js";

export const assistantWorkflow = inngest.createFunction(
  {
    id: "assistant-voice-workflow",
    retries: 3,
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
        return createPlan(transcript);
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
          const result = await executeAction(action, context, i);
          return {
            index: i,
            tool: action.tool,
            params: resolveActionParams(action.params, context),
            result,
            durationMs: Date.now() - started,
          } satisfies StepExecutionRecord;
        });

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
  const plan = await createPlan(transcript);
  const context = createExecutionContext(plan.actions.length, options);
  const stepsExecuted: StepExecutionRecord[] = [];

  try {
    for (let i = 0; i < plan.actions.length; i++) {
      const action = plan.actions[i]!;
      const started = Date.now();
      const result = await executeAction(action, context, i);

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
