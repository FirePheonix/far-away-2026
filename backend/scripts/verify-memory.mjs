/**
 * Proves the pgvector path end to end: schema present, embeddings stored as
 * real vectors, and match_memories returning sane cosine similarities.
 *
 *   node scripts/verify-memory.mjs "<clerk_user_id>" "<query text>"
 */
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { config as loadEnv } from "dotenv";

loadEnv();

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY } = process.env;
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

const userId = process.argv[2];
const query = process.argv[3] ?? "email";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TABLES = [
  "profiles",
  "assistant_requests",
  "assistant_runs",
  "assistant_steps",
  "contacts",
  "pending_tasks",
  "memory_items",
];

console.log("=== schema ===");
let missing = 0;
for (const table of TABLES) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) {
    console.log(`  ${table}: MISSING (${error.message})`);
    missing += 1;
  } else {
    console.log(`  ${table}: ok, ${count} rows`);
  }
}

if (missing > 0) {
  console.error(`\n${missing} table(s) missing — run supabase-migrations/001_init.sql first.`);
  process.exit(1);
}

console.log("\n=== embeddings stored ===");
const { count: withEmbedding } = await supabase
  .from("memory_items")
  .select("*", { count: "exact", head: true })
  .not("embedding", "is", null);
console.log(`  memory_items with a vector: ${withEmbedding}`);

if (!userId) {
  console.log("\nPass a clerk_user_id to test similarity search.");
  process.exit(0);
}

if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY required to embed the query");
  process.exit(1);
}

console.log(`\n=== match_memories("${query}") for ${userId} ===`);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const embedded = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: query });
const queryEmbedding = embedded.data[0].embedding;

const { data, error } = await supabase.rpc("match_memories", {
  p_user: userId,
  query_embedding: queryEmbedding,
  match_count: 5,
  min_similarity: 0.0,
});

if (error) {
  console.error(`  RPC failed: ${error.message}`);
  process.exit(1);
}

if (!data?.length) {
  console.log("  no matches (user has no embedded memories yet)");
  process.exit(0);
}

for (const row of data) {
  console.log(`  ${row.similarity.toFixed(4)}  [${row.kind}] ${row.body.slice(0, 90)}`);
}
