/**
 * One-time copy of the non-credential tables out of local.db into Supabase.
 *
 * Credential tables (google, oauth, desktop) are intentionally left behind:
 * they stay on this machine. Safe to re-run — every table upserts on its key.
 *
 *   node scripts/migrate-to-supabase.mjs [--dry-run]
 */
import Database from "better-sqlite3";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv();

const DRY_RUN = process.argv.includes("--dry-run");
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const db = new Database("local.db", { readonly: true });

/** SQLite writes `YYYY-MM-DD HH:MM:SS` in UTC with no zone marker. */
function toIso(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const iso = /[zZ]|[+-]\d{2}:\d{2}$/.test(raw)
    ? raw.replace(" ", "T")
    : `${raw.replace(" ", "T")}Z`;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function toJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Stored as the pgvector text form already, e.g. "[0.1,0.2]". */
function toVector(value) {
  if (!value) return null;
  const parsed = toJson(value);
  return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
}

function toBool(value) {
  if (value === null || value === undefined) return null;
  return Boolean(value);
}

function rows(table) {
  try {
    return db.prepare(`SELECT * FROM ${table}`).all();
  } catch (error) {
    console.log(`  ${table}: not present locally (${error.message})`);
    return [];
  }
}

/**
 * Ordered so foreign keys resolve: requests before runs before steps.
 * `profiles` first because everything else is scoped to a user.
 */
const TABLES = [
  {
    name: "profiles",
    conflict: "clerk_user_id",
    map: (r) => ({
      clerk_user_id: r.clerk_user_id,
      email: r.email ?? null,
      full_name: r.full_name ?? null,
      avatar_url: r.avatar_url ?? null,
    }),
  },
  {
    name: "assistant_requests",
    conflict: "id",
    map: (r) => ({
      id: r.id,
      clerk_user_id: r.clerk_user_id,
      transcript: r.transcript,
      status: r.status,
      created_at: toIso(r.created_at),
    }),
  },
  {
    name: "assistant_runs",
    conflict: "id",
    map: (r) => ({
      id: r.id,
      request_id: r.request_id,
      success: toBool(r.success),
      message: r.message ?? null,
      abandonment_reason: r.abandonment_reason ?? null,
      started_at: toIso(r.started_at),
      finished_at: toIso(r.finished_at),
    }),
  },
  {
    name: "assistant_steps",
    conflict: "id",
    map: (r) => ({
      id: r.id,
      run_id: r.run_id,
      step_index: r.step_index,
      tool_name: r.tool,
      params_json: toJson(r.params),
      result_json: toJson(r.result),
      success: true,
      duration_ms: r.duration_ms ?? null,
      created_at: toIso(r.created_at),
    }),
  },
  {
    name: "contacts",
    conflict: "id",
    map: (r) => ({
      id: r.id,
      clerk_user_id: r.clerk_user_id,
      display_name: r.display_name,
      primary_email: r.primary_email ?? null,
      organization: r.organization ?? null,
      role: r.role ?? null,
      notes: r.notes ?? null,
      created_at: toIso(r.created_at),
    }),
  },
  {
    name: "pending_tasks",
    conflict: "id",
    map: (r) => ({
      id: r.id,
      clerk_user_id: r.clerk_user_id,
      run_id: r.run_id ?? null,
      description: r.description,
      required_fields: toJson(r.required_fields) ?? [],
      status: r.status,
      resolved_data: toJson(r.resolved_data),
      abandonment_reason: r.abandonment_reason ?? null,
      created_at: toIso(r.created_at),
      updated_at: toIso(r.updated_at),
    }),
  },
  {
    name: "memory_items",
    conflict: "id",
    map: (r) => ({
      id: r.id,
      clerk_user_id: r.clerk_user_id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      metadata: toJson(r.metadata),
      embedding: toVector(r.embedding),
      created_at: toIso(r.created_at),
    }),
  },
];

const CHUNK = 200;
let failed = false;

for (const table of TABLES) {
  const local = rows(table.name);
  if (local.length === 0) {
    console.log(`${table.name}: 0 rows, skipping`);
    continue;
  }

  const mapped = local.map(table.map);

  if (DRY_RUN) {
    console.log(`${table.name}: would copy ${mapped.length} rows`);
    continue;
  }

  let copied = 0;
  for (let i = 0; i < mapped.length; i += CHUNK) {
    const batch = mapped.slice(i, i + CHUNK);
    const { error } = await supabase
      .from(table.name)
      .upsert(batch, { onConflict: table.conflict });

    if (error) {
      console.error(`${table.name}: FAILED at rows ${i}-${i + batch.length - 1}: ${error.message}`);
      failed = true;
      break;
    }
    copied += batch.length;
  }

  const { count } = await supabase
    .from(table.name)
    .select("*", { count: "exact", head: true });

  console.log(`${table.name}: copied ${copied}/${mapped.length}, remote now has ${count}`);
}

db.close();
process.exit(failed ? 1 : 0);
