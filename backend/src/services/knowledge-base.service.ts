/**
 * knowledge-base.service.ts
 *
 * The user's personal KB: facts the AI collects and updates agentically.
 * Every entry is a (subject, key) → value triple, e.g.:
 *   subject="Shubham"  key="email"     value="shubham@example.com"
 *   subject="self"     key="timezone"  value="Asia/Kolkata"
 *   subject="standup"  key="time"      value="9:30 AM IST daily"
 *
 * The planner reads the whole KB at plan time via buildKbContext() so the AI
 * already knows Shubham's email before it even writes the plan — no extra
 * request_user_input step needed for known entities.
 *
 * The kb_update tool lets the AI write back new facts after the user answers
 * a request_user_input prompt, closing the loop agentically.
 */

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../config/supabase.js";

export type KbEntry = {
  id: string;
  kind: "contact" | "preference" | "fact" | "credential" | "alias";
  subject: string;
  key: string;
  value: string;
  aliases: string[];
  source: "user_provided" | "ai_inferred" | "imported";
  confidence: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Upsert a single KB fact. If (clerk_user_id, subject, key) already exists the
 * value, confidence, notes and source are updated in place and updated_at is bumped.
 */
export async function upsertKbEntry(
  clerkUserId: string,
  params: {
    kind?: KbEntry["kind"];
    subject: string;
    key: string;
    value: string;
    aliases?: string[];
    source?: KbEntry["source"];
    confidence?: number;
    notes?: string | null;
  },
): Promise<KbEntry | null> {
  const {
    kind = "fact",
    subject,
    key,
    value,
    aliases = [],
    source = "user_provided",
    confidence = 1.0,
    notes = null,
  } = params;

  const id = randomUUID();

  const { data, error } = await supabaseAdmin
    .from("knowledge_base")
    .upsert(
      {
        id,
        clerk_user_id: clerkUserId,
        kind,
        subject: subject.trim(),
        key: key.trim().toLowerCase(),
        value: value.trim(),
        aliases,
        source,
        confidence,
        notes,
      },
      { onConflict: "clerk_user_id,subject,key" },
    )
    .select()
    .single();

  if (error) {
    console.error("[KB] upsert failed", error.message);
    return null;
  }

  return rowToEntry(data);
}

/**
 * Upsert multiple facts at once (e.g. after a user fills in a form).
 */
export async function upsertKbEntries(
  clerkUserId: string,
  entries: Array<Omit<Parameters<typeof upsertKbEntry>[1], never>>,
): Promise<void> {
  if (entries.length === 0) return;

  const rows = entries.map((e) => ({
    id: randomUUID(),
    clerk_user_id: clerkUserId,
    kind: e.kind ?? "fact",
    subject: e.subject.trim(),
    key: (e.key ?? "").trim().toLowerCase(),
    value: (e.value ?? "").trim(),
    aliases: e.aliases ?? [],
    source: e.source ?? "user_provided",
    confidence: e.confidence ?? 1.0,
    notes: e.notes ?? null,
  }));

  const { error } = await supabaseAdmin
    .from("knowledge_base")
    .upsert(rows, { onConflict: "clerk_user_id,subject,key" });

  if (error) {
    console.error("[KB] batch upsert failed", error.message);
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** All KB entries for a user, ordered by subject then key. */
export async function listKbEntries(
  clerkUserId: string,
  kind?: KbEntry["kind"],
): Promise<KbEntry[]> {
  let q = supabaseAdmin
    .from("knowledge_base")
    .select("*")
    .eq("clerk_user_id", clerkUserId)
    .order("subject", { ascending: true })
    .order("key", { ascending: true });

  if (kind) q = q.eq("kind", kind);

  const { data, error } = await q;

  if (error) {
    console.error("[KB] list failed", error.message);
    return [];
  }

  return (data ?? []).map(rowToEntry);
}

/**
 * Look up entries for a subject, matching on subject OR any alias.
 * E.g. looking up "Shubh" finds the row with subject="Shubham" if "Shubh" is in aliases.
 */
export async function lookupKbByName(
  clerkUserId: string,
  name: string,
): Promise<KbEntry[]> {
  const normalised = name.trim().toLowerCase();

  // Direct subject match (case-insensitive via ilike)
  const { data: direct, error: e1 } = await supabaseAdmin
    .from("knowledge_base")
    .select("*")
    .eq("clerk_user_id", clerkUserId)
    .ilike("subject", normalised);

  if (e1) console.error("[KB] lookup direct failed", e1.message);

  // Alias match: aliases is a jsonb array, check if any element matches
  const { data: byAlias, error: e2 } = await supabaseAdmin
    .from("knowledge_base")
    .select("*")
    .eq("clerk_user_id", clerkUserId)
    .contains("aliases", JSON.stringify([name.trim()]));

  if (e2) console.error("[KB] lookup alias failed", e2.message);

  const combined = [...(direct ?? []), ...(byAlias ?? [])];
  // Deduplicate by id
  const seen = new Set<string>();
  return combined.filter((r) => (seen.has(r.id) ? false : seen.add(r.id))).map(rowToEntry);
}

/**
 * Delete a single entry by id (ownership-checked).
 */
export async function deleteKbEntry(clerkUserId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("knowledge_base")
    .delete()
    .eq("id", id)
    .eq("clerk_user_id", clerkUserId);

  if (error) console.error("[KB] delete failed", error.message);
}

// ---------------------------------------------------------------------------
// Planner context builder
// ---------------------------------------------------------------------------

/**
 * Build the KB section that gets injected into the planner user-prompt.
 * Groups entries by subject and emits them as readable key:value pairs.
 * Returns empty string when the KB is empty.
 */
export async function buildKbContext(clerkUserId: string | undefined): Promise<string> {
  if (!clerkUserId) return "";

  const entries = await listKbEntries(clerkUserId);
  if (entries.length === 0) return "";

  // Group by subject
  const bySubject = new Map<string, KbEntry[]>();
  for (const e of entries) {
    const list = bySubject.get(e.subject) ?? [];
    list.push(e);
    bySubject.set(e.subject, list);
  }

  const lines: string[] = [];
  for (const [subject, facts] of bySubject) {
    const pairs = facts.map((f) => `    ${f.key}: ${f.value}`).join("\n");
    lines.push(`  ${subject}:\n${pairs}`);
  }

  return `USER KNOWLEDGE BASE (use these facts directly — do NOT call request_user_input for anything already listed here):\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToEntry(row: Record<string, unknown>): KbEntry {
  return {
    id: row.id as string,
    kind: row.kind as KbEntry["kind"],
    subject: row.subject as string,
    key: row.key as string,
    value: row.value as string,
    aliases: (row.aliases as string[] | null) ?? [],
    source: row.source as KbEntry["source"],
    confidence: row.confidence as number,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
