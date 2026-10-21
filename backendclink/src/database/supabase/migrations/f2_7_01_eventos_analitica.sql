-- F2.7-01. Aplicar después del esquema base y las migraciones F2.3/F2.4/F2.5.
-- El historial es de solo inserción y no depende de la vigencia de publicaciones o perfiles.
begin;

create table if not exists public.evento_analitica (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null check (event_type in (
    'RESOURCE_VIEWED', 'RESOURCE_REQUESTED', 'TRANSACTION_RESERVED',
    'TRANSACTION_AWAITING_CONFIRMATION', 'TRANSACTION_COMPLETED', 'TRANSACTION_CANCELLED',
    'ACCOUNT_ACTIVA', 'ACCOUNT_SUSPENDIDA', 'ACCOUNT_DESACTIVADA')),
  occurred_at timestamptz not null,
  institution_id uuid not null,
  campus_id uuid not null,
  actor_user_id uuid,
  resource_id uuid,
  account_user_id uuid,
  source_id uuid not null,
  resource_type text check (resource_type is null or resource_type in ('FISICO', 'DIGITAL')),
  subject_ids uuid[] not null default '{}',
  check ((resource_id is not null and account_user_id is null and resource_type is not null)
      or (resource_id is null and account_user_id is not null and resource_type is null))
);
create index if not exists evento_analitica_campus_periodo_tipo
  on public.evento_analitica (campus_id, occurred_at, event_type);
create index if not exists evento_analitica_institucion_periodo
  on public.evento_analitica (institution_id, occurred_at);
create index if not exists evento_analitica_recurso_periodo
  on public.evento_analitica (resource_id, occurred_at) where resource_id is not null;
create index if not exists evento_analitica_cuenta_periodo
  on public.evento_analitica (account_user_id, occurred_at) where account_user_id is not null;
create index if not exists evento_analitica_asignaturas
  on public.evento_analitica using gin (subject_ids);
alter table public.evento_analitica enable row level security;
revoke all on public.evento_analitica from public, anon, authenticated;
grant select, insert on public.evento_analitica to service_role;

create or replace function public.analytics_subject_ids(p_publication_id uuid)
returns uuid[] language sql stable set search_path = public, pg_temp as $$
  select coalesce(array_agg(asignatura_id order by asignatura_id), '{}'::uuid[])
  from public.publicacion_asignatura where publicacion_id = p_publication_id
$$;

-- El registro legado de vistas digitales se conserva; se proyecta sin borrar ni alterar filas.
insert into public.evento_analitica
  (event_key,event_type,occurred_at,institution_id,campus_id,actor_user_id,resource_id,source_id,resource_type,subject_ids)
select 'resource-view:' || v.id, 'RESOURCE_VIEWED', v.created_at, c.institucion_id, p.campus_id,
  v.perfil_usuario_id, p.id, v.id, p.tipo_recurso, public.analytics_subject_ids(p.id)
from public.interaccion_recurso v join public.publicacion_recurso p on p.id=v.publicacion_id
join public.campus c on c.id=p.campus_id where v.tipo_interaccion='VISTA'
on conflict (event_key) do nothing;

insert into public.evento_analitica
  (event_key,event_type,occurred_at,institution_id,campus_id,actor_user_id,resource_id,source_id,resource_type,subject_ids)
select 'resource-request:' || r.id, 'RESOURCE_REQUESTED', r.solicitada_en, c.institucion_id, p.campus_id,
  r.solicitante_id, p.id, r.id, p.tipo_recurso, public.analytics_subject_ids(p.id)
from public.solicitud_recurso r join public.publicacion_recurso p on p.id=r.publicacion_id
join public.campus c on c.id=p.campus_id
on conflict (event_key) do nothing;

insert into public.evento_analitica
  (event_key,event_type,occurred_at,institution_id,campus_id,actor_user_id,resource_id,source_id,resource_type,subject_ids)
select 'transaction:' || t.id || ':RESERVADA', 'TRANSACTION_RESERVED', t.iniciada_en,
  c.institucion_id,p.campus_id,t.propietario_id,p.id,t.id,p.tipo_recurso,public.analytics_subject_ids(p.id)
from public.transaccion_recurso t join public.publicacion_recurso p on p.id=t.publicacion_id
join public.campus c on c.id=p.campus_id
on conflict (event_key) do nothing;

insert into public.evento_analitica
  (event_key,event_type,occurred_at,institution_id,campus_id,actor_user_id,resource_id,source_id,resource_type,subject_ids)
select 'transaction:' || t.id || ':PENDIENTE_CONFIRMACION', 'TRANSACTION_AWAITING_CONFIRMATION',
  first_confirmation.confirmado_en,c.institucion_id,p.campus_id,first_confirmation.usuario_id,p.id,t.id,p.tipo_recurso,
  public.analytics_subject_ids(p.id)
from public.transaccion_recurso t join public.publicacion_recurso p on p.id=t.publicacion_id
join public.campus c on c.id=p.campus_id
join lateral (select confirmado_en,usuario_id from public.confirmacion_transaccion
  where transaccion_id=t.id order by confirmado_en,id limit 1) first_confirmation on true
on conflict (event_key) do nothing;

insert into public.evento_analitica
  (event_key,event_type,occurred_at,institution_id,campus_id,actor_user_id,resource_id,source_id,resource_type,subject_ids)
select 'transaction:' || t.id || ':' || t.estado_transaccion,
  case t.estado_transaccion when 'COMPLETADA' then 'TRANSACTION_COMPLETED' else 'TRANSACTION_CANCELLED' end,
  case t.estado_transaccion when 'COMPLETADA' then t.completada_en else t.cancelada_en end,
  c.institucion_id,p.campus_id,
  case t.estado_transaccion when 'CANCELADA' then t.cancelada_por_id else
    (select usuario_id from public.confirmacion_transaccion where transaccion_id=t.id
      order by confirmado_en desc,id desc limit 1) end,
  p.id,t.id,p.tipo_recurso,public.analytics_subject_ids(p.id)
from public.transaccion_recurso t join public.publicacion_recurso p on p.id=t.publicacion_id
join public.campus c on c.id=p.campus_id
where t.estado_transaccion in ('COMPLETADA','CANCELADA')
  and (case t.estado_transaccion when 'COMPLETADA' then t.completada_en else t.cancelada_en end) is not null
on conflict (event_key) do nothing;

-- Las cuentas nacen activas. Los cambios anteriores se reconstruyen desde auditoría.
insert into public.evento_analitica
  (event_key,event_type,occurred_at,institution_id,campus_id,account_user_id,source_id)
select 'account-created:' || id,'ACCOUNT_ACTIVA',created_at,institucion_id,campus_id,id,id
from public.perfil_usuario on conflict (event_key) do nothing;
insert into public.evento_analitica
  (event_key,event_type,occurred_at,institution_id,campus_id,actor_user_id,account_user_id,source_id)
select 'account-audit:' || id,
  case accion when 'SUSPENDER_CUENTA' then 'ACCOUNT_SUSPENDIDA'
    when 'REACTIVAR_CUENTA' then 'ACCOUNT_ACTIVA' else 'ACCOUNT_DESACTIVADA' end,
  created_at,institucion_id,campus_id,actor_usuario_id,entidad_id::uuid,id
from public.auditoria
where entidad_tipo='perfil_usuario' and accion in ('SUSPENDER_CUENTA','REACTIVAR_CUENTA','DESACTIVAR_CUENTA')
  and entidad_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
on conflict (event_key) do nothing;

create or replace function public.analytics_resource_event_trigger()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare publication public.publicacion_recurso%rowtype;
declare institution uuid;
declare kind text;
declare stamp timestamptz;
declare actor uuid;
declare source uuid;
declare key text;
begin
  if tg_table_name='interaccion_recurso' then
    if new.tipo_interaccion <> 'VISTA' then return new; end if;
    kind := 'RESOURCE_VIEWED'; stamp := new.created_at; actor := new.perfil_usuario_id;
    source := new.id; key := 'resource-view:' || new.id;
  elsif tg_table_name='solicitud_recurso' then
    kind := 'RESOURCE_REQUESTED'; stamp := new.solicitada_en; actor := new.solicitante_id;
    source := new.id; key := 'resource-request:' || new.id;
  else
    if tg_op='UPDATE' and new.estado_transaccion is not distinct from old.estado_transaccion then return new; end if;
    kind := case new.estado_transaccion when 'RESERVADA' then 'TRANSACTION_RESERVED'
      when 'PENDIENTE_CONFIRMACION' then 'TRANSACTION_AWAITING_CONFIRMATION'
      when 'COMPLETADA' then 'TRANSACTION_COMPLETED' else 'TRANSACTION_CANCELLED' end;
    stamp := case new.estado_transaccion when 'RESERVADA' then new.iniciada_en
      when 'COMPLETADA' then coalesce(new.completada_en,clock_timestamp())
      when 'CANCELADA' then coalesce(new.cancelada_en,clock_timestamp()) else clock_timestamp() end;
    actor := case new.estado_transaccion when 'RESERVADA' then new.propietario_id
      when 'CANCELADA' then new.cancelada_por_id else
        (select usuario_id from public.confirmacion_transaccion where transaccion_id=new.id
          order by confirmado_en desc,id desc limit 1) end;
    source := new.id; key := 'transaction:' || new.id || ':' || new.estado_transaccion;
  end if;
  select p.* into publication from public.publicacion_recurso p where p.id=new.publicacion_id;
  select c.institucion_id into institution from public.campus c where c.id=publication.campus_id;
  insert into public.evento_analitica
    (event_key,event_type,occurred_at,institution_id,campus_id,actor_user_id,resource_id,source_id,resource_type,subject_ids)
  values (key,kind,stamp,institution,publication.campus_id,actor,publication.id,source,
    publication.tipo_recurso,public.analytics_subject_ids(publication.id))
  on conflict (event_key) do nothing;
  return new;
end $$;

create or replace function public.analytics_account_event_trigger()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare state text;
declare stamp timestamptz;
begin
  if tg_op='UPDATE' and new.estado_cuenta is not distinct from old.estado_cuenta
    and new.deleted_at is not distinct from old.deleted_at then return new; end if;
  state := case when new.deleted_at is not null then 'DESACTIVADA' else new.estado_cuenta end;
  stamp := case when tg_op='INSERT' then new.created_at else new.updated_at end;
  insert into public.evento_analitica
    (event_key,event_type,occurred_at,institution_id,campus_id,actor_user_id,account_user_id,source_id)
  values (case when tg_op='INSERT' then 'account-created:' || new.id
      else 'account-state:' || new.id || ':' || stamp::text || ':' || state end,
    'ACCOUNT_' || state,stamp,new.institucion_id,new.campus_id,
    nullif(current_setting('campuslink.actor_user_id',true),'')::uuid,new.id,new.id)
  on conflict (event_key) do nothing;
  return new;
end $$;

drop trigger if exists analytics_resource_view on public.interaccion_recurso;
create trigger analytics_resource_view after insert on public.interaccion_recurso
  for each row execute function public.analytics_resource_event_trigger();
drop trigger if exists analytics_resource_request on public.solicitud_recurso;
create trigger analytics_resource_request after insert on public.solicitud_recurso
  for each row execute function public.analytics_resource_event_trigger();
drop trigger if exists analytics_transaction_insert on public.transaccion_recurso;
create trigger analytics_transaction_insert after insert on public.transaccion_recurso
  for each row execute function public.analytics_resource_event_trigger();
drop trigger if exists analytics_transaction_update on public.transaccion_recurso;
create trigger analytics_transaction_update after update of estado_transaccion on public.transaccion_recurso
  for each row execute function public.analytics_resource_event_trigger();
drop trigger if exists analytics_account_insert on public.perfil_usuario;
create trigger analytics_account_insert after insert on public.perfil_usuario
  for each row execute function public.analytics_account_event_trigger();
drop trigger if exists analytics_account_update on public.perfil_usuario;
create trigger analytics_account_update after update of estado_cuenta,deleted_at on public.perfil_usuario
  for each row execute function public.analytics_account_event_trigger();

revoke all on function public.analytics_subject_ids(uuid) from public, anon, authenticated;
revoke all on function public.analytics_resource_event_trigger() from public, anon, authenticated;
revoke all on function public.analytics_account_event_trigger() from public, anon, authenticated;
grant execute on function public.analytics_subject_ids(uuid) to service_role;
commit;
