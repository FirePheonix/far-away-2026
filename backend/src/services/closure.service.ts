/**
 * Clean closure and handback.
 *
 * Nothing in this system should end without a recorded reason, someone
 * recorded as having ended it, and a flag saying whether a human still owes it
 * follow-up. That applies equally to a user pressing abandon and to a run
 * dying of a permanent tool failure.
 */

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { rememberCorrection } from "./memory.service.js";

export type ClosedBy = "user" | "system" | "timeout";

export interface ClosureReason {
  code: string;
  label: string;
  /** Whether work is presumed left over when this reason is given. */
  followUp: boolean;
  /** Offered as a chip in the desktop overlay. */
  userSelectable: boolean;
  /** Worth teaching the planner about. */
  teachable: boolean;
}

export const CLOSURE_REASONS: ClosureReason[] = [
  { code: "wrong_intent", label: "Not what I asked for", followUp: true, userSelectable: true, teachable: true },
  { code: "ai_got_it_wrong", label: "AI got it wrong", followUp: true, userSelectable: true, teachable: true },
  { code: "no_longer_needed", label: "No longer needed", followUp: false, userSelectable: true, teachable: false },
  { code: "doing_it_manually", label: "I'll do it myself", followUp: false, userSelectable: true, teachable: true },
  { code: "missing_info", label: "Missing information", followUp: true, userSelectable: true, teachable: false },
  { code: "deferred", label: "Later", followUp: true, userSelectable: true, teachable: false },
  { code: "timeout", label: "No response in time", followUp: true, userSelectable: false, teachable: false },
  { code: "system_failure", label: "Failed after retries", followUp: true, userSelectable: false, teachable: false },
];

const REASON_BY_CODE = new Map(CLOSURE_REASONS.map((reason) => [reason.code, reason]));

export function findClosureReason(code?: string | null): ClosureReason | undefined {
  return code ? REASON_BY_CODE.get(code) : undefined;
}

export interface ClosureInput {
  reasonCode?: string | null;
  note?: string | null;
  closedBy: ClosedBy;
  /** Override the reason's default follow-up expectation. */
  followUpRequired?: boolean;
}

interface ResolvedClosure {
  closure_reason_code: string;
  closure_note: string | null;
  closed_by: ClosedBy;
  closed_at: string;
  follow_up_required: boolean;
  follow_up_owner: string | null;
  /** Human-readable rendering, kept for the pre-existing column. */
  abandonment_reason: string;
  label: string;
  teachable: boolean;
}

/**
 * Accepts a code, free text, or neither, and always produces a complete
 * closure record. An unrecognised code is kept verbatim rather than dropped —
 * losing the user's reason is worse than storing an unknown one.
 */
export function resolveClosure(input: ClosureInput): ResolvedClosure {
  const known = findClosureReason(input.reasonCode);
  const code = known?.code ?? input.reasonCode ?? "unspecified";
  const label = known?.label ?? input.reasonCode ?? "No reason given";
  const note = input.note?.trim() ? input.note.trim() : null;
  const followUp = input.followUpRequired ?? known?.followUp ?? true;

  return {
    closure_reason_code: code,
    closure_note: note,
    closed_by: input.closedBy,
    closed_at: new Date().toISOString(),
    follow_up_required: followUp,
    // Single-user product: unfinished work always hands back to the operator.
    follow_up_owner: followUp ? "user" : null,
    abandonment_reason: note ? `${label}: ${note}` : label,
    label,
    teachable: known?.teachable ?? false,
  };
}

/** Closes a pending task with a status of skipped / abandoned / paused / failed. */
export async function closeTask(params: {
  taskId: string;
  status: "skipped" | "abandoned" | "failed" | "resolved";
  closure: ResolvedClosure;
  extra?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from("pending_tasks")
    .update({
      status: params.status,
      abandonment_reason: params.closure.abandonment_reason,
      closure_reason_code: params.closure.closure_reason_code,
      closure_note: params.closure.closure_note,
      closed_by: params.closure.closed_by,
      closed_at: params.closure.closed_at,
      follow_up_required: params.closure.follow_up_required,
      follow_up_owner: params.closure.follow_up_owner,
      updated_at: new Date().toISOString(),
      ...params.extra,
    })
    .eq("id", params.taskId);

  if (error) {
    console.error("[Closure] Failed to close task", error.message);
  }
}

/** Closes a run and its parent request together so status can't diverge. */
export async function closeRun(params: {
  runId?: string | null;
  requestId?: string | null;
  requestStatus: "abandoned" | "failed" | "completed";
  message: string;
  closure: ResolvedClosure;
}): Promise<void> {
  if (params.requestId) {
    const { error } = await supabaseAdmin
      .from("assistant_requests")
      .update({ status: params.requestStatus })
      .eq("id", params.requestId);

    if (error) console.error("[Closure] Failed to update request status", error.message);
  }

  if (!params.runId) return;

  const { error } = await supabaseAdmin
    .from("assistant_runs")
    .update({
      success: false,
      message: params.message,
      abandonment_reason: params.closure.abandonment_reason,
      closure_reason_code: params.closure.closure_reason_code,
      closure_note: params.closure.closure_note,
      closed_by: params.closure.closed_by,
      closed_at: params.closure.closed_at,
      follow_up_required: params.closure.follow_up_required,
      follow_up_note: params.closure.closure_note,
      follow_up_owner: params.closure.follow_up_owner,
      finished_at: new Date().toISOString(),
    })
    .eq("id", params.runId);

  if (error) console.error("[Closure] Failed to close run", error.message);
}

/**
 * Feeds a closure back into long-term memory when the reason implies the
 * assistant did the wrong thing. Fire-and-forget; a memory write must never
 * block the user's abandon request.
 */
export async function teachFromClosure(params: {
  clerkUserId?: string | null;
  closure: ResolvedClosure;
  subject?: string | null;
  requestId?: string | null;
}): Promise<void> {
  if (!params.clerkUserId) return;
  if (!params.closure.teachable) return;
  if (!params.closure.closure_note) return;

  try {
    await rememberCorrection(params.clerkUserId, {
      reasonLabel: params.closure.label,
      note: params.closure.closure_note,
      subject: params.subject,
      requestId: params.requestId,
    });
  } catch (err) {
    console.error("[Closure] Failed to teach from closure", err);
  }
}

/**
 * Hands a permanently failed step back to the human as a pending task, which
 * the desktop already polls for. Returns the task id the workflow waits on.
 *
 * `run_id` holds the request id, matching the existing pending_tasks
 * convention that resume events are matched on the request.
 */
export async function createHandbackTask(params: {
  clerkUserId: string;
  requestId: string;
  stepIndex: number;
  tool: string;
  title: string;
  error: { kind: string; code: string; message: string; detail?: string };
  actions: string[];
  waitExpiresAt: string;
}): Promise<string | undefined> {
  const taskId = randomUUID();

  const { error } = await supabaseAdmin.from("pending_tasks").insert({
    id: taskId,
    clerk_user_id: params.clerkUserId,
    run_id: params.requestId,
    kind: "step_failure",
    step_index: params.stepIndex,
    description: `${params.title} failed: ${params.error.message}`,
    required_fields: [],
    context_json: {
      tool: params.tool,
      title: params.title,
      errorKind: params.error.kind,
      errorCode: params.error.code,
      errorMessage: params.error.message,
      errorDetail: params.error.detail ?? null,
      actions: params.actions,
    },
    status: "pending",
    wait_expires_at: params.waitExpiresAt,
  });

  if (error) {
    console.error("[Closure] Failed to create handback task", error.message);
    return undefined;
  }

  return taskId;
}

/**
 * Everything still owed back to the human: open items, snoozed items, and
 * recent closures that were flagged as leaving work behind.
 */
export async function loadUnresolved(clerkUserId: string) {
  const { data: open } = await supabaseAdmin
    .from("pending_tasks")
    .select(
      "id, kind, run_id, step_index, description, status, context_json, resume_at, wait_expires_at, created_at",
    )
    .eq("clerk_user_id", clerkUserId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const { data: closed } = await supabaseAdmin
    .from("pending_tasks")
    .select(
      "id, kind, description, status, closure_reason_code, closure_note, closed_by, closed_at, follow_up_owner",
    )
    .eq("clerk_user_id", clerkUserId)
    .eq("follow_up_required", true)
    .not("closed_at", "is", null)
    .order("closed_at", { ascending: false })
    .limit(20);

  return {
    open: open ?? [],
    followUps: closed ?? [],
  };
}
