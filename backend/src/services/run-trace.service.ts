/**
 * Live trace of a run: one assistant_steps row per planned action, upserted as
 * the step moves through its lifecycle so the desktop can draw the agent flow
 * while it is still executing.
 *
 * Every function here swallows its own errors. Losing a progress write should
 * degrade the overlay, never fail the user's actual work.
 */

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { describeStep, type NormalizedToolError } from "../utils/tool-errors.js";
import type { ExecutionPlan } from "../types/index.js";

export type StepStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "awaiting_input"
  | "abandoned";

type StepPatch = Record<string, unknown>;

async function upsertStep(runId: string, stepIndex: number, patch: StepPatch): Promise<void> {
  const { error } = await supabaseAdmin.from("assistant_steps").upsert(
    {
      id: randomUUID(),
      run_id: runId,
      step_index: stepIndex,
      ...patch,
    },
    { onConflict: "run_id,step_index" },
  );

  if (error) {
    console.error(`[RunTrace] step ${stepIndex} upsert failed:`, error.message);
  }
}

/**
 * Called once the planner returns. Persists the plan and seeds a pending row
 * per action so the overlay can show intent before anything runs.
 */
export async function seedRunTrace(params: {
  runId?: string | null;
  plan: ExecutionPlan;
  inngestRunId?: string | null;
}): Promise<void> {
  if (!params.runId) return;

  try {
    await supabaseAdmin
      .from("assistant_runs")
      .update({
        plan_json: params.plan,
        total_steps: params.plan.actions.length,
        current_step_index: 0,
        inngest_run_id: params.inngestRunId ?? null,
      })
      .eq("id", params.runId);

    if (!params.plan.actions.length) return;

    const rows = params.plan.actions.map((action, index) => ({
      id: randomUUID(),
      run_id: params.runId!,
      step_index: index,
      tool_name: action.tool,
      title: describeStep(action.tool, action.params),
      params_json: action.params ?? null,
      status: "pending" as StepStatus,
      attempt: 0,
    }));

    const { error } = await supabaseAdmin
      .from("assistant_steps")
      .upsert(rows, { onConflict: "run_id,step_index" });

    if (error) console.error("[RunTrace] seed failed:", error.message);
  } catch (err) {
    console.error("[RunTrace] seed threw:", err);
  }
}

export async function markStepRunning(params: {
  runId?: string | null;
  stepIndex: number;
  tool: string;
  params?: Record<string, unknown>;
  attempt: number;
}): Promise<void> {
  if (!params.runId) return;

  try {
    // Each retry re-runs this body, so increment from the stored count rather
    // than trusting the function-level Inngest `attempt` (which stays 0).
    const { data: existing } = await supabaseAdmin
      .from("assistant_steps")
      .select("attempt")
      .eq("run_id", params.runId)
      .eq("step_index", params.stepIndex)
      .maybeSingle();
    const nextAttempt = Math.max(params.attempt, ((existing?.attempt as number | null) ?? 0) + 1);

    await upsertStep(params.runId, params.stepIndex, {
      tool_name: params.tool,
      title: describeStep(params.tool, params.params),
      params_json: params.params ?? null,
      status: "running",
      attempt: nextAttempt,
      started_at: new Date().toISOString(),
      finished_at: null,
      error_kind: null,
      error_code: null,
      error_message: null,
      error_detail: null,
      retryable: null,
      success: null,
    });

    await supabaseAdmin
      .from("assistant_runs")
      .update({ current_step_index: params.stepIndex })
      .eq("id", params.runId);
  } catch (err) {
    console.error("[RunTrace] markStepRunning threw:", err);
  }
}

export async function markStepSucceeded(params: {
  runId?: string | null;
  stepIndex: number;
  result: unknown;
  durationMs: number;
}): Promise<void> {
  if (!params.runId) return;

  try {
    await upsertStep(params.runId, params.stepIndex, {
      status: "succeeded",
      success: true,
      result_json: params.result ?? null,
      duration_ms: params.durationMs,
      finished_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[RunTrace] markStepSucceeded threw:", err);
  }
}

export async function markStepFailed(params: {
  runId?: string | null;
  stepIndex: number;
  error: NormalizedToolError;
  durationMs: number;
  attempt: number;
}): Promise<void> {
  if (!params.runId) return;

  try {
    await upsertStep(params.runId, params.stepIndex, {
      status: "failed",
      success: false,
      duration_ms: params.durationMs,
      finished_at: new Date().toISOString(),
      error_kind: params.error.kind,
      error_code: params.error.code,
      error_message: params.error.message,
      error_detail: params.error.detail ?? null,
      retryable: params.error.retryable,
    });
  } catch (err) {
    console.error("[RunTrace] markStepFailed threw:", err);
  }
}

export async function markStepAwaitingInput(params: {
  runId?: string | null;
  stepIndex: number;
  description?: string | null;
}): Promise<void> {
  if (!params.runId) return;

  try {
    await upsertStep(params.runId, params.stepIndex, {
      status: "awaiting_input",
      title: params.description ?? "Waiting on you",
    });
  } catch (err) {
    console.error("[RunTrace] markStepAwaitingInput threw:", err);
  }
}

export async function markStepSkipped(params: {
  runId?: string | null;
  stepIndex: number;
  note?: string | null;
}): Promise<void> {
  if (!params.runId) return;

  try {
    await upsertStep(params.runId, params.stepIndex, {
      status: "skipped",
      success: false,
      finished_at: new Date().toISOString(),
      error_kind: null,
      error_code: "SKIPPED",
      error_message: params.note ?? "Skipped",
      retryable: false,
    });
  } catch (err) {
    console.error("[RunTrace] markStepSkipped threw:", err);
  }
}

/**
 * A human asked to run a failed step again. The count is part of the Inngest
 * step id on the next attempt, which is what stops the memoized failure from
 * being replayed instead of re-executed.
 */
export async function markStepUserRetry(params: {
  runId?: string | null;
  stepIndex: number;
}): Promise<number> {
  if (!params.runId) return 0;

  try {
    const { data } = await supabaseAdmin
      .from("assistant_steps")
      .select("user_retry_count")
      .eq("run_id", params.runId)
      .eq("step_index", params.stepIndex)
      .maybeSingle();

    const next = ((data?.user_retry_count as number | null) ?? 0) + 1;

    await upsertStep(params.runId, params.stepIndex, {
      status: "pending",
      user_retry_count: next,
      error_kind: null,
      error_code: null,
      error_message: null,
      error_detail: null,
    });

    return next;
  } catch (err) {
    console.error("[RunTrace] markStepUserRetry threw:", err);
    return 0;
  }
}

export interface TraceStep {
  step_index: number;
  tool_name: string | null;
  title: string | null;
  status: string;
  attempt: number;
  user_retry_count: number;
  error_kind: string | null;
  error_code: string | null;
  error_message: string | null;
  duration_ms: number | null;
}

/**
 * Everything the desktop needs for one request: the run, its ordered steps,
 * and any open task blocking it.
 */
export async function loadTrace(requestId: string, clerkUserId: string) {
  const { data: request, error: requestError } = await supabaseAdmin
    .from("assistant_requests")
    .select("id, transcript, status, source, created_at")
    .eq("id", requestId)
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (requestError) throw new Error(requestError.message);
  if (!request) return null;

  const { data: run } = await supabaseAdmin
    .from("assistant_runs")
    .select(
      "id, success, message, total_steps, current_step_index, abandonment_reason, closure_reason_code, closure_note, closed_by, closed_at, follow_up_required, follow_up_note, started_at, finished_at",
    )
    .eq("request_id", requestId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const steps = run
    ? (
        await supabaseAdmin
          .from("assistant_steps")
          .select(
            "step_index, tool_name, title, status, attempt, user_retry_count, error_kind, error_code, error_message, duration_ms",
          )
          .eq("run_id", run.id)
          .order("step_index", { ascending: true })
      ).data ?? []
    : [];

  const { data: openTasks } = await supabaseAdmin
    .from("pending_tasks")
    .select(
      "id, run_id, kind, step_index, description, status, context_json, resume_at, wait_expires_at",
    )
    .eq("run_id", requestId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  // A snoozed task is still open, but the user asked not to be shown it yet.
  const now = Date.now();
  const tasks = (openTasks ?? []).filter(
    (task) => !task.resume_at || new Date(task.resume_at).getTime() <= now,
  );

  return { request, run: run ?? null, steps, tasks };
}
