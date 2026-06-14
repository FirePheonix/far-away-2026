alter table public.assistant_requests
drop constraint if exists assistant_requests_source_check;

alter table public.assistant_requests
add constraint assistant_requests_source_check
check (source in ('web', 'local-stt', 'api', 'voice'));
