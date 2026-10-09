-- Apply after F2.3-01/04/05 with a database-owner connection.
-- Essential isolation only. Express owns suspension, retirement and audit rules.
-- Existing tables/columns and existing historical/digital data are preserved.
begin;
alter table public.publicacion_recurso enable row level security;
-- No client may bypass Express or undo a publication's logical retirement.
revoke all on public.publicacion_recurso from public,anon,authenticated;
grant select on public.publicacion_recurso to service_role;
grant update (deleted_at,updated_at) on public.publicacion_recurso to service_role;
commit;
