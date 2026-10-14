-- F2.4-01: solo usa tablas existentes; las operaciones de negocio pasan por la API autenticada.
-- Ejecutar como propietario. No agrega ni elimina filas, tablas o columnas.
begin;
alter table public.publicacion_recurso enable row level security;
alter table public.recurso_fisico enable row level security;
alter table public.archivo_publicacion enable row level security;
alter table public.publicacion_carrera enable row level security;
alter table public.publicacion_asignatura enable row level security;
revoke all on public.publicacion_recurso, public.recurso_fisico, public.archivo_publicacion,
  public.publicacion_carrera, public.publicacion_asignatura from public, anon, authenticated;
grant select, insert on public.publicacion_recurso, public.recurso_fisico, public.archivo_publicacion,
  public.publicacion_carrera, public.publicacion_asignatura to service_role;
commit;
