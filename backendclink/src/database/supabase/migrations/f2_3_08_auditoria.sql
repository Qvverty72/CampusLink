-- Existing audit history only. Apply after F2.3-05 with a database-owner connection.
-- Express authorizes every campus; Expo must never read this table directly.
begin;
alter table public.auditoria enable row level security;
revoke all on public.auditoria from public, anon, authenticated;
revoke update,delete,truncate,references,trigger on public.auditoria from service_role;
grant select,insert on public.auditoria to service_role;
commit;
