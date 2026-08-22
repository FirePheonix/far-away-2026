-- Contact auto-capture upserts on (clerk_user_id, primary_email); without a
-- matching unique index SQLite rejects the ON CONFLICT clause at prepare time.

DELETE FROM contacts
WHERE primary_email IS NOT NULL
  AND rowid NOT IN (
    SELECT MAX(rowid) FROM contacts
    WHERE primary_email IS NOT NULL
    GROUP BY clerk_user_id, primary_email
  );

CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_email_unique
  ON contacts (clerk_user_id, primary_email);
