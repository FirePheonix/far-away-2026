# Supabase Migrations

Initial migration for Clerk auth + Supabase DB is in:

- `migrations/20260614000000_init_clerk_supabase.sql`

## Apply migration

Option 1: Supabase SQL Editor
1. Open Supabase dashboard -> SQL Editor.
2. Paste migration SQL and run it.

Option 2: Supabase CLI (if configured)
1. `supabase db push`

## Notes

- This schema expects Clerk JWT `sub` to map to `clerk_user_id`.
- `google_tokens` has RLS enabled with no user policy on purpose.
  Use backend service role key for token read/write.
