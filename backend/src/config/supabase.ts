import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured");
}

/**
 * Cloud store for assistant history and long-term memory.
 * Credentials live in local SQLite (see config/db.ts) and never come here.
 * Service role bypasses RLS, which the tables rely on to stay backend-only.
 */
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

/**
 * Supabase returns errors in the payload rather than throwing. Callers that
 * cannot proceed without the write should pass through here.
 */
export function unwrap<T>(
  result: { data: T | null; error: { message: string; code?: string } | null },
  action: string,
): T {
  if (result.error) {
    throw new Error(`Supabase ${action} failed: ${result.error.message}`);
  }
  if (result.data === null) {
    throw new Error(`Supabase ${action} returned no data`);
  }
  return result.data;
}

/** True when the schema has not been applied yet (relation missing). */
export function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || Boolean(error.message?.includes("does not exist"));
}
