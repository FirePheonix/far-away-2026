import { createPlan } from "../ai/planner.js";
import { executeAction } from "../tools/registry.js";
import {
  createExecutionContext,
  recordStepResult,
  resolveActionParams,
} from "../utils/context.js";
import type { ExecutionPlan, StepExecutionRecord } from "../types/index.js";
import { ASSISTANT_EVENTS, inngest } from "./inngest.js";

export const assistantWorkflow = inngest.createFunction(
  {
    id: "assistant-voice-workflow",
    retries: 3,
  },
  { event: ASSISTANT_EVENTS.voiceRequestReceived },
  async ({ event, step }) => {
    const { transcript, requestId, source } = event.data;

    const plan = await step.run("planner", async () => {
      return createPlan(transcript);
    });

    const stepsExecuted: StepExecutionRecord[] = [];

    for (let i = 0; i < plan.actions.length; i++) {
      const action = plan.actions[i]!;
      const stepId = `execute-${i}-${action.tool}`;

      const stepResult = await step.run(stepId, async () => {
        const context = createExecutionContext(plan.actions.length);
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

    const finalContext = createExecutionContext(plan.actions.length);
    for (const stepRecord of stepsExecuted) {
      recordStepResult(finalContext, stepRecord.index, stepRecord.tool, stepRecord.result);
    }

    return {
      success: true,
      requestId,
      source,
      plan,
      stepsExecuted,
      results: finalContext.previousResults,
      message: `Completed ${stepsExecuted.length} step(s) for voice request`,
    };
  },
);

export async function runAssistantPipeline(transcript: string): Promise<{
  success: boolean;
  plan: ExecutionPlan;
  stepsExecuted: StepExecutionRecord[];
  results: Record<string, unknown>;
  message: string;
}> {
  const plan = await createPlan(transcript);
  const context = createExecutionContext(plan.actions.length);
  const stepsExecuted: StepExecutionRecord[] = [];

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

  return {
    success: true,
    plan,
    stepsExecuted,
    results: context.previousResults,
    message: `Completed ${stepsExecuted.length} step(s)`,
  };
}

export const inngestFunctions = [assistantWorkflow];
