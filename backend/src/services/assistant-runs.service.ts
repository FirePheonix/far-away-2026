import { supabaseAdmin } from "../config/supabase.js";
import { env } from "../config/env.js";
import OpenAI from "openai";
import type { ExecutionPlan, StepExecutionRecord } from "../types/index.js";

type AssistantSource = "api" | "voice" | "local-stt" | "web";

function toJson(value: unknown): unknown {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY ?? "missing-key",
});

export async function ensureAssistantProfile(clerkUserId: string): Promise<void> {
  const { error } = await supabaseAdmin.from("profiles").upsert(
    { clerk_user_id: clerkUserId },
    { onConflict: "clerk_user_id" },
  );
  if (error) throw error;
}

export async function createAssistantRequest(params: {
  clerkUserId: string;
  transcript: string;
  source: AssistantSource;
  async: boolean;
}): Promise<string> {
  await ensureAssistantProfile(params.clerkUserId);

  const { data, error } = await supabaseAdmin
    .from("assistant_requests")
    .insert({
      clerk_user_id: params.clerkUserId,
      transcript: params.transcript,
      source: params.source,
      async: params.async,
      status: "queued",
    })
    .select("id")
    .single();

  if (error || !data?.id) throw error ?? new Error("Assistant request insert returned no id");

  await rememberTranscript(params.clerkUserId, params.transcript, data.id);
  await rememberContactsFromTranscript(params.clerkUserId, params.transcript);

  return data.id;
}

export async function startAssistantRun(requestId?: string): Promise<string | undefined> {
  if (!requestId) return undefined;

  await supabaseAdmin
    .from("assistant_requests")
    .update({ status: "running" })
    .eq("id", requestId);

  const { data, error } = await supabaseAdmin
    .from("assistant_runs")
    .insert({ request_id: requestId, success: null, message: "Running" })
    .select("id")
    .single();

  if (error) {
    console.error("[AssistantRuns] Failed to start run", error);
    return undefined;
  }

  return data.id;
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

  await supabaseAdmin
    .from("assistant_requests")
    .update({ status: params.success ? "completed" : "failed" })
    .eq("id", params.requestId);

  if (!params.runId) return;

  const { error: runError } = await supabaseAdmin
    .from("assistant_runs")
    .update({
      success: params.success,
      message: params.message,
      plan_json: toJson(params.plan ?? {}),
      results_json: toJson(params.results ?? { error: params.error }),
      finished_at: new Date().toISOString(),
    })
    .eq("id", params.runId);

  if (runError) {
    console.error("[AssistantRuns] Failed to complete run", runError);
  }

  if (!params.stepsExecuted?.length) return;

  const rows = params.stepsExecuted.map((step) => ({
    run_id: params.runId,
    step_index: step.index,
    tool_name: step.tool,
    params_json: toJson(step.params),
    result_json: toJson(step.result),
    success: true,
    duration_ms: step.durationMs,
  }));

  const { error: stepsError } = await supabaseAdmin.from("assistant_steps").upsert(rows);
  if (stepsError) {
    console.error("[AssistantRuns] Failed to persist steps", stepsError);
  }
}

async function rememberTranscript(
  clerkUserId: string,
  transcript: string,
  requestId: string,
): Promise<void> {
  const embedding = await createEmbedding(transcript);
  const { error } = await supabaseAdmin.from("memory_items").insert({
    clerk_user_id: clerkUserId,
    kind: "transcript",
    title: "Voice request",
    body: transcript,
    metadata: { requestId },
    embedding,
  });

  if (error && error.code !== "42P01") {
    console.error("[AssistantRuns] Failed to store transcript memory", error);
  }
}

async function createEmbedding(text: string): Promise<string | null> {
  if (!env.OPENAI_API_KEY) return null;

  try {
    const response = await openai.embeddings.create({
      model: env.OPENAI_EMBEDDING_MODEL,
      input: text.slice(0, 8000),
    });
    const vector = response.data[0]?.embedding;
    return vector ? `[${vector.join(",")}]` : null;
  } catch (err) {
    console.error("[AssistantRuns] Failed to create memory embedding", err);
    return null;
  }
}

async function rememberContactsFromTranscript(
  clerkUserId: string,
  transcript: string,
): Promise<void> {
  const emailMatches = [...transcript.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)];
  if (emailMatches.length === 0) return;

  const rows = emailMatches.map((match) => {
    const email = match[0].toLowerCase();
    const before = transcript.slice(Math.max(0, match.index - 48), match.index).trim();
    const words = before.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
    const displayName = words.slice(-2).join(" ") || email.split("@")[0];

    return {
      clerk_user_id: clerkUserId,
      display_name: displayName,
      primary_email: email,
      aliases: [displayName.toLowerCase()],
      notes: "Auto-captured from assistant transcript.",
    };
  });

  const { error } = await supabaseAdmin
    .from("contacts")
    .upsert(rows, { onConflict: "clerk_user_id,primary_email" });

  if (error && error.code !== "42P01") {
    console.error("[AssistantRuns] Failed to store contacts", error);
  }
}
