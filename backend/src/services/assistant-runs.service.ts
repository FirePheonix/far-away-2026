import { db } from "../config/db.js";
import { env } from "../config/env.js";
import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import type { ExecutionPlan, StepExecutionRecord } from "../types/index.js";

type AssistantSource = "api" | "voice" | "local-stt" | "web";

function toJson(value: unknown): unknown {
  return value === undefined ? null : JSON.stringify(value);
}

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY ?? "missing-key",
});

export async function ensureAssistantProfile(clerkUserId: string): Promise<void> {
  try {
    db.prepare(`
      INSERT INTO profiles (clerk_user_id)
      VALUES (?)
      ON CONFLICT(clerk_user_id) DO NOTHING
    `).run(clerkUserId);
  } catch (error) {
    throw error;
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

  db.prepare(`
    INSERT INTO assistant_requests (id, clerk_user_id, transcript, status)
    VALUES (?, ?, ?, ?)
  `).run(requestId, params.clerkUserId, params.transcript, "queued");

  await rememberTranscript(params.clerkUserId, params.transcript, requestId);
  await rememberContactsFromTranscript(params.clerkUserId, params.transcript);

  return requestId;
}

export async function startAssistantRun(requestId?: string): Promise<string | undefined> {
  if (!requestId) return undefined;

  try {
    db.prepare(`UPDATE assistant_requests SET status = 'running' WHERE id = ?`).run(requestId);

    const runId = randomUUID();
    db.prepare(`
      INSERT INTO assistant_runs (id, request_id, success, message)
      VALUES (?, ?, ?, ?)
    `).run(runId, requestId, null, "Running");

    return runId;
  } catch (error) {
    console.error("[AssistantRuns] Failed to start run", error);
    return undefined;
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

  try {
    db.prepare(`UPDATE assistant_requests SET status = ? WHERE id = ?`).run(
      params.success ? "completed" : "failed",
      params.requestId
    );
  } catch (error) {
    console.error("[AssistantRuns] Failed to update request status", error);
  }

  if (!params.runId) return;

  try {
    // Note: plan_json and results_json aren't in the new schema, but we'll ignore them for now or add them if needed.
    db.prepare(`
      UPDATE assistant_runs 
      SET success = ?, message = ?, finished_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      params.success ? 1 : 0,
      params.message,
      params.runId
    );
  } catch (runError) {
    console.error("[AssistantRuns] Failed to complete run", runError);
  }

  if (!params.stepsExecuted?.length) return;

  try {
    const insertStep = db.prepare(`
      INSERT INTO assistant_steps (id, run_id, step_index, tool, params, result, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    db.transaction(() => {
      for (const step of params.stepsExecuted!) {
        insertStep.run(
          randomUUID(),
          params.runId!,
          step.index,
          step.tool,
          toJson(step.params) as string | null,
          toJson(step.result) as string | null,
          step.durationMs
        );
      }
    })();
  } catch (stepsError) {
    console.error("[AssistantRuns] Failed to persist steps", stepsError);
  }
}

async function rememberTranscript(
  clerkUserId: string,
  transcript: string,
  requestId: string,
): Promise<void> {
  const embedding = await createEmbedding(transcript);
  
  try {
    db.prepare(`
      INSERT INTO memory_items (id, clerk_user_id, kind, title, body, metadata, embedding)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      clerkUserId,
      "transcript",
      "Voice request",
      transcript,
      toJson({ requestId }) as string | null,
      embedding
    );
  } catch (error) {
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

  const insertContact = db.prepare(`
    INSERT INTO contacts (id, clerk_user_id, display_name, primary_email, notes)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(clerk_user_id, primary_email) DO UPDATE SET
      display_name = excluded.display_name,
      notes = excluded.notes
  `);

  try {
    db.transaction(() => {
      for (const match of emailMatches) {
        const email = match[0].toLowerCase();
        const before = transcript.slice(Math.max(0, match.index - 48), match.index).trim();
        const words = before.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
        const displayName = words.slice(-2).join(" ") || email.split("@")[0];

        insertContact.run(
          randomUUID(),
          clerkUserId,
          displayName,
          email,
          "Auto-captured from assistant transcript."
        );
      }
    })();
  } catch (error) {
    console.error("[AssistantRuns] Failed to store contacts", error);
  }
}
