import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { env } from "../config/env.js";
import { supabaseAdmin } from "../config/supabase.js";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY ?? "missing-key",
});

export type RecalledMemory = {
  kind: string;
  title: string;
  body: string;
  createdAt: string;
  similarity: number;
};

export async function createEmbedding(text: string): Promise<number[] | null> {
  if (!env.OPENAI_API_KEY) return null;

  try {
    const response = await openai.embeddings.create({
      model: env.OPENAI_EMBEDDING_MODEL,
      input: text.slice(0, 8000),
    });
    return response.data[0]?.embedding ?? null;
  } catch (err) {
    console.error("[Memory] Failed to create embedding", err);
    return null;
  }
}

export async function rememberTranscript(
  clerkUserId: string,
  transcript: string,
  requestId: string,
): Promise<void> {
  const embedding = await createEmbedding(transcript);

  const { error } = await supabaseAdmin.from("memory_items").insert({
    id: randomUUID(),
    clerk_user_id: clerkUserId,
    kind: "transcript",
    title: "Voice request",
    body: transcript,
    metadata: { requestId },
    embedding,
  });

  if (error) {
    console.error("[Memory] Failed to store transcript memory", error.message);
  }
}

/**
 * Captures "<name> <email>" pairs mentioned in a transcript so later requests
 * can address someone by name without the user repeating the address.
 */
export async function rememberContactsFromTranscript(
  clerkUserId: string,
  transcript: string,
): Promise<void> {
  const emailMatches = [...transcript.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)];
  if (emailMatches.length === 0) return;

  const rows = emailMatches.map((match) => {
    const email = match[0].toLowerCase();
    const before = transcript.slice(Math.max(0, match.index - 48), match.index).trim();
    const words = before.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
    const displayName = words.slice(-2).join(" ") || email.split("@")[0]!;

    return {
      id: randomUUID(),
      clerk_user_id: clerkUserId,
      display_name: displayName,
      primary_email: email,
      notes: "Auto-captured from assistant transcript.",
    };
  });

  const { error } = await supabaseAdmin
    .from("contacts")
    .upsert(rows, { onConflict: "clerk_user_id,primary_email" });

  if (error) {
    console.error("[Memory] Failed to store contacts", error.message);
  }
}

/**
 * Stores why the user abandoned, skipped or corrected something so the planner
 * stops repeating a mistake it only had to be told about once.
 */
export async function rememberCorrection(
  clerkUserId: string,
  params: {
    reasonLabel: string;
    note?: string | null;
    subject?: string | null;
    requestId?: string | null;
  },
): Promise<void> {
  const parts = [
    params.subject ? `While working on: ${params.subject}.` : null,
    `The user stopped it because: ${params.reasonLabel}.`,
    params.note ? `They said: "${params.note}"` : null,
  ].filter(Boolean);

  const body = parts.join(" ");
  const embedding = await createEmbedding(body);

  const { error } = await supabaseAdmin.from("memory_items").insert({
    id: randomUUID(),
    clerk_user_id: clerkUserId,
    kind: "correction",
    title: `Correction: ${params.reasonLabel}`,
    body,
    metadata: { requestId: params.requestId, note: params.note ?? null },
    embedding,
  });

  if (error) {
    console.error("[Memory] Failed to store correction memory", error.message);
  }
}

/**
 * Nearest past memories for this user by cosine similarity. Runs through the
 * match_memories SQL function because the Data API cannot express `<=>`.
 */
export async function searchMemory(
  clerkUserId: string,
  query: string,
  limit = 5,
): Promise<RecalledMemory[]> {
  const embedding = await createEmbedding(query);
  if (!embedding) return [];

  const { data, error } = await supabaseAdmin.rpc("match_memories", {
    p_user: clerkUserId,
    query_embedding: embedding,
    match_count: limit,
    min_similarity: 0.15,
  });

  if (error) {
    console.error("[Memory] Similarity search failed", error.message);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    kind: row.kind,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    similarity: row.similarity,
  }));
}

/** Known contacts for this user, used to resolve names to addresses. */
export async function recallContacts(
  clerkUserId: string,
  limit = 20,
): Promise<Array<{ displayName: string; email: string | null }>> {
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select("display_name, primary_email")
    .eq("clerk_user_id", clerkUserId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[Memory] Failed to load contacts", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    displayName: row.display_name,
    email: row.primary_email,
  }));
}

/**
 * Everything the planner should know about this user before it plans.
 * Returns an empty string when there is nothing worth injecting.
 */
export async function buildMemoryContext(
  clerkUserId: string | undefined,
  transcript: string,
): Promise<string> {
  if (!clerkUserId) return "";

  const [memories, contacts] = await Promise.all([
    searchMemory(clerkUserId, transcript),
    recallContacts(clerkUserId),
  ]);

  const sections: string[] = [];

  if (contacts.length > 0) {
    const lines = contacts
      .filter((c) => c.email)
      .map((c) => `- ${c.displayName}: ${c.email}`);
    if (lines.length > 0) {
      sections.push(`KNOWN CONTACTS (use these addresses instead of asking):\n${lines.join("\n")}`);
    }
  }

  const render = (items: RecalledMemory[]) =>
    items.map((m) => `- [${new Date(m.createdAt).toISOString().slice(0, 10)}] ${m.body}`).join("\n");

  const corrections = memories.filter((m) => m.kind === "correction");
  const past = memories.filter((m) => m.kind !== "correction");

  if (corrections.length > 0) {
    sections.push(
      `LESSONS FROM PAST CORRECTIONS (the user stopped these runs — do not repeat the mistake):\n${render(corrections)}`,
    );
  }

  if (past.length > 0) {
    sections.push(`RELEVANT PAST REQUESTS FROM THIS USER:\n${render(past)}`);
  }

  return sections.join("\n\n");
}
