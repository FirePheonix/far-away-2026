import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { rememberContactsFromTranscript, rememberTranscript } from "./memory.service.js";
import type { ExecutionPlan, StepExecutionRecord } from "../types/index.js";

type AssistantSource = "api" | "voice" | "local-stt" | "web";

export async function ensureAssistantProfile(clerkUserId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("profiles")
    .upsert({ clerk_user_id: clerkUserId }, { onConflict: "clerk_user_id", ignoreDuplicates: true });

  if (error) {
    throw new Error(`Failed to ensure profile: ${error.message}`);
  }
}

export async function createAssistantRequest(params: {
  clerkUserId: string;
  transcript: string;
  source: AssistantSource;
  async: boolean;
}): Promise<string> {
  await ensureAssistantProfile(params.clerkUserId);

  const requestId = randomUUID();

  const { error } = await supabaseAdmin.from("assistant_requests").insert({
    id: requestId,
    clerk_user_id: params.clerkUserId,
    transcript: params.transcript,
    status: "queued",
    source: params.source,
  });

  if (error) {
    throw new Error(`Failed to create assistant request: ${error.message}`);
  }

  await rememberTranscript(params.clerkUserId, params.transcript, requestId);
  await rememberContactsFromTranscript(params.clerkUserId, params.transcript);

  return requestId;
}

export async function startAssistantRun(requestId?: string): Promise<string | undefined> {
  if (!requestId) return undefined;

  try {
    await supabaseAdmin
      .from("assistant_requests")
      .update({ status: "running" })
      .eq("id", requestId);

    const runId = randomUUID();
    const { error } = await supabaseAdmin.from("assistant_runs").insert({
      id: runId,
      request_id: requestId,
      success: null,
      message: "Running",
    });

    if (error) throw new Error(error.message);

    return runId;
  } catch (error) {
    console.error("[AssistantRuns] Failed to start run", error);
    return undefined;
  }
}

export async function abandonAssistantRun(params: {
  requestId?: string;
  runId?: string;
  reason: string;
}): Promise<void> {
  if (!params.requestId) return;

  const { error: requestError } = await supabaseAdmin
    .from("assistant_requests")
    .update({ status: "abandoned" })
    .eq("id", params.requestId);

  if (requestError) {
    console.error("[AssistantRuns] Failed to mark request as abandoned", requestError.message);
  }

  if (!params.runId) return;

  const { error: runError } = await supabaseAdmin
    .from("assistant_runs")
    .update({
      success: false,
      message: `Abandoned: ${params.reason}`,
      abandonment_reason: params.reason,
      finished_at: new Date().toISOString(),
    })
    .eq("id", params.runId);

  if (runError) {
    console.error("[AssistantRuns] Failed to mark run as abandoned", runError.message);
  }
}

export async function completeAssistantRun(params: {
  requestId?: string;
  runId?: string;
  success: boolean;
  message: string;
  plan?: ExecutionPlan;
  results?: Record<string, unknown>;
  stepsExecuted?: StepExecutionRecord[];
  error?: unknown;
}): Promise<void> {
  if (!params.requestId) return;

  const { error: requestError } = await supabaseAdmin
    .from("assistant_requests")
    .update({ status: params.success ? "completed" : "failed" })
    .eq("id", params.requestId);

  if (requestError) {
    console.error("[AssistantRuns] Failed to update request status", requestError.message);
  }

  if (!params.runId) return;

  const { error: runError } = await supabaseAdmin
    .from("assistant_runs")
    .update({
      success: params.success,
      message: params.message,
      finished_at: new Date().toISOString(),
    })
    .eq("id", params.runId);

  if (runError) {
    console.error("[AssistantRuns] Failed to complete run", runError.message);
  }

  // assistant_steps is owned by run-trace.service, which wrote each row as the
  // step actually ran. Re-writing them here would flatten failed and skipped
  // steps back to "succeeded".
}
