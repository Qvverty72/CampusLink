-- ============================================================
-- CampusLink - Seed base de catálogos (Supabase SQL Editor)
-- Idempotente: puede ejecutarse más de una vez.
-- ============================================================
-- 1) Institución
insert into
  public.institucion (id, nombre, tipo, pais)
values
  (
    '11111111-1111-4111-8111-111111111111'::uuid,
    'Duoc UC',
    'Instituto Profesional',
    'Chile'
  )
on conflict (nombre, pais) do update
set
  tipo = EXCLUDED.tipo;

-- 2) Campus / sede
-- En una BD vacía quedará con este UUID fijo, útil como campusId en MongoDB.
-- La relación es lógica: PostgreSQL no puede imponer una foreign key sobre MongoDB,
-- por lo que el backend debe validar la existencia del campus al escribir documentos.
insert into
  public.campus (
    id,
    institucion_id,
    nombre,
    direccion,
    ciudad,
    region,
    activo
  )
select
  '22222222-2222-4222-8222-222222222222'::uuid,
  i.id,
  'Sede Concepción',
  null,
  'Concepción',
  'Biobío',
  true
from
  public.institucion i
where
  i.nombre = 'Duoc UC'
  and i.pais = 'Chile'
on conflict (institucion_id, nombre) do update
set
  ciudad = EXCLUDED.ciudad,
  region = EXCLUDED.region,
  activo = true;

-- 3) Roles base
insert into
  public.rol (id, nombre, descripcion)
values
  (
    '30000000-0000-4000-8000-000000000001'::uuid,
    'USUARIO_INSTITUCIONAL',
    'Usuario institucional verificado de CampusLink'
  ),
  (
    '30000000-0000-4000-8000-000000000002'::uuid,
    'USUARIO_AUTORIZADO',
    'Usuario institucional con permisos adicionales otorgados por administración'
  ),
  (
    '30000000-0000-4000-8000-000000000003'::uuid,
    'ADMINISTRADOR',
    'Usuario responsable de administración, moderación y gestión de CampusLink'
  )
on conflict (nombre) do update
set
  descripcion = EXCLUDED.descripcion;

-- 4) Permisos usados por las policies/RLS actuales
insert into
  public.permiso (id, nombre, descripcion)
values
  (
    '40000000-0000-4000-8000-000000000001'::uuid,
    'VER_REPORTES',
    'Permite consultar analítica y reportería'
  ),
  (
    '40000000-0000-4000-8000-000000000002'::uuid,
    'VER_AUDITORIA',
    'Permite consultar registros de auditoría'
  ),
  (
    '40000000-0000-4000-8000-000000000003'::uuid,
    'MODERAR_CONTENIDO',
    'Permite gestionar contenido reportado y moderación'
  ),
  (
    '40000000-0000-4000-8000-000000000004'::uuid,
    'GESTIONAR_ROLES_PERMISOS',
    'Permite asignar y modificar roles y permisos'
  )
on conflict (nombre) do update
set
  descripcion = EXCLUDED.descripcion;

-- 5) ADMINISTRADOR -> permisos administrativos base
insert into
  public.rol_permiso (rol_id, permiso_id)
select
  r.id,
  p.id
from
  public.rol r
  cross join public.permiso p
where
  r.nombre = 'ADMINISTRADOR'
  and p.nombre in (
    'VER_REPORTES',
    'VER_AUDITORIA',
    'MODERAR_CONTENIDO',
    'GESTIONAR_ROLES_PERMISOS'
  )
on conflict do nothing;

-- ============================================================
-- Verificación: esta consulta SÍ debe devolver una fila.
-- Si los INSERT muestran "Success. No rows returned", es NORMAL.
-- ============================================================
select
  c.id as campus_id,
  c.nombre as campus,
  i.id as institucion_id,
  i.nombre as institucion,
  c.ciudad,
  c.region,
  c.activo
from
  public.campus c
  join public.institucion i on i.id = c.institucion_id
order by
  c.nombre;

-- Verificación de roles/permisos
select
  r.nombre as rol,
  p.nombre as permiso
from
  public.rol_permiso rp
  join public.rol r on r.id = rp.rol_id
  join public.permiso p on p.id = rp.permiso_id
order by
  r.nombre,
  p.nombre;
