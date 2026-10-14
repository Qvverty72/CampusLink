-- Actúa sobre el historial de auditoría existente; aplicar después de F2.3-05 como propietario.
-- Express autoriza cada campus; Expo no debe leer esta tabla directamente.
begin;
alter table public.auditoria enable row level security;
revoke all on public.auditoria from public, anon, authenticated;
revoke update,delete,truncate,references,trigger on public.auditoria from service_role;
grant select,insert on public.auditoria to service_role;
commit;
