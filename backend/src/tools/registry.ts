import { ToolNotFoundError, ToolExecutionError } from "../utils/errors.js";
import { resolveActionParams, recordStepResult } from "../utils/context.js";
import type {
  ExecutionContext,
  ExecutionPlan,
  ExecutePlanResult,
  PlannedAction,
  StepExecutionRecord,
  ToolName,
} from "../types/index.js";
import { calendarTools } from "./calendar/calendar.tool.js";
import { gmailTools } from "./gmail/gmail.tool.js";
import { meetTools } from "./meet/meet.tool.js";
import { sheetsTools } from "./sheets/sheets.tool.js";
import type { AnyToolDefinition, ToolMetadata } from "./types.js";
import { createExecutionContext } from "../utils/context.js";

const allTools: AnyToolDefinition[] = [
  ...sheetsTools,
  ...gmailTools,
  ...calendarTools,
  ...meetTools,
];

export const toolRegistry = Object.fromEntries(
  allTools.map((tool) => [tool.name, tool]),
) as Record<ToolName, AnyToolDefinition>;

export function getTool(name: string): AnyToolDefinition {
  const tool = toolRegistry[name as ToolName];
  if (!tool) {
    throw new ToolNotFoundError(name);
  }
  return tool;
}

export function listToolMetadata(): ToolMetadata[] {
  return allTools.map(({ name, description, paramsSchema, resultSchema }) => ({
    name,
    description,
    paramsSchema,
    resultSchema,
  }));
}

export async function executeAction(
  action: PlannedAction,
  context: ExecutionContext,
  stepIndex: number,
): Promise<unknown> {
  const tool = getTool(action.tool);
  const resolvedParams = resolveActionParams(action.params, context);

  let validatedParams: unknown;
  try {
    validatedParams = tool.paramsSchema.parse(resolvedParams);
  } catch (err) {
    throw new ToolExecutionError(action.tool, err);
  }

  try {
    const result = await tool.execute(validatedParams, context);
    const validatedResult = tool.resultSchema.parse(result);
    recordStepResult(context, stepIndex, action.tool, validatedResult);
    return validatedResult;
  } catch (err) {
    throw new ToolExecutionError(action.tool, err);
  }
}

export async function executePlan(plan: ExecutionPlan): Promise<ExecutePlanResult> {
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
    stepsExecuted,
    results: context.previousResults,
    plan,
  };
}

export { allTools };
