-- F2.3-04: aplicar después de F2.3-01/02, como propietario.
-- Solo permisos/aislamiento; las reglas y el guardado se coordinan en Express.
-- Sin tablas, columnas, triggers ni funciones de negocio nuevas.
begin;
grant select on public.campus, public.carrera, public.campus_carrera to service_role;
grant update (nombre_completo, campus_id, updated_at) on public.perfil_usuario to service_role;
alter table public.usuario_carrera enable row level security;
revoke all on public.usuario_carrera from public, anon, authenticated;
grant select, insert, delete on public.usuario_carrera to service_role;

commit;
