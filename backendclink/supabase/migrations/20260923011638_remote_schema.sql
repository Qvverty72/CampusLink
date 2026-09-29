SET local check_function_bodies = off;

CREATE SCHEMA "app_private";

CREATE TABLE "public"."archivo_publicacion" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "publicacion_id"  uuid                     NOT NULL,
  "bucket_id"       text                     NOT NULL,
  "storage_path"    text                     NOT NULL,
  "nombre_original" text                     NOT NULL,
  "mime_type"       text,
  "tamano_bytes"    bigint                   NOT NULL,
  "tipo_archivo"    text                     NOT NULL,
  "orden"           smallint                 NOT NULL DEFAULT 0,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at"      timestamp with time zone,
  CONSTRAINT "archivo_publicacion_bucket_id_storage_path_key" UNIQUE (bucket_id, storage_path),
  CONSTRAINT "archivo_publicacion_orden_check" CHECK ((orden >= 0)),
  CONSTRAINT "archivo_publicacion_pkey" PRIMARY KEY (id),
  CONSTRAINT "archivo_publicacion_tamano_bytes_check" CHECK (((tamano_bytes >= 0) AND (tamano_bytes <= 26214400))),
  CONSTRAINT "archivo_publicacion_tipo_archivo_check" CHECK ((tipo_archivo = ANY (ARRAY['IMAGEN'::text, 'RECURSO'::text, 'PREVIEW'::text])))
);

ALTER TABLE "public"."archivo_publicacion"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."asignatura" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "nombre"     text                     NOT NULL,
  "codigo"     text                     NOT NULL,
  "activo"     boolean                  NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "asignatura_codigo_key" UNIQUE (codigo),
  CONSTRAINT "asignatura_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."asignatura"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."auditoria" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "actor_usuario_id" uuid,
  "institucion_id"   uuid                     NOT NULL,
  "campus_id"        uuid,
  "entidad_tipo"     text                     NOT NULL,
  "entidad_id"       text                     NOT NULL,
  "accion"           text                     NOT NULL,
  "datos_antes"      jsonb,
  "datos_despues"    jsonb,
  "motivo"           text,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "auditoria_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."auditoria"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."campus_carrera" (
  "campus_id"  uuid NOT NULL,
  "carrera_id" uuid NOT NULL,
  CONSTRAINT "campus_carrera_pkey" PRIMARY KEY (campus_id, carrera_id)
);

ALTER TABLE "public"."campus_carrera"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."campus" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "institucion_id" uuid                     NOT NULL,
  "nombre"         text                     NOT NULL,
  "direccion"      text,
  "ciudad"         text,
  "region"         text,
  "activo"         boolean                  NOT NULL DEFAULT true,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "campus_institucion_id_nombre_key" UNIQUE (institucion_id, nombre),
  CONSTRAINT "campus_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."campus"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."carrera_asignatura" (
  "carrera_id"     uuid     NOT NULL,
  "asignatura_id"  uuid     NOT NULL,
  "semestre_nivel" smallint NOT NULL,
  CONSTRAINT "carrera_asignatura_pkey" PRIMARY KEY (carrera_id, asignatura_id),
  CONSTRAINT "carrera_asignatura_semestre_nivel_check" CHECK ((semestre_nivel > 0))
);

ALTER TABLE "public"."carrera_asignatura"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."carrera" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "institucion_id" uuid                     NOT NULL,
  "nombre"         text                     NOT NULL,
  "codigo"         text,
  "facultad"       text,
  "activo"         boolean                  NOT NULL DEFAULT true,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "carrera_institucion_id_codigo_key" UNIQUE (institucion_id, codigo),
  CONSTRAINT "carrera_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."carrera"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."categoria_recurso_fisico" (
  "id"          uuid    NOT NULL DEFAULT gen_random_uuid(),
  "nombre"      text    NOT NULL,
  "descripcion" text,
  "activo"      boolean NOT NULL DEFAULT true,
  CONSTRAINT "categoria_recurso_fisico_nombre_key" UNIQUE (nombre),
  CONSTRAINT "categoria_recurso_fisico_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."categoria_recurso_fisico"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."confirmacion_transaccion" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "transaccion_id"  uuid                     NOT NULL,
  "usuario_id"      uuid                     NOT NULL,
  "rol_confirmante" text                     NOT NULL,
  "confirmado_en"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "confirmacion_transaccion_pkey" PRIMARY KEY (id),
  CONSTRAINT "confirmacion_transaccion_rol_confirmante_check" CHECK ((rol_confirmante = ANY (ARRAY['PROPIETARIO'::text, 'RECEPTOR'::text]))),
  CONSTRAINT "confirmacion_transaccion_transaccion_id_rol_confirmante_key" UNIQUE (transaccion_id, rol_confirmante),
  CONSTRAINT "confirmacion_transaccion_transaccion_id_usuario_id_key" UNIQUE (transaccion_id, usuario_id)
);

ALTER TABLE "public"."confirmacion_transaccion"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."institucion" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "nombre"     text                     NOT NULL,
  "tipo"       text,
  "pais"       text                     NOT NULL DEFAULT 'Chile'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "institucion_nombre_pais_key" UNIQUE (nombre, pais),
  CONSTRAINT "institucion_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."institucion"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."interaccion_recurso" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "perfil_usuario_id" uuid                     NOT NULL,
  "publicacion_id"    uuid                     NOT NULL,
  "campus_id"         uuid                     NOT NULL,
  "tipo_interaccion"  text                     NOT NULL,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "interaccion_recurso_pkey" PRIMARY KEY (id),
  CONSTRAINT "interaccion_recurso_tipo_interaccion_check" CHECK ((tipo_interaccion = ANY (ARRAY['VISTA'::text, 'CLIC'::text, 'GUARDADO'::text])))
);

ALTER TABLE "public"."interaccion_recurso"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."notificacion" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "destinatario_id"   uuid                     NOT NULL,
  "publicacion_id"    uuid,
  "transaccion_id"    uuid,
  "actividad_id"      text,
  "tipo_notificacion" text,
  "titulo"            text,
  "mensaje"           text                     NOT NULL,
  "leida_en"          timestamp with time zone,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "notificacion_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."notificacion"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."perfil_usuario" (
  "id"                  uuid                     NOT NULL,
  "institucion_id"      uuid                     NOT NULL,
  "campus_id"           uuid,
  "nombre_completo"     text                     NOT NULL,
  "foto_path"           text,
  "reputacion_promedio" numeric(3,2)             NOT NULL DEFAULT 0,
  "estado_cuenta"       text                     NOT NULL DEFAULT 'ACTIVA'::text,
  "verificado_en"       timestamp with time zone,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at"          timestamp with time zone,
  CONSTRAINT "perfil_usuario_estado_cuenta_check" CHECK ((estado_cuenta = ANY (ARRAY['ACTIVA'::text, 'SUSPENDIDA'::text, 'DESACTIVADA'::text]))),
  CONSTRAINT "perfil_usuario_pkey" PRIMARY KEY (id),
  CONSTRAINT "perfil_usuario_reputacion_promedio_check" CHECK (((reputacion_promedio >= (0)::numeric) AND (reputacion_promedio <= (5)::numeric)))
);

ALTER TABLE "public"."perfil_usuario"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."permiso" (
  "id"          uuid NOT NULL DEFAULT gen_random_uuid(),
  "nombre"      text NOT NULL,
  "descripcion" text,
  CONSTRAINT "permiso_nombre_key" UNIQUE (nombre),
  CONSTRAINT "permiso_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."permiso"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."publicacion_recurso" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "campus_id"          uuid                     NOT NULL,
  "propietario_id"     uuid                     NOT NULL,
  "tipo_recurso"       text                     NOT NULL,
  "titulo"             text                     NOT NULL,
  "descripcion"        text,
  "modalidad"          text                     NOT NULL,
  "precio"             numeric(12,2),
  "moneda"             character(3)             NOT NULL DEFAULT 'CLP'::bpchar,
  "estado_publicacion" text                     NOT NULL DEFAULT 'DISPONIBLE'::text,
  "publicado_en"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at"         timestamp with time zone,
  CONSTRAINT "publicacion_precio_chk" CHECK ((((modalidad = 'DONACION'::text) AND (precio IS NULL)) OR ((modalidad = 'VENTA'::text) AND (precio IS
    NOT NULL) AND (precio > (0)::numeric)))),
  CONSTRAINT "publicacion_recurso_estado_publicacion_check"
    CHECK ((estado_publicacion = ANY (ARRAY['DISPONIBLE'::text, 'RESERVADA'::text, 'FINALIZADA'::text, 'CANCELADA'::text, 'OCULTA'::text]))),
  CONSTRAINT "publicacion_recurso_modalidad_check" CHECK ((modalidad = ANY (ARRAY['VENTA'::text, 'DONACION'::text]))),
  CONSTRAINT "publicacion_recurso_pkey" PRIMARY KEY (id),
  CONSTRAINT "publicacion_recurso_tipo_recurso_check" CHECK ((tipo_recurso = ANY (ARRAY['FISICO'::text, 'DIGITAL'::text])))
);

ALTER TABLE "public"."publicacion_recurso"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."recurso_digital_asignatura" (
  "publicacion_id" uuid NOT NULL,
  "asignatura_id"  uuid NOT NULL,
  CONSTRAINT "recurso_digital_asignatura_pkey" PRIMARY KEY (publicacion_id, asignatura_id)
);

ALTER TABLE "public"."recurso_digital_asignatura"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."recurso_digital_carrera" (
  "publicacion_id" uuid NOT NULL,
  "carrera_id"     uuid NOT NULL,
  CONSTRAINT "recurso_digital_carrera_pkey" PRIMARY KEY (publicacion_id, carrera_id)
);

ALTER TABLE "public"."recurso_digital_carrera"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."recurso_digital" (
  "publicacion_id"      uuid    NOT NULL,
  "licencia_confirmada" boolean NOT NULL DEFAULT false,
  "descargas_totales"   bigint  NOT NULL DEFAULT 0,
  CONSTRAINT "recurso_digital_descargas_totales_check" CHECK ((descargas_totales >= 0)),
  CONSTRAINT "recurso_digital_pkey" PRIMARY KEY (publicacion_id)
);

ALTER TABLE "public"."recurso_digital"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."recurso_fisico" (
  "publicacion_id" uuid NOT NULL,
  "categoria_id"   uuid,
  "estado_uso"     text,
  CONSTRAINT "recurso_fisico_estado_uso_check" CHECK (((estado_uso IS NULL) OR (estado_uso = ANY (ARRAY['NUEVO'::text, 'BUEN_ESTADO'::text, 'USADO'::text, 'DETERIORADO'::text])))),
  CONSTRAINT "recurso_fisico_pkey" PRIMARY KEY (publicacion_id)
);

ALTER TABLE "public"."recurso_fisico"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."reporte_contenido" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "reportante_id"   uuid                     NOT NULL,
  "resuelto_por_id" uuid,
  "campus_id"       uuid                     NOT NULL,
  "entidad_tipo"    text                     NOT NULL,
  "entidad_id"      text                     NOT NULL,
  "motivo"          text                     NOT NULL,
  "descripcion"     text,
  "estado_reporte"  text                     NOT NULL DEFAULT 'PENDIENTE'::text,
  "reportado_en"    timestamp with time zone NOT NULL DEFAULT now(),
  "resuelto_en"     timestamp with time zone,
  CONSTRAINT "reporte_contenido_estado_reporte_check" CHECK ((estado_reporte = ANY (ARRAY['PENDIENTE'::text, 'EN_REVISION'::text, 'RESUELTO'::text, 'DESESTIMADO'::text]))),
  CONSTRAINT "reporte_contenido_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."reporte_contenido"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."reporte" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "generado_por_id"     uuid                     NOT NULL,
  "institucion_id"      uuid                     NOT NULL,
  "campus_id"           uuid,
  "tipo_reporte"        text                     NOT NULL,
  "formato_exportacion" text,
  "filtros_json"        jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "snapshot_json"       jsonb                    NOT NULL,
  "periodo_desde"       timestamp with time zone,
  "periodo_hasta"       timestamp with time zone,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "reporte_check" CHECK (((periodo_hasta IS NULL) OR (periodo_desde IS NULL) OR (periodo_hasta >= periodo_desde))),
  CONSTRAINT "reporte_formato_exportacion_check" CHECK (((formato_exportacion IS NULL) OR (formato_exportacion = ANY (ARRAY['PDF'::text, 'EXCEL'::text])))),
  CONSTRAINT "reporte_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."reporte"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."rol_permiso" (
  "rol_id"     uuid NOT NULL,
  "permiso_id" uuid NOT NULL,
  CONSTRAINT "rol_permiso_pkey" PRIMARY KEY (rol_id, permiso_id)
);

ALTER TABLE "public"."rol_permiso"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."rol" (
  "id"          uuid NOT NULL DEFAULT gen_random_uuid(),
  "nombre"      text NOT NULL,
  "descripcion" text,
  CONSTRAINT "rol_nombre_key" UNIQUE (nombre),
  CONSTRAINT "rol_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."rol"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."solicitud_recurso" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "publicacion_id"   uuid                     NOT NULL,
  "solicitante_id"   uuid                     NOT NULL,
  "estado_solicitud" text                     NOT NULL DEFAULT 'PENDIENTE'::text,
  "codigo_mensaje"   text,
  "solicitada_en"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "solicitud_recurso_estado_solicitud_check" CHECK ((estado_solicitud = ANY (ARRAY['PENDIENTE'::text, 'ACEPTADA'::text, 'RECHAZADA'::text, 'CANCELADA'::text]))),
  CONSTRAINT "solicitud_recurso_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."solicitud_recurso"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."transaccion_recurso" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "solicitud_id"       uuid                     NOT NULL,
  "publicacion_id"     uuid                     NOT NULL,
  "propietario_id"     uuid                     NOT NULL,
  "receptor_id"        uuid                     NOT NULL,
  "cancelada_por_id"   uuid,
  "estado_transaccion" text                     NOT NULL DEFAULT 'RESERVADA'::text,
  "modalidad_acordada" text                     NOT NULL,
  "monto_acordado"     numeric(12,2),
  "moneda"             character(3)             NOT NULL DEFAULT 'CLP'::bpchar,
  "iniciada_en"        timestamp with time zone NOT NULL DEFAULT now(),
  "completada_en"      timestamp with time zone,
  "cancelada_en"       timestamp with time zone,
  CONSTRAINT "transaccion_cancelador_chk" CHECK (((cancelada_por_id IS NULL) OR ((cancelada_por_id = propietario_id) OR (cancelada_por_id = receptor_id)))),
  CONSTRAINT "transaccion_monto_chk" CHECK ((((modalidad_acordada = 'DONACION'::text) AND (monto_acordado IS NULL)) OR ((modalidad_acordada = 'VENTA'::text) AND (monto_acordado IS
    NOT NULL) AND (monto_acordado > (0)::numeric)))),
  CONSTRAINT "transaccion_partes_chk" CHECK ((propietario_id <> receptor_id)),
  CONSTRAINT "transaccion_recurso_estado_transaccion_check"
    CHECK ((estado_transaccion = ANY (ARRAY['RESERVADA'::text, 'PENDIENTE_CONFIRMACION'::text, 'COMPLETADA'::text, 'CANCELADA'::text]))),
  CONSTRAINT "transaccion_recurso_modalidad_acordada_check" CHECK ((modalidad_acordada = ANY (ARRAY['VENTA'::text, 'DONACION'::text]))),
  CONSTRAINT "transaccion_recurso_pkey" PRIMARY KEY (id),
  CONSTRAINT "transaccion_recurso_solicitud_id_key" UNIQUE (solicitud_id)
);

ALTER TABLE "public"."transaccion_recurso"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."usuario_carrera" (
  "perfil_usuario_id" uuid     NOT NULL,
  "carrera_id"        uuid     NOT NULL,
  "anio_ingreso"      smallint,
  CONSTRAINT "usuario_carrera_anio_ingreso_check" CHECK (((anio_ingreso IS NULL) OR ((anio_ingreso >= 1900) AND (anio_ingreso <= 2200)))),
  CONSTRAINT "usuario_carrera_pkey" PRIMARY KEY (perfil_usuario_id, carrera_id)
);

ALTER TABLE "public"."usuario_carrera"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."usuario_permiso" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "perfil_usuario_id" uuid                     NOT NULL,
  "permiso_id"        uuid                     NOT NULL,
  "campus_id"         uuid                     NOT NULL,
  "otorgado_por_id"   uuid,
  "otorgado_en"       timestamp with time zone NOT NULL DEFAULT now(),
  "revocado_en"       timestamp with time zone,
  CONSTRAINT "usuario_permiso_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."usuario_permiso"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."usuario_rol" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "perfil_usuario_id" uuid                     NOT NULL,
  "rol_id"            uuid                     NOT NULL,
  "campus_id"         uuid                     NOT NULL,
  "asignado_por_id"   uuid,
  "asignado_en"       timestamp with time zone NOT NULL DEFAULT now(),
  "revocado_en"       timestamp with time zone,
  CONSTRAINT "usuario_rol_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."usuario_rol"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."valoracion" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "transaccion_id" uuid                     NOT NULL,
  "evaluador_id"   uuid                     NOT NULL,
  "evaluado_id"    uuid                     NOT NULL,
  "puntuacion"     smallint                 NOT NULL,
  "comentario"     text,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "valoracion_check" CHECK ((evaluador_id <> evaluado_id)),
  CONSTRAINT "valoracion_pkey" PRIMARY KEY (id),
  CONSTRAINT "valoracion_puntuacion_check" CHECK (((puntuacion >= 1) AND (puntuacion <= 5))),
  CONSTRAINT "valoracion_transaccion_id_key" UNIQUE (transaccion_id)
);

ALTER TABLE "public"."valoracion"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app_private.block_tipo_change_with_subtype()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  if new.tipo_recurso is distinct from old.tipo_recurso and (
      exists(select 1 from public.recurso_digital where publicacion_id=old.id)
      or exists(select 1 from public.recurso_fisico where publicacion_id=old.id)
  ) then raise exception 'No se puede cambiar tipo_recurso después de crear el subtipo'; end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION app_private.current_campus_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'auth'
  AS $function$
  select campus_id from public.perfil_usuario where id=(select auth.uid()) and deleted_at is null and estado_cuenta='ACTIVA';
$function$;

CREATE OR REPLACE FUNCTION app_private.current_institution_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'auth'
  AS $function$
  select institucion_id from public.perfil_usuario where id=(select auth.uid()) and deleted_at is null and estado_cuenta='ACTIVA';
$function$;

CREATE OR REPLACE FUNCTION app_private.has_permission (
  p_permission text,
  p_campus     uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'auth'
  AS $function$
  select
    exists(
      select 1 from public.usuario_permiso up join public.permiso p on p.id=up.permiso_id
      where up.perfil_usuario_id=(select auth.uid()) and up.campus_id=p_campus
        and up.revocado_en is null and p.nombre=p_permission
        and exists(select 1 from public.perfil_usuario pu where pu.id=up.perfil_usuario_id and pu.estado_cuenta='ACTIVA' and pu.deleted_at is null)
    )
    or exists(
      select 1
      from public.usuario_rol ur
      join public.rol_permiso rp on rp.rol_id=ur.rol_id
      join public.permiso p on p.id=rp.permiso_id
      where ur.perfil_usuario_id=(select auth.uid()) and ur.campus_id=p_campus
        and ur.revocado_en is null and p.nombre=p_permission
        and exists(select 1 from public.perfil_usuario pu where pu.id=ur.perfil_usuario_id and pu.estado_cuenta='ACTIVA' and pu.deleted_at is null)
    );
$function$;

CREATE OR REPLACE FUNCTION app_private.has_permission_in_institution (
  p_permission  text,
  p_institution uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'auth'
  AS $function$
  select exists(
    select 1 from public.usuario_permiso up
    join public.permiso p on p.id=up.permiso_id
    join public.campus c on c.id=up.campus_id
    where up.perfil_usuario_id=(select auth.uid()) and up.revocado_en is null
      and c.institucion_id=p_institution and p.nombre=p_permission
  ) or exists(
    select 1 from public.usuario_rol ur
    join public.rol_permiso rp on rp.rol_id=ur.rol_id
    join public.permiso p on p.id=rp.permiso_id
    join public.campus c on c.id=ur.campus_id
    where ur.perfil_usuario_id=(select auth.uid()) and ur.revocado_en is null
      and c.institucion_id=p_institution and p.nombre=p_permission
  );
$function$;

CREATE OR REPLACE FUNCTION app_private.has_role (
  p_role   text,
  p_campus uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'auth'
  AS $function$
  select exists(
    select 1 from public.usuario_rol ur join public.rol r on r.id=ur.rol_id
    where ur.perfil_usuario_id=(select auth.uid()) and ur.campus_id=p_campus
      and ur.revocado_en is null and r.nombre=p_role
      and exists(select 1 from public.perfil_usuario pu where pu.id=ur.perfil_usuario_id and pu.estado_cuenta='ACTIVA' and pu.deleted_at is null)
  );
$function$;

CREATE OR REPLACE FUNCTION app_private.refresh_reputacion()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
declare target uuid;
begin
  target := coalesce(new.evaluado_id, old.evaluado_id);
  update public.perfil_usuario p
    set reputacion_promedio = coalesce((select round(avg(v.puntuacion)::numeric,2) from public.valoracion v where v.evaluado_id=target),0)
  where p.id=target;
  return coalesce(new,old);
end; $function$;

CREATE OR REPLACE FUNCTION app_private.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  new.updated_at := now();
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION app_private.validate_campus_carrera()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
declare ci uuid; ri uuid;
begin
  select institucion_id into ci from public.campus where id = new.campus_id;
  select institucion_id into ri from public.carrera where id = new.carrera_id;
  if ci is distinct from ri then
    raise exception 'Campus y carrera deben pertenecer a la misma institución';
  end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION app_private.validate_perfil_scope()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
declare ci uuid;
begin
  if new.campus_id is not null then
    select institucion_id into ci from public.campus where id = new.campus_id;
    if ci is distinct from new.institucion_id then
      raise exception 'El campus del perfil no pertenece a su institución';
    end if;
  end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION app_private.validate_publicacion_scope()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
declare owner_campus uuid; owner_inst uuid; campus_inst uuid;
begin
  select campus_id, institucion_id into owner_campus, owner_inst from public.perfil_usuario where id=new.propietario_id and deleted_at is null;
  select institucion_id into campus_inst from public.campus where id=new.campus_id;
  if owner_inst is distinct from campus_inst then raise exception 'Propietario y publicación deben pertenecer a la misma institución'; end if;
  if owner_campus is null or owner_campus is distinct from new.campus_id then raise exception 'La publicación debe pertenecer al campus actual del propietario'; end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION app_private.validate_solicitud_insert()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
declare p_owner uuid; p_campus uuid; p_tipo text; p_estado text; u_campus uuid;
begin
  select propietario_id, campus_id, tipo_recurso, estado_publicacion
    into p_owner, p_campus, p_tipo, p_estado
  from public.publicacion_recurso where id = new.publicacion_id and deleted_at is null;
  if p_owner is null then raise exception 'Publicación no disponible'; end if;
  if new.solicitante_id = p_owner then raise exception 'El propietario no puede solicitar su propia publicación'; end if;
  select campus_id into u_campus from public.perfil_usuario where id = new.solicitante_id and deleted_at is null and estado_cuenta = 'ACTIVA';
  if u_campus is distinct from p_campus then raise exception 'La solicitud debe ser dentro del mismo campus'; end if;
  if p_tipo = 'FISICO' and p_estado <> 'DISPONIBLE' then raise exception 'El recurso físico no está disponible'; end if;
  if p_tipo = 'DIGITAL' and p_estado not in ('DISPONIBLE','RESERVADA') then raise exception 'El recurso digital no está disponible'; end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION app_private.validate_subtipo_publicacion()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
declare esperado text; actual text;
begin
  esperado := case when tg_table_name = 'recurso_digital' then 'DIGITAL' else 'FISICO' end;
  select tipo_recurso into actual from public.publicacion_recurso where id = new.publicacion_id;
  if actual is null then raise exception 'Publicación inexistente'; end if;
  if actual <> esperado then
    raise exception 'Subtipo % incompatible con publicación tipo %', esperado, actual;
  end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION app_private.validate_usuario_carrera()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
declare ui uuid; ci uuid; uc uuid;
begin
  select institucion_id, campus_id into ui, uc from public.perfil_usuario where id = new.perfil_usuario_id;
  select institucion_id into ci from public.carrera where id = new.carrera_id;
  if ui is distinct from ci then
    raise exception 'La carrera no pertenece a la institución del usuario';
  end if;
  if uc is not null and not exists (select 1 from public.campus_carrera cc where cc.campus_id=uc and cc.carrera_id=new.carrera_id) then
    raise exception 'La carrera no está ofrecida en el campus actual del usuario';
  end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION app_private.validate_valoracion()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
declare t public.transaccion_recurso%rowtype;
begin
  select * into t from public.transaccion_recurso where id=new.transaccion_id;
  if not found or t.estado_transaccion <> 'COMPLETADA' then raise exception 'Solo se valora una transacción completada'; end if;
  if new.evaluador_id <> t.receptor_id or new.evaluado_id <> t.propietario_id then
    raise exception 'La valoración debe ser receptor -> propietario';
  end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.aceptar_solicitud (
  p_solicitud_id uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'auth', 'pg_temp'
  AS $function$
declare
  s public.solicitud_recurso%rowtype;
  p public.publicacion_recurso%rowtype;
  tx_id uuid;
begin
  select * into s from public.solicitud_recurso where id = p_solicitud_id for update;
  if not found then raise exception 'Solicitud inexistente'; end if;
  if s.estado_solicitud <> 'PENDIENTE' then raise exception 'La solicitud no está pendiente'; end if;

  select * into p from public.publicacion_recurso where id = s.publicacion_id for update;
  if auth.uid() is distinct from p.propietario_id then raise exception 'Solo el propietario puede aceptar'; end if;
  if p.deleted_at is not null or p.estado_publicacion in ('FINALIZADA','CANCELADA','OCULTA') then
    raise exception 'Publicación no disponible';
  end if;
  if p.tipo_recurso = 'FISICO' and p.estado_publicacion <> 'DISPONIBLE' then
    raise exception 'El recurso físico ya está reservado o no disponible';
  end if;

  update public.solicitud_recurso set estado_solicitud='ACEPTADA', updated_at=now() where id=s.id;

  if p.tipo_recurso = 'FISICO' then
    update public.publicacion_recurso set estado_publicacion='RESERVADA', updated_at=now() where id=p.id;
  end if;

  insert into public.transaccion_recurso(
    solicitud_id, publicacion_id, propietario_id, receptor_id,
    estado_transaccion, modalidad_acordada, monto_acordado, moneda
  ) values (
    s.id, p.id, p.propietario_id, s.solicitante_id,
    'RESERVADA', p.modalidad, p.precio, p.moneda
  ) returning id into tx_id;

  -- Regla vigente: las otras solicitudes siguen PENDIENTE.
  return tx_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.cancelar_transaccion (
  p_transaccion_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'auth', 'pg_temp'
  AS $function$
declare t public.transaccion_recurso%rowtype; tipo text;
begin
  select * into t from public.transaccion_recurso where id=p_transaccion_id for update;
  if not found then raise exception 'Transacción inexistente'; end if;
  if auth.uid() not in (t.propietario_id, t.receptor_id) then raise exception 'No participa en la transacción'; end if;
  if t.estado_transaccion in ('COMPLETADA','CANCELADA') then raise exception 'La transacción ya está cerrada'; end if;

  update public.transaccion_recurso
    set estado_transaccion='CANCELADA', cancelada_por_id=auth.uid(), cancelada_en=now()
  where id=t.id;
  update public.solicitud_recurso set estado_solicitud='CANCELADA', updated_at=now() where id=t.solicitud_id;

  select tipo_recurso into tipo from public.publicacion_recurso where id=t.publicacion_id;
  if tipo='FISICO' then
    update public.publicacion_recurso set estado_publicacion='DISPONIBLE', updated_at=now() where id=t.publicacion_id;
  end if;
  -- Las demás solicitudes que ya estaban PENDIENTE permanecen PENDIENTE.
end; $function$;

CREATE OR REPLACE FUNCTION public.confirmar_transaccion (
  p_transaccion_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'auth', 'pg_temp'
  AS $function$
declare t public.transaccion_recurso%rowtype; parte text; n integer; tipo text;
begin
  select * into t from public.transaccion_recurso where id=p_transaccion_id for update;
  if not found then raise exception 'Transacción inexistente'; end if;
  if t.estado_transaccion in ('COMPLETADA','CANCELADA') then raise exception 'La transacción ya está cerrada'; end if;

  if auth.uid() = t.propietario_id then parte := 'PROPIETARIO';
  elsif auth.uid() = t.receptor_id then parte := 'RECEPTOR';
  else raise exception 'No participa en la transacción'; end if;

  insert into public.confirmacion_transaccion(transaccion_id, usuario_id, rol_confirmante)
  values (t.id, auth.uid(), parte)
  on conflict (transaccion_id, usuario_id) do nothing;

  select count(*) into n from public.confirmacion_transaccion where transaccion_id=t.id;
  if n >= 2 then
    update public.transaccion_recurso set estado_transaccion='COMPLETADA', completada_en=now() where id=t.id;
    select tipo_recurso into tipo from public.publicacion_recurso where id=t.publicacion_id;
    if tipo='FISICO' then
      update public.publicacion_recurso set estado_publicacion='FINALIZADA', updated_at=now() where id=t.publicacion_id;
    else
      update public.publicacion_recurso set estado_publicacion='DISPONIBLE', updated_at=now() where id=t.publicacion_id;
    end if;
  else
    update public.transaccion_recurso set estado_transaccion='PENDIENTE_CONFIRMACION' where id=t.id;
  end if;
end; $function$;

CREATE OR REPLACE FUNCTION public.rechazar_solicitud (
  p_solicitud_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'auth', 'pg_temp'
  AS $function$
declare owner_id uuid; st text;
begin
  select p.propietario_id, s.estado_solicitud into owner_id, st
  from public.solicitud_recurso s join public.publicacion_recurso p on p.id=s.publicacion_id
  where s.id=p_solicitud_id for update of s;
  if owner_id is null then raise exception 'Solicitud inexistente'; end if;
  if auth.uid() is distinct from owner_id then raise exception 'Solo el propietario puede rechazar'; end if;
  if st <> 'PENDIENTE' then raise exception 'Solo se puede rechazar una solicitud pendiente'; end if;
  update public.solicitud_recurso set estado_solicitud='RECHAZADA', updated_at=now() where id=p_solicitud_id;
end; $function$;

ALTER TABLE "public"."auditoria"
  ADD CONSTRAINT "auditoria_campus_id_fkey" FOREIGN KEY (campus_id) REFERENCES public.campus(id) ON DELETE SET NULL;

ALTER TABLE "public"."campus_carrera"
  ADD CONSTRAINT "campus_carrera_campus_id_fkey" FOREIGN KEY (campus_id) REFERENCES public.campus(id) ON DELETE CASCADE;

ALTER TABLE "public"."campus_carrera"
  ADD CONSTRAINT "campus_carrera_carrera_id_fkey" FOREIGN KEY (carrera_id) REFERENCES public.carrera(id) ON DELETE CASCADE;

ALTER TABLE "public"."carrera_asignatura"
  ADD CONSTRAINT "carrera_asignatura_asignatura_id_fkey" FOREIGN KEY (asignatura_id) REFERENCES public.asignatura(id) ON DELETE RESTRICT;

ALTER TABLE "public"."carrera_asignatura"
  ADD CONSTRAINT "carrera_asignatura_carrera_id_fkey" FOREIGN KEY (carrera_id) REFERENCES public.carrera(id) ON DELETE CASCADE;

ALTER TABLE "public"."auditoria"
  ADD CONSTRAINT "auditoria_institucion_id_fkey" FOREIGN KEY (institucion_id) REFERENCES public.institucion(id) ON DELETE RESTRICT;

ALTER TABLE "public"."campus"
  ADD CONSTRAINT "campus_institucion_id_fkey" FOREIGN KEY (institucion_id) REFERENCES public.institucion(id) ON DELETE RESTRICT;

ALTER TABLE "public"."carrera"
  ADD CONSTRAINT "carrera_institucion_id_fkey" FOREIGN KEY (institucion_id) REFERENCES public.institucion(id) ON DELETE RESTRICT;

ALTER TABLE "public"."interaccion_recurso"
  ADD CONSTRAINT "interaccion_recurso_campus_id_fkey" FOREIGN KEY (campus_id) REFERENCES public.campus(id) ON DELETE RESTRICT;

ALTER TABLE "public"."perfil_usuario"
  ADD CONSTRAINT "perfil_usuario_campus_id_fkey" FOREIGN KEY (campus_id) REFERENCES public.campus(id) ON DELETE SET NULL;

ALTER TABLE "public"."perfil_usuario"
  ADD CONSTRAINT "perfil_usuario_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE "public"."perfil_usuario"
  ADD CONSTRAINT "perfil_usuario_institucion_id_fkey" FOREIGN KEY (institucion_id) REFERENCES public.institucion(id) ON DELETE RESTRICT;

ALTER TABLE "public"."auditoria"
  ADD CONSTRAINT "auditoria_actor_usuario_id_fkey" FOREIGN KEY (actor_usuario_id) REFERENCES public.perfil_usuario(id) ON DELETE SET NULL;

ALTER TABLE "public"."confirmacion_transaccion"
  ADD CONSTRAINT "confirmacion_transaccion_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES public.perfil_usuario(id) ON DELETE RESTRICT;

ALTER TABLE "public"."interaccion_recurso"
  ADD CONSTRAINT "interaccion_recurso_perfil_usuario_id_fkey" FOREIGN KEY (perfil_usuario_id) REFERENCES public.perfil_usuario(id) ON DELETE CASCADE;

ALTER TABLE "public"."notificacion"
  ADD CONSTRAINT "notificacion_destinatario_id_fkey" FOREIGN KEY (destinatario_id) REFERENCES public.perfil_usuario(id) ON DELETE CASCADE;

ALTER TABLE "public"."publicacion_recurso"
  ADD CONSTRAINT "publicacion_recurso_campus_id_fkey" FOREIGN KEY (campus_id) REFERENCES public.campus(id) ON DELETE RESTRICT;

ALTER TABLE "public"."archivo_publicacion"
  ADD CONSTRAINT "archivo_publicacion_publicacion_id_fkey" FOREIGN KEY (publicacion_id) REFERENCES public.publicacion_recurso(id) ON DELETE CASCADE;

ALTER TABLE "public"."interaccion_recurso"
  ADD CONSTRAINT "interaccion_recurso_publicacion_id_fkey" FOREIGN KEY (publicacion_id) REFERENCES public.publicacion_recurso(id) ON DELETE CASCADE;

ALTER TABLE "public"."notificacion"
  ADD CONSTRAINT "notificacion_publicacion_id_fkey" FOREIGN KEY (publicacion_id) REFERENCES public.publicacion_recurso(id) ON DELETE SET NULL;

ALTER TABLE "public"."publicacion_recurso"
  ADD CONSTRAINT "publicacion_recurso_propietario_id_fkey" FOREIGN KEY (propietario_id) REFERENCES public.perfil_usuario(id) ON DELETE RESTRICT;

ALTER TABLE "public"."recurso_digital"
  ADD CONSTRAINT "recurso_digital_publicacion_id_fkey" FOREIGN KEY (publicacion_id) REFERENCES public.publicacion_recurso(id) ON DELETE CASCADE;

ALTER TABLE "public"."recurso_digital_asignatura"
  ADD CONSTRAINT "recurso_digital_asignatura_asignatura_id_fkey" FOREIGN KEY (asignatura_id) REFERENCES public.asignatura(id) ON DELETE RESTRICT;

ALTER TABLE "public"."recurso_digital_asignatura"
  ADD CONSTRAINT "recurso_digital_asignatura_publicacion_id_fkey" FOREIGN KEY (publicacion_id) REFERENCES public.recurso_digital(publicacion_id) ON DELETE CASCADE;

ALTER TABLE "public"."recurso_digital_carrera"
  ADD CONSTRAINT "recurso_digital_carrera_carrera_id_fkey" FOREIGN KEY (carrera_id) REFERENCES public.carrera(id) ON DELETE RESTRICT;

ALTER TABLE "public"."recurso_digital_carrera"
  ADD CONSTRAINT "recurso_digital_carrera_publicacion_id_fkey" FOREIGN KEY (publicacion_id) REFERENCES public.recurso_digital(publicacion_id) ON DELETE CASCADE;

ALTER TABLE "public"."recurso_fisico"
  ADD CONSTRAINT "recurso_fisico_categoria_id_fkey" FOREIGN KEY (categoria_id) REFERENCES public.categoria_recurso_fisico(id) ON DELETE RESTRICT;

ALTER TABLE "public"."recurso_fisico"
  ADD CONSTRAINT "recurso_fisico_publicacion_id_fkey" FOREIGN KEY (publicacion_id) REFERENCES public.publicacion_recurso(id) ON DELETE CASCADE;

ALTER TABLE "public"."reporte"
  ADD CONSTRAINT "reporte_campus_id_fkey" FOREIGN KEY (campus_id) REFERENCES public.campus(id) ON DELETE RESTRICT;

ALTER TABLE "public"."reporte"
  ADD CONSTRAINT "reporte_generado_por_id_fkey" FOREIGN KEY (generado_por_id) REFERENCES public.perfil_usuario(id) ON DELETE RESTRICT;

ALTER TABLE "public"."reporte"
  ADD CONSTRAINT "reporte_institucion_id_fkey" FOREIGN KEY (institucion_id) REFERENCES public.institucion(id) ON DELETE RESTRICT;

ALTER TABLE "public"."reporte_contenido"
  ADD CONSTRAINT "reporte_contenido_campus_id_fkey" FOREIGN KEY (campus_id) REFERENCES public.campus(id) ON DELETE RESTRICT;

ALTER TABLE "public"."reporte_contenido"
  ADD CONSTRAINT "reporte_contenido_reportante_id_fkey" FOREIGN KEY (reportante_id) REFERENCES public.perfil_usuario(id) ON DELETE RESTRICT;

ALTER TABLE "public"."reporte_contenido"
  ADD CONSTRAINT "reporte_contenido_resuelto_por_id_fkey" FOREIGN KEY (resuelto_por_id) REFERENCES public.perfil_usuario(id) ON DELETE SET NULL;

ALTER TABLE "public"."rol_permiso"
  ADD CONSTRAINT "rol_permiso_permiso_id_fkey" FOREIGN KEY (permiso_id) REFERENCES public.permiso(id) ON DELETE CASCADE;

ALTER TABLE "public"."rol_permiso"
  ADD CONSTRAINT "rol_permiso_rol_id_fkey" FOREIGN KEY (rol_id) REFERENCES public.rol(id) ON DELETE CASCADE;

ALTER TABLE "public"."solicitud_recurso"
  ADD CONSTRAINT "solicitud_recurso_publicacion_id_fkey" FOREIGN KEY (publicacion_id) REFERENCES public.publicacion_recurso(id) ON DELETE RESTRICT;

ALTER TABLE "public"."solicitud_recurso"
  ADD CONSTRAINT "solicitud_recurso_solicitante_id_fkey" FOREIGN KEY (solicitante_id) REFERENCES public.perfil_usuario(id) ON DELETE RESTRICT;

ALTER TABLE "public"."transaccion_recurso"
  ADD CONSTRAINT "transaccion_recurso_cancelada_por_id_fkey" FOREIGN KEY (cancelada_por_id) REFERENCES public.perfil_usuario(id) ON DELETE RESTRICT;

ALTER TABLE "public"."confirmacion_transaccion"
  ADD CONSTRAINT "confirmacion_transaccion_transaccion_id_fkey" FOREIGN KEY (transaccion_id) REFERENCES public.transaccion_recurso(id) ON DELETE CASCADE;

ALTER TABLE "public"."notificacion"
  ADD CONSTRAINT "notificacion_transaccion_id_fkey" FOREIGN KEY (transaccion_id) REFERENCES public.transaccion_recurso(id) ON DELETE SET NULL;

ALTER TABLE "public"."transaccion_recurso"
  ADD CONSTRAINT "transaccion_recurso_propietario_id_fkey" FOREIGN KEY (propietario_id) REFERENCES public.perfil_usuario(id) ON DELETE RESTRICT;

ALTER TABLE "public"."transaccion_recurso"
  ADD CONSTRAINT "transaccion_recurso_publicacion_id_fkey" FOREIGN KEY (publicacion_id) REFERENCES public.publicacion_recurso(id) ON DELETE RESTRICT;

ALTER TABLE "public"."transaccion_recurso"
  ADD CONSTRAINT "transaccion_recurso_receptor_id_fkey" FOREIGN KEY (receptor_id) REFERENCES public.perfil_usuario(id) ON DELETE RESTRICT;

ALTER TABLE "public"."transaccion_recurso"
  ADD CONSTRAINT "transaccion_recurso_solicitud_id_fkey" FOREIGN KEY (solicitud_id) REFERENCES public.solicitud_recurso(id) ON DELETE RESTRICT;

ALTER TABLE "public"."usuario_carrera"
  ADD CONSTRAINT "usuario_carrera_carrera_id_fkey" FOREIGN KEY (carrera_id) REFERENCES public.carrera(id) ON DELETE RESTRICT;

ALTER TABLE "public"."usuario_carrera"
  ADD CONSTRAINT "usuario_carrera_perfil_usuario_id_fkey" FOREIGN KEY (perfil_usuario_id) REFERENCES public.perfil_usuario(id) ON DELETE CASCADE;

ALTER TABLE "public"."usuario_permiso"
  ADD CONSTRAINT "usuario_permiso_campus_id_fkey" FOREIGN KEY (campus_id) REFERENCES public.campus(id) ON DELETE RESTRICT;

ALTER TABLE "public"."usuario_permiso"
  ADD CONSTRAINT "usuario_permiso_otorgado_por_id_fkey" FOREIGN KEY (otorgado_por_id) REFERENCES public.perfil_usuario(id) ON DELETE SET NULL;

ALTER TABLE "public"."usuario_permiso"
  ADD CONSTRAINT "usuario_permiso_perfil_usuario_id_fkey" FOREIGN KEY (perfil_usuario_id) REFERENCES public.perfil_usuario(id) ON DELETE CASCADE;

ALTER TABLE "public"."usuario_permiso"
  ADD CONSTRAINT "usuario_permiso_permiso_id_fkey" FOREIGN KEY (permiso_id) REFERENCES public.permiso(id) ON DELETE RESTRICT;

ALTER TABLE "public"."usuario_rol"
  ADD CONSTRAINT "usuario_rol_asignado_por_id_fkey" FOREIGN KEY (asignado_por_id) REFERENCES public.perfil_usuario(id) ON DELETE SET NULL;

ALTER TABLE "public"."usuario_rol"
  ADD CONSTRAINT "usuario_rol_campus_id_fkey" FOREIGN KEY (campus_id) REFERENCES public.campus(id) ON DELETE RESTRICT;

ALTER TABLE "public"."usuario_rol"
  ADD CONSTRAINT "usuario_rol_perfil_usuario_id_fkey" FOREIGN KEY (perfil_usuario_id) REFERENCES public.perfil_usuario(id) ON DELETE CASCADE;

ALTER TABLE "public"."usuario_rol"
  ADD CONSTRAINT "usuario_rol_rol_id_fkey" FOREIGN KEY (rol_id) REFERENCES public.rol(id) ON DELETE RESTRICT;

ALTER TABLE "public"."valoracion"
  ADD CONSTRAINT "valoracion_evaluado_id_fkey" FOREIGN KEY (evaluado_id) REFERENCES public.perfil_usuario(id) ON DELETE RESTRICT;

ALTER TABLE "public"."valoracion"
  ADD CONSTRAINT "valoracion_evaluador_id_fkey" FOREIGN KEY (evaluador_id) REFERENCES public.perfil_usuario(id) ON DELETE RESTRICT;

ALTER TABLE "public"."valoracion"
  ADD CONSTRAINT "valoracion_transaccion_id_fkey" FOREIGN KEY (transaccion_id) REFERENCES public.transaccion_recurso(id) ON DELETE RESTRICT;

CREATE VIEW "public"."v_demanda_recursos" WITH (security_invoker=true) AS  SELECT p.id AS publicacion_id,
    p.campus_id,
    p.titulo,
    p.tipo_recurso,
    count(DISTINCT i.id) FILTER (WHERE (i.tipo_interaccion = 'VISTA'::text)) AS vistas,
    count(DISTINCT s.id) AS solicitudes,
    count(DISTINCT t.id) FILTER (WHERE (t.estado_transaccion = 'COMPLETADA'::text)) AS transacciones_completadas
   FROM (((public.publicacion_recurso p
     LEFT JOIN public.interaccion_recurso i ON ((i.publicacion_id = p.id)))
     LEFT JOIN public.solicitud_recurso s ON ((s.publicacion_id = p.id)))
     LEFT JOIN public.transaccion_recurso t ON ((t.publicacion_id = p.id)))
  GROUP BY p.id, p.campus_id, p.titulo, p.tipo_recurso;

CREATE VIEW "public"."v_publicaciones_disponibles" WITH (security_invoker=true) AS  SELECT p.id,
    p.campus_id,
    p.propietario_id,
    p.tipo_recurso,
    p.titulo,
    p.descripcion,
    p.modalidad,
    p.precio,
    p.moneda,
    p.estado_publicacion,
    p.publicado_en,
    u.nombre_completo AS propietario_nombre,
    u.reputacion_promedio
   FROM (public.publicacion_recurso p
     JOIN public.perfil_usuario u ON ((u.id = p.propietario_id)))
  WHERE ((p.deleted_at IS NULL) AND (p.estado_publicacion = 'DISPONIBLE'::text));

CREATE VIEW "public"."v_recurso_digital_contexto" WITH (security_invoker=true) AS  SELECT rd.publicacion_id,
    array_remove(array_agg(DISTINCT c.nombre), NULL::text) AS carreras,
    array_remove(array_agg(DISTINCT a.nombre), NULL::text) AS asignaturas
   FROM ((((public.recurso_digital rd
     LEFT JOIN public.recurso_digital_carrera rdc ON ((rdc.publicacion_id = rd.publicacion_id)))
     LEFT JOIN public.carrera c ON ((c.id = rdc.carrera_id)))
     LEFT JOIN public.recurso_digital_asignatura rda ON ((rda.publicacion_id = rd.publicacion_id)))
     LEFT JOIN public.asignatura a ON ((a.id = rda.asignatura_id)))
  GROUP BY rd.publicacion_id;

CREATE VIEW "public"."v_transacciones_detalle" WITH (security_invoker=true) AS  SELECT t.id,
    t.publicacion_id,
    p.titulo,
    p.tipo_recurso,
    t.propietario_id,
    po.nombre_completo AS propietario_nombre,
    t.receptor_id,
    pr.nombre_completo AS receptor_nombre,
    t.estado_transaccion,
    t.modalidad_acordada,
    t.monto_acordado,
    t.moneda,
    t.iniciada_en,
    t.completada_en,
    t.cancelada_en
   FROM (((public.transaccion_recurso t
     JOIN public.publicacion_recurso p ON ((p.id = t.publicacion_id)))
     JOIN public.perfil_usuario po ON ((po.id = t.propietario_id)))
     JOIN public.perfil_usuario pr ON ((pr.id = t.receptor_id)));

CREATE VIEW "public"."v_usuario_autorizacion_activa" WITH (security_invoker=true) AS  SELECT ur.perfil_usuario_id,
    ur.campus_id,
    r.nombre AS rol,
    NULL::text AS permiso,
    'ROL'::text AS origen
   FROM (public.usuario_rol ur
     JOIN public.rol r ON ((r.id = ur.rol_id)))
  WHERE (ur.revocado_en IS NULL)
UNION ALL
 SELECT up.perfil_usuario_id,
    up.campus_id,
    NULL::text AS rol,
    p.nombre AS permiso,
    'PERMISO_DIRECTO'::text AS origen
   FROM (public.usuario_permiso up
     JOIN public.permiso p ON ((p.id = up.permiso_id)))
  WHERE (up.revocado_en IS NULL)
UNION ALL
 SELECT ur.perfil_usuario_id,
    ur.campus_id,
    r.nombre AS rol,
    p.nombre AS permiso,
    'PERMISO_ROL'::text AS origen
   FROM (((public.usuario_rol ur
     JOIN public.rol r ON ((r.id = ur.rol_id)))
     JOIN public.rol_permiso rp ON ((rp.rol_id = r.id)))
     JOIN public.permiso p ON ((p.id = rp.permiso_id)))
  WHERE (ur.revocado_en IS NULL);

CREATE INDEX archivo_publicacion_publicacion_idx ON public.archivo_publicacion USING btree (publicacion_id);

CREATE INDEX auditoria_scope_fecha_idx ON public.auditoria USING btree (institucion_id, campus_id, created_at DESC);

CREATE INDEX campus_carrera_carrera_idx ON public.campus_carrera USING btree (carrera_id);

CREATE INDEX campus_institucion_idx ON public.campus USING btree (institucion_id);

CREATE INDEX carrera_asignatura_asignatura_idx ON public.carrera_asignatura USING btree (asignatura_id);

CREATE INDEX carrera_institucion_idx ON public.carrera USING btree (institucion_id);

CREATE INDEX interaccion_publicacion_fecha_idx ON public.interaccion_recurso USING btree (publicacion_id, created_at DESC);

CREATE INDEX interaccion_usuario_fecha_idx ON public.interaccion_recurso USING btree (perfil_usuario_id, created_at DESC);

CREATE INDEX notificacion_destinatario_idx ON public.notificacion USING btree (destinatario_id, created_at DESC);

CREATE INDEX perfil_campus_idx ON public.perfil_usuario USING btree (campus_id);

CREATE INDEX perfil_institucion_idx ON public.perfil_usuario USING btree (institucion_id);

CREATE INDEX publicacion_campus_estado_idx ON public.publicacion_recurso USING btree (campus_id, estado_publicacion)
  WHERE (deleted_at IS NULL);

CREATE INDEX publicacion_propietario_idx ON public.publicacion_recurso USING btree (propietario_id);

CREATE INDEX rd_asignatura_asignatura_idx ON public.recurso_digital_asignatura USING btree (asignatura_id);

CREATE INDEX rd_carrera_carrera_idx ON public.recurso_digital_carrera USING btree (carrera_id);

CREATE INDEX reporte_contenido_campus_estado_idx ON public.reporte_contenido USING btree (campus_id, estado_reporte);

CREATE INDEX reporte_institucion_campus_fecha_idx ON public.reporte USING btree (institucion_id, campus_id, created_at DESC);

CREATE UNIQUE INDEX solicitud_activa_uq ON public.solicitud_recurso USING btree (publicacion_id, solicitante_id)
  WHERE (estado_solicitud = ANY (ARRAY['PENDIENTE'::text, 'ACEPTADA'::text]));

CREATE INDEX solicitud_publicacion_idx ON public.solicitud_recurso USING btree (publicacion_id);

CREATE INDEX solicitud_solicitante_idx ON public.solicitud_recurso USING btree (solicitante_id);

CREATE INDEX transaccion_propietario_idx ON public.transaccion_recurso USING btree (propietario_id);

CREATE INDEX transaccion_publicacion_idx ON public.transaccion_recurso USING btree (publicacion_id);

CREATE INDEX transaccion_receptor_idx ON public.transaccion_recurso USING btree (receptor_id);

CREATE INDEX usuario_carrera_carrera_idx ON public.usuario_carrera USING btree (carrera_id);

CREATE UNIQUE INDEX usuario_permiso_activo_uq ON public.usuario_permiso USING btree (perfil_usuario_id, permiso_id, campus_id)
  WHERE (revocado_en IS NULL);

CREATE INDEX usuario_permiso_campus_idx ON public.usuario_permiso USING btree (campus_id);

CREATE INDEX usuario_permiso_usuario_idx ON public.usuario_permiso USING btree (perfil_usuario_id);

CREATE UNIQUE INDEX usuario_rol_activo_uq ON public.usuario_rol USING btree (perfil_usuario_id, campus_id)
  WHERE (revocado_en IS NULL);

CREATE INDEX usuario_rol_campus_idx ON public.usuario_rol USING btree (campus_id);

CREATE INDEX usuario_rol_usuario_idx ON public.usuario_rol USING btree (perfil_usuario_id);

CREATE INDEX valoracion_evaluado_idx ON public.valoracion USING btree (evaluado_id);

CREATE TRIGGER asignatura_set_updated_at
  BEFORE UPDATE ON public.asignatura
  FOR EACH ROW
  EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER campus_set_updated_at
  BEFORE UPDATE ON public.campus
  FOR EACH ROW
  EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER campus_carrera_same_institution
  BEFORE INSERT OR UPDATE ON public.campus_carrera
  FOR EACH ROW
  EXECUTE FUNCTION app_private.validate_campus_carrera();

CREATE TRIGGER carrera_set_updated_at
  BEFORE UPDATE ON public.carrera
  FOR EACH ROW
  EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER perfil_scope_check
  BEFORE INSERT OR UPDATE OF institucion_id, campus_id ON public.perfil_usuario
  FOR EACH ROW
  EXECUTE FUNCTION app_private.validate_perfil_scope();

CREATE TRIGGER perfil_set_updated_at
  BEFORE UPDATE ON public.perfil_usuario
  FOR EACH ROW
  EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER publicacion_scope_check
  BEFORE INSERT OR UPDATE OF campus_id, propietario_id ON public.publicacion_recurso
  FOR EACH ROW
  EXECUTE FUNCTION app_private.validate_publicacion_scope();

CREATE TRIGGER publicacion_set_updated_at
  BEFORE UPDATE ON public.publicacion_recurso
  FOR EACH ROW
  EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER publicacion_tipo_immutable
  AFTER UPDATE OF tipo_recurso ON public.publicacion_recurso
  FOR EACH ROW
  EXECUTE FUNCTION app_private.block_tipo_change_with_subtype();

CREATE TRIGGER recurso_digital_tipo_check
  BEFORE INSERT OR UPDATE ON public.recurso_digital
  FOR EACH ROW
  EXECUTE FUNCTION app_private.validate_subtipo_publicacion();

CREATE TRIGGER recurso_fisico_tipo_check
  BEFORE INSERT OR UPDATE ON public.recurso_fisico
  FOR EACH ROW
  EXECUTE FUNCTION app_private.validate_subtipo_publicacion();

CREATE TRIGGER solicitud_set_updated_at
  BEFORE UPDATE ON public.solicitud_recurso
  FOR EACH ROW
  EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER solicitud_validate
  BEFORE INSERT ON public.solicitud_recurso
  FOR EACH ROW
  EXECUTE FUNCTION app_private.validate_solicitud_insert();

CREATE TRIGGER usuario_carrera_scope_check
  BEFORE INSERT OR UPDATE ON public.usuario_carrera
  FOR EACH ROW
  EXECUTE FUNCTION app_private.validate_usuario_carrera();

CREATE TRIGGER valoracion_refresh_reputacion
  AFTER INSERT OR DELETE OR UPDATE ON public.valoracion
  FOR EACH ROW
  EXECUTE FUNCTION app_private.refresh_reputacion();

CREATE TRIGGER valoracion_validate
  BEFORE INSERT OR UPDATE ON public.valoracion
  FOR EACH ROW
  EXECUTE FUNCTION app_private.validate_valoracion();

CREATE POLICY "archivo_read" ON "public"."archivo_publicacion"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.publicacion_recurso p
  WHERE
    ((p.id = archivo_publicacion.publicacion_id) AND ((p.propietario_id = ( SELECT auth.uid() AS uid)) OR ((archivo_publicacion.tipo_archivo = ANY (ARRAY['IMAGEN'::text,
    'PREVIEW'::text])) AND (p.campus_id = ( SELECT app_private.current_campus_id() AS current_campus_id)) AND (p.deleted_at IS NULL)) OR
    ((archivo_publicacion.tipo_archivo = 'RECURSO'::text) AND (EXISTS ( SELECT 1
           FROM public.transaccion_recurso t
          WHERE ((t.publicacion_id = p.id) AND (t.receptor_id = ( SELECT auth.uid() AS uid)) AND (t.estado_transaccion = 'COMPLETADA'::text))))))))));

CREATE POLICY "archivo_write" ON "public"."archivo_publicacion"
  FOR ALL
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.publicacion_recurso p
  WHERE ((p.id = archivo_publicacion.publicacion_id) AND (p.propietario_id = ( SELECT auth.uid() AS uid))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.publicacion_recurso p
  WHERE ((p.id = archivo_publicacion.publicacion_id) AND (p.propietario_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "asignatura_read" ON "public"."asignatura"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "auditoria_read" ON "public"."auditoria"
  FOR SELECT
  TO "authenticated"
  USING ((((campus_id IS
    NOT NULL) AND ( SELECT app_private.has_permission('VER_AUDITORIA'::text, auditoria.campus_id) AS has_permission)) OR
    ((campus_id IS NULL) AND (institucion_id = ( SELECT app_private.current_institution_id() AS current_institution_id)) AND ( SELECT
    app_private.has_permission_in_institution('VER_AUDITORIA'::text, auditoria.institucion_id) AS has_permission_in_institution))));

CREATE POLICY "campus_read" ON "public"."campus"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "campus_carrera_read" ON "public"."campus_carrera"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "carrera_read" ON "public"."carrera"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "carrera_asignatura_read" ON "public"."carrera_asignatura"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "categoria_read" ON "public"."categoria_recurso_fisico"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "confirmacion_read_partes" ON "public"."confirmacion_transaccion"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.transaccion_recurso t
  WHERE ((t.id = confirmacion_transaccion.transaccion_id) AND ((( SELECT auth.uid() AS uid) = t.propietario_id) OR (( SELECT auth.uid() AS uid) = t.receptor_id))))));

CREATE POLICY "institucion_read" ON "public"."institucion"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "interaccion_insert_self" ON "public"."interaccion_recurso"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((perfil_usuario_id = ( SELECT auth.uid() AS uid)) AND (campus_id = ( SELECT app_private.current_campus_id() AS current_campus_id))));

CREATE POLICY "interaccion_read_self_or_analytics" ON "public"."interaccion_recurso"
  FOR SELECT
  TO "authenticated"
  USING (((perfil_usuario_id = ( SELECT auth.uid() AS uid)) OR ( SELECT app_private.has_permission('VER_REPORTES'::text, interaccion_recurso.campus_id) AS has_permission)));

CREATE POLICY "notificacion_own_delete" ON "public"."notificacion"
  FOR DELETE
  TO "authenticated"
  USING ((destinatario_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "notificacion_own_select" ON "public"."notificacion"
  FOR SELECT
  TO "authenticated"
  USING ((destinatario_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "notificacion_own_update" ON "public"."notificacion"
  FOR UPDATE
  TO "authenticated"
  USING ((destinatario_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((destinatario_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "perfil_read_same_institution" ON "public"."perfil_usuario"
  FOR SELECT
  TO "authenticated"
  USING (((institucion_id = ( SELECT app_private.current_institution_id() AS current_institution_id)) OR (id = ( SELECT auth.uid() AS uid))));

CREATE POLICY "perfil_update_self" ON "public"."perfil_usuario"
  FOR UPDATE
  TO "authenticated"
  USING ((id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "permiso_read" ON "public"."permiso"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "publicacion_insert_owner" ON "public"."publicacion_recurso"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((propietario_id = ( SELECT auth.uid() AS uid)) AND (campus_id = ( SELECT app_private.current_campus_id() AS current_campus_id))));

CREATE POLICY "publicacion_read_campus" ON "public"."publicacion_recurso"
  FOR SELECT
  TO "authenticated"
  USING
    (((propietario_id = ( SELECT auth.uid() AS uid)) OR ((campus_id = ( SELECT app_private.current_campus_id() AS current_campus_id)) AND (deleted_at IS NULL) AND
    (estado_publicacion <> 'OCULTA'::text))));

CREATE POLICY "publicacion_update_owner_or_moderator" ON "public"."publicacion_recurso"
  FOR UPDATE
  TO "authenticated"
  USING (((propietario_id = ( SELECT auth.uid() AS uid)) OR ( SELECT app_private.has_permission('MODERAR_CONTENIDO'::text, publicacion_recurso.campus_id) AS has_permission)))
  WITH
    CHECK
    ((((propietario_id = ( SELECT auth.uid() AS uid)) AND (campus_id = ( SELECT app_private.current_campus_id() AS current_campus_id))) OR ( SELECT
    app_private.has_permission('MODERAR_CONTENIDO'::text, publicacion_recurso.campus_id) AS has_permission)));

CREATE POLICY "recurso_digital_read" ON "public"."recurso_digital"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.publicacion_recurso p
  WHERE (p.id = recurso_digital.publicacion_id))));

CREATE POLICY "recurso_digital_write" ON "public"."recurso_digital"
  FOR ALL
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.publicacion_recurso p
  WHERE ((p.id = recurso_digital.publicacion_id) AND (p.propietario_id = ( SELECT auth.uid() AS uid))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.publicacion_recurso p
  WHERE ((p.id = recurso_digital.publicacion_id) AND (p.propietario_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "rd_asig_read" ON "public"."recurso_digital_asignatura"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.publicacion_recurso p
  WHERE (p.id = recurso_digital_asignatura.publicacion_id))));

CREATE POLICY "rd_asig_write" ON "public"."recurso_digital_asignatura"
  FOR ALL
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.publicacion_recurso p
  WHERE ((p.id = recurso_digital_asignatura.publicacion_id) AND (p.propietario_id = ( SELECT auth.uid() AS uid))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.publicacion_recurso p
  WHERE ((p.id = recurso_digital_asignatura.publicacion_id) AND (p.propietario_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "rd_carrera_read" ON "public"."recurso_digital_carrera"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.publicacion_recurso p
  WHERE (p.id = recurso_digital_carrera.publicacion_id))));

CREATE POLICY "rd_carrera_write" ON "public"."recurso_digital_carrera"
  FOR ALL
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.publicacion_recurso p
  WHERE ((p.id = recurso_digital_carrera.publicacion_id) AND (p.propietario_id = ( SELECT auth.uid() AS uid))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.publicacion_recurso p
  WHERE ((p.id = recurso_digital_carrera.publicacion_id) AND (p.propietario_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "recurso_fisico_read" ON "public"."recurso_fisico"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.publicacion_recurso p
  WHERE (p.id = recurso_fisico.publicacion_id))));

CREATE POLICY "recurso_fisico_write" ON "public"."recurso_fisico"
  FOR ALL
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.publicacion_recurso p
  WHERE ((p.id = recurso_fisico.publicacion_id) AND (p.propietario_id = ( SELECT auth.uid() AS uid))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.publicacion_recurso p
  WHERE ((p.id = recurso_fisico.publicacion_id) AND (p.propietario_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "reporte_insert" ON "public"."reporte"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((generado_por_id = ( SELECT auth.uid() AS uid)) AND (institucion_id = ( SELECT app_private.current_institution_id() AS current_institution_id)) AND (((campus_id IS
    NOT NULL) AND ( SELECT app_private.has_permission('VER_REPORTES'::text, reporte.campus_id) AS has_permission)) OR
    ((campus_id IS NULL) AND ( SELECT app_private.has_permission_in_institution('VER_REPORTES'::text, reporte.institucion_id) AS has_permission_in_institution)))));

CREATE POLICY "reporte_read" ON "public"."reporte"
  FOR SELECT
  TO "authenticated"
  USING (((generado_por_id = ( SELECT auth.uid() AS uid)) OR ((institucion_id = ( SELECT app_private.current_institution_id() AS current_institution_id)) AND (((campus_id IS
    NOT NULL) AND ( SELECT app_private.has_permission('VER_REPORTES'::text, reporte.campus_id) AS has_permission)) OR
    ((campus_id IS NULL) AND ( SELECT app_private.has_permission_in_institution('VER_REPORTES'::text, reporte.institucion_id) AS has_permission_in_institution))))));

CREATE POLICY "reporte_contenido_insert" ON "public"."reporte_contenido"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((reportante_id = ( SELECT auth.uid() AS uid)) AND (campus_id = ( SELECT app_private.current_campus_id() AS current_campus_id))));

CREATE POLICY "reporte_contenido_read" ON "public"."reporte_contenido"
  FOR SELECT
  TO "authenticated"
  USING (((reportante_id = ( SELECT auth.uid() AS uid)) OR ( SELECT app_private.has_permission('MODERAR_CONTENIDO'::text, reporte_contenido.campus_id) AS has_permission)));

CREATE POLICY "reporte_contenido_update_moderator" ON "public"."reporte_contenido"
  FOR UPDATE
  TO "authenticated"
  USING (( SELECT app_private.has_permission('MODERAR_CONTENIDO'::text, reporte_contenido.campus_id) AS has_permission))
  WITH CHECK (( SELECT app_private.has_permission('MODERAR_CONTENIDO'::text, reporte_contenido.campus_id) AS has_permission));

CREATE POLICY "rol_read" ON "public"."rol"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "rol_permiso_read" ON "public"."rol_permiso"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "solicitud_cancel_self" ON "public"."solicitud_recurso"
  FOR UPDATE
  TO "authenticated"
  USING (((solicitante_id = ( SELECT auth.uid() AS uid)) AND (estado_solicitud = 'PENDIENTE'::text)))
  WITH CHECK (((solicitante_id = ( SELECT auth.uid() AS uid)) AND (estado_solicitud = ANY (ARRAY['PENDIENTE'::text, 'CANCELADA'::text]))));

CREATE POLICY "solicitud_insert_self" ON "public"."solicitud_recurso"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((solicitante_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "solicitud_read_partes" ON "public"."solicitud_recurso"
  FOR SELECT
  TO "authenticated"
  USING (((solicitante_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.publicacion_recurso p
  WHERE ((p.id = solicitud_recurso.publicacion_id) AND (p.propietario_id = ( SELECT auth.uid() AS uid)))))));

CREATE POLICY "transaccion_read_partes" ON "public"."transaccion_recurso"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = propietario_id) OR (( SELECT auth.uid() AS uid) = receptor_id)));

CREATE POLICY "usuario_carrera_delete_self" ON "public"."usuario_carrera"
  FOR DELETE
  TO "authenticated"
  USING ((perfil_usuario_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "usuario_carrera_insert_self" ON "public"."usuario_carrera"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((perfil_usuario_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "usuario_carrera_read" ON "public"."usuario_carrera"
  FOR SELECT
  TO "authenticated"
  USING (((perfil_usuario_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.perfil_usuario p
  WHERE ((p.id = usuario_carrera.perfil_usuario_id) AND (p.institucion_id = ( SELECT app_private.current_institution_id() AS current_institution_id)))))));

CREATE POLICY "usuario_permiso_manage_insert" ON "public"."usuario_permiso"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (( SELECT app_private.has_permission('GESTIONAR_ROLES_PERMISOS'::text, usuario_permiso.campus_id) AS has_permission));

CREATE POLICY "usuario_permiso_manage_update" ON "public"."usuario_permiso"
  FOR UPDATE
  TO "authenticated"
  USING (( SELECT app_private.has_permission('GESTIONAR_ROLES_PERMISOS'::text, usuario_permiso.campus_id) AS has_permission))
  WITH CHECK (( SELECT app_private.has_permission('GESTIONAR_ROLES_PERMISOS'::text, usuario_permiso.campus_id) AS has_permission));

CREATE POLICY "usuario_permiso_read" ON "public"."usuario_permiso"
  FOR SELECT
  TO "authenticated"
  USING (((perfil_usuario_id = ( SELECT auth.uid() AS uid)) OR ( SELECT app_private.has_permission('GESTIONAR_ROLES_PERMISOS'::text, usuario_permiso.campus_id) AS has_permission)));

CREATE POLICY "usuario_rol_manage_insert" ON "public"."usuario_rol"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (( SELECT app_private.has_permission('GESTIONAR_ROLES_PERMISOS'::text, usuario_rol.campus_id) AS has_permission));

CREATE POLICY "usuario_rol_manage_update" ON "public"."usuario_rol"
  FOR UPDATE
  TO "authenticated"
  USING (( SELECT app_private.has_permission('GESTIONAR_ROLES_PERMISOS'::text, usuario_rol.campus_id) AS has_permission))
  WITH CHECK (( SELECT app_private.has_permission('GESTIONAR_ROLES_PERMISOS'::text, usuario_rol.campus_id) AS has_permission));

CREATE POLICY "usuario_rol_read" ON "public"."usuario_rol"
  FOR SELECT
  TO "authenticated"
  USING (((perfil_usuario_id = ( SELECT auth.uid() AS uid)) OR ( SELECT app_private.has_permission('GESTIONAR_ROLES_PERMISOS'::text, usuario_rol.campus_id) AS has_permission)));

CREATE POLICY "valoracion_insert_receptor" ON "public"."valoracion"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((evaluador_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "valoracion_read_same_campus" ON "public"."valoracion"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM (public.transaccion_recurso t
     JOIN public.publicacion_recurso p ON ((p.id = t.publicacion_id)))
  WHERE ((t.id = valoracion.transaccion_id) AND (p.campus_id = ( SELECT app_private.current_campus_id() AS current_campus_id))))));

CREATE POLICY "avatars delete own folder" ON "storage"."objects"
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY "avatars update own folder" ON "storage"."objects"
  FOR UPDATE
  TO "authenticated"
  USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)))
  WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY "avatars upload own folder" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY "digital previews owner delete" ON "storage"."objects"
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id = 'digital-previews'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY "digital previews owner mutate" ON "storage"."objects"
  FOR UPDATE
  TO "authenticated"
  USING (((bucket_id = 'digital-previews'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)))
  WITH CHECK (((bucket_id = 'digital-previews'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY "digital previews owner upload" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'digital-previews'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY "digital previews same campus" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'digital-previews'::text) AND (EXISTS ( SELECT 1
   FROM (public.archivo_publicacion a
     JOIN public.publicacion_recurso p ON ((p.id = a.publicacion_id)))
  WHERE
    ((a.bucket_id = objects.bucket_id) AND (a.storage_path = objects.name) AND (p.campus_id = ( SELECT app_private.current_campus_id() AS current_campus_id)) AND (p.deleted_at IS
    NULL))))));

CREATE POLICY "digital resource acquired or owner read" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'digital-resources'::text) AND (EXISTS ( SELECT 1
   FROM (public.archivo_publicacion a
     JOIN public.publicacion_recurso p ON ((p.id = a.publicacion_id)))
  WHERE ((a.bucket_id = objects.bucket_id) AND (a.storage_path = objects.name) AND ((p.propietario_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
           FROM public.transaccion_recurso t
          WHERE ((t.publicacion_id = p.id) AND (t.receptor_id = ( SELECT auth.uid() AS uid)) AND (t.estado_transaccion = 'COMPLETADA'::text))))))))));

CREATE POLICY "digital resource owner delete" ON "storage"."objects"
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id = 'digital-resources'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY "digital resource owner mutate" ON "storage"."objects"
  FOR UPDATE
  TO "authenticated"
  USING (((bucket_id = 'digital-resources'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)))
  WITH CHECK (((bucket_id = 'digital-resources'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY "digital resource owner upload" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'digital-resources'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY "publication images owner delete" ON "storage"."objects"
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id = 'publication-images'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY "publication images owner mutate" ON "storage"."objects"
  FOR UPDATE
  TO "authenticated"
  USING (((bucket_id = 'publication-images'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)))
  WITH CHECK (((bucket_id = 'publication-images'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY "publication images owner upload" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'publication-images'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY "publication images read same campus" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'publication-images'::text) AND (EXISTS ( SELECT 1
   FROM (public.archivo_publicacion a
     JOIN public.publicacion_recurso p ON ((p.id = a.publicacion_id)))
  WHERE
    ((a.bucket_id = objects.bucket_id) AND (a.storage_path = objects.name) AND (p.campus_id = ( SELECT app_private.current_campus_id() AS current_campus_id)) AND (p.deleted_at IS
    NULL))))));

REVOKE ALL ON FUNCTION "app_private"."block_tipo_change_with_subtype"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "app_private"."block_tipo_change_with_subtype"() TO "postgres";

REVOKE ALL ON FUNCTION "app_private"."current_campus_id"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "app_private"."current_campus_id"() TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "app_private"."current_institution_id"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "app_private"."current_institution_id"() TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "app_private"."has_permission"(text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "app_private"."has_permission"(text, uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "app_private"."has_permission_in_institution"(text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "app_private"."has_permission_in_institution"(text, uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "app_private"."has_role"(text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "app_private"."has_role"(text, uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "app_private"."refresh_reputacion"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "app_private"."refresh_reputacion"() TO "postgres";

REVOKE ALL ON FUNCTION "app_private"."set_updated_at"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "app_private"."set_updated_at"() TO "postgres";

REVOKE ALL ON FUNCTION "app_private"."validate_campus_carrera"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "app_private"."validate_campus_carrera"() TO "postgres";

REVOKE ALL ON FUNCTION "app_private"."validate_perfil_scope"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "app_private"."validate_perfil_scope"() TO "postgres";

REVOKE ALL ON FUNCTION "app_private"."validate_publicacion_scope"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "app_private"."validate_publicacion_scope"() TO "postgres";

REVOKE ALL ON FUNCTION "app_private"."validate_solicitud_insert"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "app_private"."validate_solicitud_insert"() TO "postgres";

REVOKE ALL ON FUNCTION "app_private"."validate_subtipo_publicacion"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "app_private"."validate_subtipo_publicacion"() TO "postgres";

REVOKE ALL ON FUNCTION "app_private"."validate_usuario_carrera"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "app_private"."validate_usuario_carrera"() TO "postgres";

REVOKE ALL ON FUNCTION "app_private"."validate_valoracion"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "app_private"."validate_valoracion"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."aceptar_solicitud"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."aceptar_solicitud"(uuid) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."cancelar_transaccion"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."cancelar_transaccion"(uuid) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."confirmar_transaccion"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."confirmar_transaccion"(uuid) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."rechazar_solicitud"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."rechazar_solicitud"(uuid) TO "anon", "authenticated", "postgres", "service_role";

GRANT USAGE ON SCHEMA "app_private" TO "authenticated";

GRANT CREATE, USAGE ON SCHEMA "app_private" TO "postgres";

REVOKE ALL ON TABLE "public"."archivo_publicacion" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."archivo_publicacion" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."archivo_publicacion" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."asignatura" FROM "authenticated";

GRANT SELECT ON TABLE "public"."asignatura" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."asignatura" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."auditoria" FROM "authenticated";

GRANT SELECT ON TABLE "public"."auditoria" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."auditoria" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."campus" FROM "authenticated";

GRANT SELECT ON TABLE "public"."campus" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campus" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."campus_carrera" FROM "authenticated";

GRANT SELECT ON TABLE "public"."campus_carrera" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campus_carrera" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."carrera" FROM "authenticated";

GRANT SELECT ON TABLE "public"."carrera" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."carrera" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."carrera_asignatura" FROM "authenticated";

GRANT SELECT ON TABLE "public"."carrera_asignatura" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."carrera_asignatura" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."categoria_recurso_fisico" FROM "authenticated";

GRANT SELECT ON TABLE "public"."categoria_recurso_fisico" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."categoria_recurso_fisico" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."confirmacion_transaccion" FROM "authenticated";

GRANT SELECT ON TABLE "public"."confirmacion_transaccion" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."confirmacion_transaccion" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."institucion" FROM "authenticated";

GRANT SELECT ON TABLE "public"."institucion" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."institucion" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."interaccion_recurso" FROM "authenticated";

GRANT INSERT, SELECT ON TABLE "public"."interaccion_recurso" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."interaccion_recurso" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."notificacion" FROM "authenticated";

GRANT DELETE, SELECT, UPDATE ON TABLE "public"."notificacion" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."notificacion" TO "postgres", "service_role";

REVOKE ALL ("campus_id") ON TABLE "public"."perfil_usuario" FROM "authenticated";

GRANT UPDATE ("campus_id") ON TABLE "public"."perfil_usuario" TO "authenticated";

REVOKE ALL ("foto_path") ON TABLE "public"."perfil_usuario" FROM "authenticated";

GRANT UPDATE ("foto_path") ON TABLE "public"."perfil_usuario" TO "authenticated";

REVOKE ALL ("nombre_completo") ON TABLE "public"."perfil_usuario" FROM "authenticated";

GRANT UPDATE ("nombre_completo") ON TABLE "public"."perfil_usuario" TO "authenticated";

REVOKE ALL ON TABLE "public"."perfil_usuario" FROM "authenticated";

GRANT SELECT ON TABLE "public"."perfil_usuario" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."perfil_usuario" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."permiso" FROM "authenticated";

GRANT SELECT ON TABLE "public"."permiso" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."permiso" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."publicacion_recurso" FROM "authenticated";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."publicacion_recurso" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."publicacion_recurso" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."recurso_digital" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."recurso_digital" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."recurso_digital" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."recurso_digital_asignatura" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."recurso_digital_asignatura" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."recurso_digital_asignatura" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."recurso_digital_carrera" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."recurso_digital_carrera" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."recurso_digital_carrera" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."recurso_fisico" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."recurso_fisico" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."recurso_fisico" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."reporte" FROM "authenticated";

GRANT INSERT, SELECT ON TABLE "public"."reporte" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."reporte" TO "postgres", "service_role";

REVOKE ALL ("descripcion") ON TABLE "public"."reporte_contenido" FROM "authenticated";

GRANT UPDATE ("descripcion") ON TABLE "public"."reporte_contenido" TO "authenticated";

REVOKE ALL ("estado_reporte") ON TABLE "public"."reporte_contenido" FROM "authenticated";

GRANT UPDATE ("estado_reporte") ON TABLE "public"."reporte_contenido" TO "authenticated";

REVOKE ALL ("resuelto_en") ON TABLE "public"."reporte_contenido" FROM "authenticated";

GRANT UPDATE ("resuelto_en") ON TABLE "public"."reporte_contenido" TO "authenticated";

REVOKE ALL ("resuelto_por_id") ON TABLE "public"."reporte_contenido" FROM "authenticated";

GRANT UPDATE ("resuelto_por_id") ON TABLE "public"."reporte_contenido" TO "authenticated";

REVOKE ALL ON TABLE "public"."reporte_contenido" FROM "authenticated";

GRANT INSERT, SELECT ON TABLE "public"."reporte_contenido" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."reporte_contenido" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."rol" FROM "authenticated";

GRANT SELECT ON TABLE "public"."rol" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."rol" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."rol_permiso" FROM "authenticated";

GRANT SELECT ON TABLE "public"."rol_permiso" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."rol_permiso" TO "postgres", "service_role";

REVOKE ALL ("estado_solicitud") ON TABLE "public"."solicitud_recurso" FROM "authenticated";

GRANT UPDATE ("estado_solicitud") ON TABLE "public"."solicitud_recurso" TO "authenticated";

REVOKE ALL ON TABLE "public"."solicitud_recurso" FROM "authenticated";

GRANT INSERT, SELECT ON TABLE "public"."solicitud_recurso" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."solicitud_recurso" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."transaccion_recurso" FROM "authenticated";

GRANT SELECT ON TABLE "public"."transaccion_recurso" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."transaccion_recurso" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."usuario_carrera" FROM "authenticated";

GRANT DELETE, INSERT, SELECT ON TABLE "public"."usuario_carrera" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."usuario_carrera" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."usuario_permiso" FROM "authenticated";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."usuario_permiso" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."usuario_permiso" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."usuario_rol" FROM "authenticated";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."usuario_rol" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."usuario_rol" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."valoracion" FROM "authenticated";

GRANT INSERT, SELECT ON TABLE "public"."valoracion" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."valoracion" TO "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v_demanda_recursos" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v_publicaciones_disponibles" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v_recurso_digital_contexto" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v_transacciones_detalle" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE "public"."v_usuario_autorizacion_activa"
  TO "anon", "authenticated", "postgres", "service_role";

