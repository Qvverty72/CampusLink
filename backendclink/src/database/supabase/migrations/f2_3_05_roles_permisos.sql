-- Aplicar después de F2.3-01/02 sobre tablas existentes, con una conexión propietaria.
-- El catálogo sigue el contrato de actores/capacidades aprobado en GH-59.
-- No agrega tablas, columnas, funciones de negocio ni triggers.
begin;

insert into public.rol(nombre,descripcion) values
  ('ADMINISTRADOR','Administración y todas las funciones dentro del campus asignado'),
  ('USUARIO_AUTORIZADO','Funciones generales y permisos especiales independientes por campus')
on conflict (nombre) do nothing;
insert into public.permiso(nombre,descripcion) values
  ('PUBLICAR_EVENTO','Publicar actividades oficiales'),
  ('ACCEDER_ANALITICA','Acceder a Analítica'),
  ('ACCEDER_REPORTERIA','Acceder a Reportería')
on conflict (nombre) do nothing;

-- Los índices únicos fallan si hay asignaciones activas duplicadas; conserva el historial para revisión.
create unique index if not exists usuario_rol_vigente_unique
  on public.usuario_rol(perfil_usuario_id,campus_id,rol_id) where revocado_en is null;
create unique index if not exists usuario_permiso_vigente_unique
  on public.usuario_permiso(perfil_usuario_id,campus_id,permiso_id) where revocado_en is null;
create index if not exists perfil_usuario_campus_list_idx
  on public.perfil_usuario(campus_id,nombre_completo,id) where deleted_at is null;

alter table public.auditoria enable row level security;
alter table public.rol_permiso enable row level security;
revoke all on public.auditoria, public.rol_permiso from anon,authenticated;
revoke insert,update,delete,truncate,references,trigger on public.usuario_rol,public.usuario_permiso,public.rol,public.permiso from anon,authenticated;
-- Las políticas F2.3-01 siguen mostrando solo las asignaciones vigentes propias.
-- Solo la conexión confiable del servidor administra asignaciones; Express decide la autorización.
grant select,insert,update on public.usuario_rol,public.usuario_permiso to service_role;
grant select,update on public.perfil_usuario,public.campus,public.rol,public.permiso to service_role;
grant insert on public.auditoria to service_role;

commit;
