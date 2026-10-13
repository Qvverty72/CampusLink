-- Existing table only. Apply with the database-owner connection before deploying.
begin;
alter table public.notificacion add column if not exists campus_id uuid references public.campus(id);
alter table public.notificacion add column if not exists actividad_evento_clave text;
create unique index if not exists notificacion_actividad_evento_uq
  on public.notificacion(destinatario_id,actividad_evento_clave) where actividad_evento_clave is not null;
create index if not exists notificacion_actividad_campus_idx
  on public.notificacion(destinatario_id,campus_id,created_at desc,id desc)
  where deleted_at is null and actividad_evento_clave is not null;
-- Keep existing RLS and grants unchanged; clients already have no direct table access.
commit;
