import type { ExecutionContext } from "../types/index.js";

export function createExecutionContext(
  totalSteps = 0,
  options: {
    clerkUserId?: string;
    requestId?: string;
    source?: "api" | "voice" | "local-stt" | "web";
  } = {},
): ExecutionContext {
  return {
    previousResults: {},
    variables: {},
    user: {
      clerkUserId: options.clerkUserId,
    },
    request: {
      id: options.requestId,
      source: options.source,
    },
    executionState: {
      currentStep: 0,
      totalSteps,
      lastResult: null,
      startedAt: new Date().toISOString(),
    },
  };
}

export function recordStepResult(
  context: ExecutionContext,
  stepIndex: number,
  tool: string,
  result: unknown,
): void {
  const key = `step_${stepIndex}`;
  context.previousResults[key] = result;
  context.previousResults[tool] = result;
  context.executionState.lastResult = result;
  context.executionState.currentStep = stepIndex + 1;
}

/**
 * Resolves planner params that reference prior step outputs.
 * Supports flags like emailFromPreviousStep, dataFromPreviousStep, subjectFromPreviousStep.
 */
export function resolveActionParams(
  params: Record<string, unknown>,
  context: ExecutionContext,
): Record<string, unknown> {
  const resolved = { ...params };
  const last = context.executionState.lastResult;

  if (resolved.emailFromPreviousStep === true) {
    const email = extractEmail(last);
    if (email) resolved.to = email;
    delete resolved.emailFromPreviousStep;
  }

  if (resolved.dataFromPreviousStep === true) {
    resolved.data = last;
    delete resolved.dataFromPreviousStep;
  }

  if (resolved.subjectFromPreviousStep === true) {
    const subject = extractSubject(last);
    if (subject) resolved.subject = subject;
    delete resolved.subjectFromPreviousStep;
  }

  if (resolved.bodyFromPreviousStep === true) {
    resolved.body = formatBodyFromResult(last);
    delete resolved.bodyFromPreviousStep;
  }

  if (typeof resolved.fromStep === "number") {
    const stepKey = `step_${resolved.fromStep}`;
    const stepResult = context.previousResults[stepKey];
    if (stepResult !== undefined) {
      resolved.data = stepResult;
    }
    delete resolved.fromStep;
  }

  return resolved;
}

function extractEmail(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  if (typeof obj.email === "string") return obj.email;
  if (typeof obj.to === "string") return obj.to;
  if (Array.isArray(obj.values)) {
    const flat = obj.values.flat() as unknown[];
    const found = flat.find((v) => typeof v === "string" && v.includes("@"));
    return typeof found === "string" ? found : undefined;
  }
  return undefined;
}

function extractSubject(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  if (typeof obj.subject === "string") return obj.subject;
  if (typeof obj.name === "string") return `Regarding ${obj.name}`;
  return undefined;
}

function formatBodyFromResult(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
