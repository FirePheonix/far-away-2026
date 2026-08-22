-- No-op. desktop_tokens.revoked_at is already declared in 01_initial_schema.sql,
-- so running the ALTER here fails with "duplicate column name" on a fresh
-- database. Kept as a placeholder so the applied-migration ledger of existing
-- installs stays intact.
SELECT 1;
