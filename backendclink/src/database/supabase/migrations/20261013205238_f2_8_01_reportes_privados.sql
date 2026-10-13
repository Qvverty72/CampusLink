-- Express checks resource access and campus before inserting. Reports and
-- complainant identities must not be directly accessible from public clients.
-- Apply with the database owner after CampusLink_Schema.sql.
begin;
alter table public.reporte_contenido enable row level security;
revoke all on public.reporte_contenido from public, anon, authenticated;
grant select, insert on public.reporte_contenido to service_role;
commit;
