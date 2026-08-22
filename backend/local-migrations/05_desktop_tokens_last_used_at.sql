-- Older desktop_tokens rows predate this column. Code updates last_used_at on each request.
ALTER TABLE desktop_tokens ADD COLUMN last_used_at DATETIME;
