-- Aplicar después de F2.3-01/04/05, con una conexión propietaria.
-- Aporta aislamiento; Express administra suspensión, retirada y auditoría.
-- Conserva tablas, columnas y datos históricos/digitales existentes.
begin;
alter table public.publicacion_recurso enable row level security;
-- Ningún cliente puede evitar Express ni revertir una retirada lógica de publicación.
revoke all on public.publicacion_recurso from public,anon,authenticated;
grant select on public.publicacion_recurso to service_role;
grant update (deleted_at,updated_at) on public.publicacion_recurso to service_role;
commit;
