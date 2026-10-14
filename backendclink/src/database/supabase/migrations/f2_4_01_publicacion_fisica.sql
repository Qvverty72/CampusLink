-- F2.4-01: existing tables only. Business operations go through the authenticated API.
-- Run as database owner. No rows, tables or columns are added/removed by this script.
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
