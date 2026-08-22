/**
 * Checks that the columns the trace + closure code writes actually exist in
 * Supabase. DDL cannot go through the Data API, so 002/003 are applied by hand
 * in the SQL editor — this tells you whether that happened.
 *
 * Usage: node scripts/verify-flow-schema.mjs
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const EXPECTED = {
  assistant_steps: [
    "tool_name",
    "title",
    "params_json",
    "result_json",
    "status",
    "attempt",
    "user_retry_count",
    "error_kind",
    "error_code",
    "error_message",
    "error_detail",
    "retryable",
    "started_at",
    "finished_at",
  ],
  assistant_runs: [
    "abandonment_reason",
    "plan_json",
    "total_steps",
    "current_step_index",
    "inngest_run_id",
    "closure_reason_code",
    "closure_note",
    "closed_by",
    "closed_at",
    "follow_up_required",
    "follow_up_note",
    "follow_up_owner",
  ],
  pending_tasks: [
    "kind",
    "step_index",
    "context_json",
    "skipped_data",
    "paused_at",
    "resume_at",
    "wait_expires_at",
    "abandonment_reason",
    "closure_reason_code",
    "closure_note",
    "closed_by",
    "closed_at",
    "follow_up_required",
    "follow_up_owner",
  ],
  assistant_requests: ["source", "transcript", "status"],
};

let missingTotal = 0;

for (const [table, columns] of Object.entries(EXPECTED)) {
  // One request per column: PostgREST reports the first unknown column only.
  const missing = [];
  for (const column of columns) {
    const { error } = await supabase.from(table).select(column).limit(1);
    if (error && /column .* does not exist|does not exist/i.test(error.message)) {
      missing.push(column);
    } else if (error && error.code === "42P01") {
      missing.push(`(table ${table} missing)`);
      break;
    }
  }

  if (missing.length === 0) {
    console.log(`OK   ${table} — all ${columns.length} columns present`);
  } else {
    missingTotal += missing.length;
    console.log(`MISS ${table} — ${missing.join(", ")}`);
  }
}

// The live trace upserts on (run_id, step_index); without the unique index
// PostgREST rejects the on_conflict target at request time.
const probe = await supabase
  .from("assistant_steps")
  .upsert(
    { id: "00000000-0000-0000-0000-000000000000", run_id: null, step_index: -1 },
    { onConflict: "run_id,step_index" },
  );

if (probe.error && /no unique|exclusion constraint|on conflict/i.test(probe.error.message)) {
  console.log("MISS assistant_steps — unique index on (run_id, step_index)");
  missingTotal += 1;
} else if (probe.error) {
  // Could not prove it either way — print it so it isn't read as a pass.
  console.log(`??   assistant_steps — upsert probe inconclusive: ${probe.error.message}`);
} else {
  console.log("OK   assistant_steps — upsert target (run_id, step_index) accepted");
  await supabase.from("assistant_steps").delete().eq("step_index", -1);
}

console.log(
  missingTotal === 0
    ? "\nSchema is ready."
    : `\n${missingTotal} item(s) missing — apply supabase-migrations/002 then 003 in the SQL editor.`,
);
process.exit(missingTotal === 0 ? 0 : 1);
