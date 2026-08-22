-- The tables in this project predate 001, so CREATE TABLE IF NOT EXISTS left
-- them untouched. These are the columns and constraints the current code needs
-- that the original June schema did not have.

ALTER TABLE assistant_runs  ADD COLUMN IF NOT EXISTS abandonment_reason TEXT;
ALTER TABLE pending_tasks   ADD COLUMN IF NOT EXISTS abandonment_reason TEXT;
ALTER TABLE assistant_requests ADD COLUMN IF NOT EXISTS source TEXT;

-- Contact auto-capture upserts on (clerk_user_id, primary_email), which needs
-- a matching unique index or PostgREST rejects the on_conflict target.
DELETE FROM contacts
WHERE primary_email IS NOT NULL
  AND ctid NOT IN (
    SELECT MAX(ctid) FROM contacts
    WHERE primary_email IS NOT NULL
    GROUP BY clerk_user_id, primary_email
  );

CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_email_unique
  ON contacts (clerk_user_id, primary_email);
