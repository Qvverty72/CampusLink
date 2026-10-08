-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.institucion (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  tipo text,
  pais text NOT NULL DEFAULT 'Chile'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT institucion_pkey PRIMARY KEY (id)
);
CREATE TABLE public.campus (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  institucion_id uuid NOT NULL,
  nombre text NOT NULL,
  direccion text,
  ciudad text,
  region text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campus_pkey PRIMARY KEY (id),
  CONSTRAINT campus_institucion_id_fkey FOREIGN KEY (institucion_id) REFERENCES public.institucion(id)
);
CREATE TABLE public.carrera (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  institucion_id uuid NOT NULL,
  nombre text NOT NULL,
  codigo text,
  facultad text,
  jornada text CHECK (jornada IS NULL OR (jornada = ANY (ARRAY['DIURNA'::text, 'VESPERTINA'::text]))),
  nivel_formacion text CHECK (nivel_formacion IS NULL OR (nivel_formacion = ANY (ARRAY['TECNICO'::text, 'PROFESIONAL'::text]))),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT carrera_pkey PRIMARY KEY (id),
  CONSTRAINT carrera_institucion_id_fkey FOREIGN KEY (institucion_id) REFERENCES public.institucion(id)
);
CREATE TABLE public.asignatura (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  codigo text NOT NULL UNIQUE,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT asignatura_pkey PRIMARY KEY (id)
);
CREATE TABLE public.campus_carrera (
  campus_id uuid NOT NULL,
  carrera_id uuid NOT NULL,
  CONSTRAINT campus_carrera_pkey PRIMARY KEY (campus_id, carrera_id),
  CONSTRAINT campus_carrera_campus_id_fkey FOREIGN KEY (campus_id) REFERENCES public.campus(id),
  CONSTRAINT campus_carrera_carrera_id_fkey FOREIGN KEY (carrera_id) REFERENCES public.carrera(id)
);
CREATE TABLE public.carrera_asignatura (
  carrera_id uuid NOT NULL,
  asignatura_id uuid NOT NULL,
  semestre_nivel smallint NOT NULL CHECK (semestre_nivel > 0),
  CONSTRAINT carrera_asignatura_pkey PRIMARY KEY (carrera_id, asignatura_id),
  CONSTRAINT carrera_asignatura_carrera_id_fkey FOREIGN KEY (carrera_id) REFERENCES public.carrera(id),
  CONSTRAINT carrera_asignatura_asignatura_id_fkey FOREIGN KEY (asignatura_id) REFERENCES public.asignatura(id)
);
CREATE TABLE public.perfil_usuario (
  id uuid NOT NULL,
  institucion_id uuid NOT NULL,
  campus_id uuid NOT NULL,
  nombre_completo character varying NOT NULL CHECK (NULLIF(btrim(nombre_completo::text), ''::text) IS NOT NULL),
  foto_path text,
  estado_cuenta text NOT NULL DEFAULT 'ACTIVA'::text CHECK (estado_cuenta = ANY (ARRAY['ACTIVA'::text, 'SUSPENDIDA'::text, 'DESACTIVADA'::text])),
  verificado_en timestamp with time zone,
  genero text CHECK (genero IS NULL OR (genero = ANY (ARRAY['MASCULINO'::text, 'FEMENINO'::text, 'OTRO'::text, 'PREFIERO_NO_INFORMAR'::text]))),
  fecha_nacimiento date,
  pais_origen text NOT NULL DEFAULT 'Chile'::text,
  region_origen text,
  comuna_origen text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  CONSTRAINT perfil_usuario_pkey PRIMARY KEY (id),
  CONSTRAINT perfil_usuario_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT perfil_usuario_institucion_id_fkey FOREIGN KEY (institucion_id) REFERENCES public.institucion(id),
  CONSTRAINT perfil_usuario_campus_id_fkey FOREIGN KEY (campus_id) REFERENCES public.campus(id)
);
CREATE TABLE public.usuario_carrera (
  perfil_usuario_id uuid NOT NULL,
  carrera_id uuid NOT NULL,
  anio_ingreso smallint CHECK (anio_ingreso IS NULL OR anio_ingreso >= 1900 AND anio_ingreso <= 2200),
  CONSTRAINT usuario_carrera_pkey PRIMARY KEY (perfil_usuario_id, carrera_id),
  CONSTRAINT usuario_carrera_perfil_usuario_id_fkey FOREIGN KEY (perfil_usuario_id) REFERENCES public.perfil_usuario(id),
  CONSTRAINT usuario_carrera_carrera_id_fkey FOREIGN KEY (carrera_id) REFERENCES public.carrera(id)
);
CREATE TABLE public.usuario_asignatura (
  perfil_usuario_id uuid NOT NULL,
  asignatura_id uuid NOT NULL,
  CONSTRAINT usuario_asignatura_pkey PRIMARY KEY (perfil_usuario_id, asignatura_id),
  CONSTRAINT usuario_asignatura_perfil_usuario_id_fkey FOREIGN KEY (perfil_usuario_id) REFERENCES public.perfil_usuario(id),
  CONSTRAINT usuario_asignatura_asignatura_id_fkey FOREIGN KEY (asignatura_id) REFERENCES public.asignatura(id)
);
CREATE TABLE public.rol (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  descripcion text,
  CONSTRAINT rol_pkey PRIMARY KEY (id)
);
CREATE TABLE public.permiso (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  descripcion text,
  CONSTRAINT permiso_pkey PRIMARY KEY (id)
);
CREATE TABLE public.rol_permiso (
  rol_id uuid NOT NULL,
  permiso_id uuid NOT NULL,
  CONSTRAINT rol_permiso_pkey PRIMARY KEY (rol_id, permiso_id),
  CONSTRAINT rol_permiso_rol_id_fkey FOREIGN KEY (rol_id) REFERENCES public.rol(id),
  CONSTRAINT rol_permiso_permiso_id_fkey FOREIGN KEY (permiso_id) REFERENCES public.permiso(id)
);
CREATE TABLE public.usuario_rol (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  perfil_usuario_id uuid NOT NULL,
  rol_id uuid NOT NULL,
  campus_id uuid NOT NULL,
  asignado_por_id uuid,
  asignado_en timestamp with time zone NOT NULL DEFAULT now(),
  revocado_en timestamp with time zone,
  CONSTRAINT usuario_rol_pkey PRIMARY KEY (id),
  CONSTRAINT usuario_rol_campus_id_fkey FOREIGN KEY (campus_id) REFERENCES public.campus(id),
  CONSTRAINT usuario_rol_asignado_por_id_fkey FOREIGN KEY (asignado_por_id) REFERENCES public.perfil_usuario(id),
  CONSTRAINT usuario_rol_perfil_usuario_id_fkey FOREIGN KEY (perfil_usuario_id) REFERENCES public.perfil_usuario(id),
  CONSTRAINT usuario_rol_rol_id_fkey FOREIGN KEY (rol_id) REFERENCES public.rol(id)
);
CREATE TABLE public.usuario_permiso (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  perfil_usuario_id uuid NOT NULL,
  permiso_id uuid NOT NULL,
  campus_id uuid NOT NULL,
  otorgado_por_id uuid,
  otorgado_en timestamp with time zone NOT NULL DEFAULT now(),
  revocado_en timestamp with time zone,
  CONSTRAINT usuario_permiso_pkey PRIMARY KEY (id),
  CONSTRAINT usuario_permiso_perfil_usuario_id_fkey FOREIGN KEY (perfil_usuario_id) REFERENCES public.perfil_usuario(id),
  CONSTRAINT usuario_permiso_permiso_id_fkey FOREIGN KEY (permiso_id) REFERENCES public.permiso(id),
  CONSTRAINT usuario_permiso_campus_id_fkey FOREIGN KEY (campus_id) REFERENCES public.campus(id),
  CONSTRAINT usuario_permiso_otorgado_por_id_fkey FOREIGN KEY (otorgado_por_id) REFERENCES public.perfil_usuario(id)
);
CREATE TABLE public.publicacion_recurso (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL,
  propietario_id uuid NOT NULL,
  tipo_recurso text NOT NULL CHECK (tipo_recurso = ANY (ARRAY['FISICO'::text, 'DIGITAL'::text])),
  titulo text NOT NULL CHECK (NULLIF(btrim(titulo), ''::text) IS NOT NULL),
  descripcion text,
  modalidad text NOT NULL CHECK (modalidad = ANY (ARRAY['VENTA'::text, 'DONACION'::text])),
  precio numeric,
  moneda character varying NOT NULL DEFAULT 'CLP'::character varying CHECK (moneda::text ~ '^[A-Z]{3}$'::text),
  estado_publicacion text NOT NULL DEFAULT 'DISPONIBLE'::text CHECK (estado_publicacion = ANY (ARRAY['DISPONIBLE'::text, 'RESERVADO'::text, 'FINALIZADO'::text, 'CANCELADO'::text, 'OCULTO'::text])),
  publicado_en timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  CONSTRAINT publicacion_recurso_pkey PRIMARY KEY (id),
  CONSTRAINT publicacion_recurso_campus_id_fkey FOREIGN KEY (campus_id) REFERENCES public.campus(id),
  CONSTRAINT publicacion_recurso_propietario_id_fkey FOREIGN KEY (propietario_id) REFERENCES public.perfil_usuario(id)
);
CREATE TABLE public.recurso_digital (
  publicacion_id uuid NOT NULL,
  CONSTRAINT recurso_digital_pkey PRIMARY KEY (publicacion_id),
  CONSTRAINT recurso_digital_publicacion_id_fkey FOREIGN KEY (publicacion_id) REFERENCES public.publicacion_recurso(id)
);
CREATE TABLE public.categoria_recurso_fisico (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  descripcion text,
  activo boolean NOT NULL DEFAULT true,
  CONSTRAINT categoria_recurso_fisico_pkey PRIMARY KEY (id)
);
CREATE TABLE public.recurso_fisico (
  publicacion_id uuid NOT NULL,
  categoria_id uuid NOT NULL,
  estado_uso text NOT NULL CHECK (estado_uso = ANY (ARRAY['NUEVO'::text, 'BUEN_ESTADO'::text, 'USADO'::text, 'DETERIORADO'::text])),
  CONSTRAINT recurso_fisico_pkey PRIMARY KEY (publicacion_id),
  CONSTRAINT recurso_fisico_publicacion_id_fkey FOREIGN KEY (publicacion_id) REFERENCES public.publicacion_recurso(id),
  CONSTRAINT recurso_fisico_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categoria_recurso_fisico(id)
);
CREATE TABLE public.archivo_publicacion (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  publicacion_id uuid NOT NULL,
  bucket_id text NOT NULL CHECK (NULLIF(btrim(bucket_id), ''::text) IS NOT NULL),
  storage_path text NOT NULL CHECK (NULLIF(btrim(storage_path), ''::text) IS NOT NULL),
  nombre_original text NOT NULL CHECK (NULLIF(btrim(nombre_original), ''::text) IS NOT NULL),
  mime_type text NOT NULL CHECK (NULLIF(btrim(mime_type), ''::text) IS NOT NULL),
  tamano_bytes bigint NOT NULL CHECK (tamano_bytes > 0 AND tamano_bytes <= 26214400),
  tipo_archivo text NOT NULL CHECK (tipo_archivo = ANY (ARRAY['IMAGEN'::text, 'RECURSO'::text, 'PREVIEW'::text])),
  orden smallint NOT NULL DEFAULT 0 CHECK (orden >= 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  CONSTRAINT archivo_publicacion_pkey PRIMARY KEY (id),
  CONSTRAINT archivo_publicacion_publicacion_id_fkey FOREIGN KEY (publicacion_id) REFERENCES public.publicacion_recurso(id)
);
CREATE TABLE public.publicacion_carrera (
  publicacion_id uuid NOT NULL,
  carrera_id uuid NOT NULL,
  CONSTRAINT publicacion_carrera_pkey PRIMARY KEY (publicacion_id, carrera_id),
  CONSTRAINT publicacion_carrera_publicacion_id_fkey FOREIGN KEY (publicacion_id) REFERENCES public.publicacion_recurso(id),
  CONSTRAINT publicacion_carrera_carrera_id_fkey FOREIGN KEY (carrera_id) REFERENCES public.carrera(id)
);
CREATE TABLE public.publicacion_asignatura (
  publicacion_id uuid NOT NULL,
  asignatura_id uuid NOT NULL,
  CONSTRAINT publicacion_asignatura_pkey PRIMARY KEY (publicacion_id, asignatura_id),
  CONSTRAINT publicacion_asignatura_publicacion_id_fkey FOREIGN KEY (publicacion_id) REFERENCES public.publicacion_recurso(id),
  CONSTRAINT publicacion_asignatura_asignatura_id_fkey FOREIGN KEY (asignatura_id) REFERENCES public.asignatura(id)
);
CREATE TABLE public.mensaje_solicitud (
  codigo text NOT NULL,
  descripcion text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  CONSTRAINT mensaje_solicitud_pkey PRIMARY KEY (codigo)
);
CREATE TABLE public.solicitud_recurso (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  publicacion_id uuid NOT NULL,
  solicitante_id uuid NOT NULL,
  estado_solicitud text NOT NULL DEFAULT 'PENDIENTE'::text CHECK (estado_solicitud = ANY (ARRAY['PENDIENTE'::text, 'ACEPTADA'::text, 'RECHAZADA'::text, 'CANCELADA'::text])),
  codigo_mensaje text NOT NULL,
  solicitada_en timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT solicitud_recurso_pkey PRIMARY KEY (id),
  CONSTRAINT solicitud_recurso_publicacion_id_fkey FOREIGN KEY (publicacion_id) REFERENCES public.publicacion_recurso(id),
  CONSTRAINT solicitud_recurso_solicitante_id_fkey FOREIGN KEY (solicitante_id) REFERENCES public.perfil_usuario(id),
  CONSTRAINT solicitud_recurso_codigo_mensaje_fkey FOREIGN KEY (codigo_mensaje) REFERENCES public.mensaje_solicitud(codigo)
);
CREATE TABLE public.transaccion_recurso (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  solicitud_id uuid NOT NULL UNIQUE,
  publicacion_id uuid NOT NULL,
  propietario_id uuid NOT NULL,
  receptor_id uuid NOT NULL,
  cancelada_por_id uuid,
  estado_transaccion text NOT NULL DEFAULT 'RESERVADA'::text CHECK (estado_transaccion = ANY (ARRAY['RESERVADA'::text, 'PENDIENTE_CONFIRMACION'::text, 'COMPLETADA'::text, 'CANCELADA'::text])),
  modalidad_acordada text NOT NULL CHECK (modalidad_acordada = ANY (ARRAY['VENTA'::text, 'DONACION'::text])),
  monto_acordado numeric,
  moneda character varying NOT NULL DEFAULT 'CLP'::character varying CHECK (moneda::text ~ '^[A-Z]{3}$'::text),
  iniciada_en timestamp with time zone NOT NULL DEFAULT now(),
  completada_en timestamp with time zone,
  cancelada_en timestamp with time zone,
  motivo_cancelacion text CHECK (motivo_cancelacion IS NULL OR (motivo_cancelacion = ANY (ARRAY['USUARIO_DESISTE'::text, 'NO_RESPONDE'::text, 'RECURSO_NO_DISPONIBLE'::text, 'PROBLEMA_ACUERDO'::text, 'OTRO'::text]))),
  detalle_cancelacion text,
  CONSTRAINT transaccion_recurso_pkey PRIMARY KEY (id),
  CONSTRAINT transaccion_recurso_publicacion_id_fkey FOREIGN KEY (publicacion_id) REFERENCES public.publicacion_recurso(id),
  CONSTRAINT transaccion_recurso_propietario_id_fkey FOREIGN KEY (propietario_id) REFERENCES public.perfil_usuario(id),
  CONSTRAINT transaccion_recurso_receptor_id_fkey FOREIGN KEY (receptor_id) REFERENCES public.perfil_usuario(id),
  CONSTRAINT transaccion_recurso_cancelada_por_id_fkey FOREIGN KEY (cancelada_por_id) REFERENCES public.perfil_usuario(id),
  CONSTRAINT transaccion_recurso_solicitud_id_fkey FOREIGN KEY (solicitud_id) REFERENCES public.solicitud_recurso(id)
);
CREATE TABLE public.confirmacion_transaccion (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  transaccion_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  rol_confirmante text NOT NULL CHECK (rol_confirmante = ANY (ARRAY['PROPIETARIO'::text, 'RECEPTOR'::text])),
  confirmado_en timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT confirmacion_transaccion_pkey PRIMARY KEY (id),
  CONSTRAINT confirmacion_transaccion_transaccion_id_fkey FOREIGN KEY (transaccion_id) REFERENCES public.transaccion_recurso(id),
  CONSTRAINT confirmacion_transaccion_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.perfil_usuario(id)
);
CREATE TABLE public.valoracion (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  transaccion_id uuid NOT NULL UNIQUE,
  evaluador_id uuid NOT NULL,
  evaluado_id uuid NOT NULL,
  puntuacion smallint NOT NULL CHECK (puntuacion >= 1 AND puntuacion <= 5),
  comentario text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT valoracion_pkey PRIMARY KEY (id),
  CONSTRAINT valoracion_transaccion_id_fkey FOREIGN KEY (transaccion_id) REFERENCES public.transaccion_recurso(id),
  CONSTRAINT valoracion_evaluador_id_fkey FOREIGN KEY (evaluador_id) REFERENCES public.perfil_usuario(id),
  CONSTRAINT valoracion_evaluado_id_fkey FOREIGN KEY (evaluado_id) REFERENCES public.perfil_usuario(id)
);
CREATE TABLE public.acceso_recurso_digital (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  transaccion_id uuid NOT NULL UNIQUE,
  publicacion_id uuid NOT NULL,
  receptor_id uuid NOT NULL,
  concedido_en timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT acceso_recurso_digital_pkey PRIMARY KEY (id),
  CONSTRAINT acceso_recurso_digital_transaccion_id_fkey FOREIGN KEY (transaccion_id) REFERENCES public.transaccion_recurso(id),
  CONSTRAINT acceso_recurso_digital_publicacion_id_fkey FOREIGN KEY (publicacion_id) REFERENCES public.publicacion_recurso(id),
  CONSTRAINT acceso_recurso_digital_receptor_id_fkey FOREIGN KEY (receptor_id) REFERENCES public.perfil_usuario(id)
);
CREATE TABLE public.notificacion (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  destinatario_id uuid NOT NULL,
  publicacion_id uuid,
  transaccion_id uuid,
  actividad_id text,
  tipo_notificacion text,
  titulo text,
  mensaje text NOT NULL,
  leida_en timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  CONSTRAINT notificacion_pkey PRIMARY KEY (id),
  CONSTRAINT notificacion_destinatario_id_fkey FOREIGN KEY (destinatario_id) REFERENCES public.perfil_usuario(id),
  CONSTRAINT notificacion_publicacion_id_fkey FOREIGN KEY (publicacion_id) REFERENCES public.publicacion_recurso(id),
  CONSTRAINT notificacion_transaccion_id_fkey FOREIGN KEY (transaccion_id) REFERENCES public.transaccion_recurso(id)
);
CREATE TABLE public.interaccion_recurso (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  perfil_usuario_id uuid NOT NULL,
  publicacion_id uuid NOT NULL,
  tipo_interaccion text NOT NULL CHECK (tipo_interaccion = ANY (ARRAY['VISTA'::text, 'CLIC'::text, 'GUARDADO'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT interaccion_recurso_pkey PRIMARY KEY (id),
  CONSTRAINT interaccion_recurso_perfil_usuario_id_fkey FOREIGN KEY (perfil_usuario_id) REFERENCES public.perfil_usuario(id),
  CONSTRAINT interaccion_recurso_publicacion_id_fkey FOREIGN KEY (publicacion_id) REFERENCES public.publicacion_recurso(id)
);
CREATE TABLE public.reporte_contenido (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  reportante_id uuid NOT NULL,
  resuelto_por_id uuid,
  campus_id uuid NOT NULL,
  entidad_tipo text NOT NULL CHECK (entidad_tipo = ANY (ARRAY['PUBLICACION_FISICA'::text, 'PUBLICACION_DIGITAL'::text, 'TRANSACCION'::text, 'ACTIVIDAD'::text, 'COMPORTAMIENTO'::text])),
  entidad_id text NOT NULL,
  motivo text NOT NULL,
  descripcion text,
  contenido_reportado_json jsonb,
  estado_reporte text NOT NULL DEFAULT 'PENDIENTE'::text CHECK (estado_reporte = ANY (ARRAY['PENDIENTE'::text, 'EN_REVISION'::text, 'RESUELTO'::text, 'DESESTIMADO'::text])),
  fundamento_resolucion text,
  medida_aplicada text,
  reportado_en timestamp with time zone NOT NULL DEFAULT now(),
  resuelto_en timestamp with time zone,
  CONSTRAINT reporte_contenido_pkey PRIMARY KEY (id),
  CONSTRAINT reporte_contenido_reportante_id_fkey FOREIGN KEY (reportante_id) REFERENCES public.perfil_usuario(id),
  CONSTRAINT reporte_contenido_resuelto_por_id_fkey FOREIGN KEY (resuelto_por_id) REFERENCES public.perfil_usuario(id),
  CONSTRAINT reporte_contenido_campus_id_fkey FOREIGN KEY (campus_id) REFERENCES public.campus(id)
);
CREATE TABLE public.auditoria (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_usuario_id uuid,
  institucion_id uuid NOT NULL,
  campus_id uuid,
  entidad_tipo text NOT NULL,
  entidad_id text NOT NULL,
  accion text NOT NULL CHECK (accion = ANY (ARRAY['SUSPENDER_CUENTA'::text, 'REACTIVAR_CUENTA'::text, 'DESACTIVAR_CUENTA'::text, 'ASIGNAR_ROL'::text, 'REVOCAR_ROL'::text, 'ASIGNAR_PERMISO'::text, 'REVOCAR_PERMISO'::text, 'OCULTAR_PUBLICACION'::text, 'RESTAURAR_PUBLICACION'::text, 'RESOLVER_DENUNCIA'::text, 'DESESTIMAR_DENUNCIA'::text])),
  justificacion_accion text,
  reporte_contenido_id uuid,
  datos_antes jsonb,
  datos_despues jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT auditoria_pkey PRIMARY KEY (id),
  CONSTRAINT auditoria_reporte_contenido_id_fkey FOREIGN KEY (reporte_contenido_id) REFERENCES public.reporte_contenido(id),
  CONSTRAINT auditoria_actor_usuario_id_fkey FOREIGN KEY (actor_usuario_id) REFERENCES public.perfil_usuario(id),
  CONSTRAINT auditoria_institucion_id_fkey FOREIGN KEY (institucion_id) REFERENCES public.institucion(id),
  CONSTRAINT auditoria_campus_id_fkey FOREIGN KEY (campus_id) REFERENCES public.campus(id)
);
CREATE TABLE public.reporte (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  generado_por_id uuid NOT NULL,
  institucion_id uuid NOT NULL,
  campus_id uuid,
  carrera_id uuid,
  tipo_reporte text NOT NULL CHECK (NULLIF(btrim(tipo_reporte), ''::text) IS NOT NULL),
  periodo_desde timestamp with time zone NOT NULL,
  periodo_hasta timestamp with time zone NOT NULL,
  agrupacion text NOT NULL CHECK (agrupacion = ANY (ARRAY['SEMANA'::text, 'MES'::text])),
  filtros_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_json jsonb NOT NULL,
  generado_en timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reporte_pkey PRIMARY KEY (id),
  CONSTRAINT reporte_generado_por_id_fkey FOREIGN KEY (generado_por_id) REFERENCES public.perfil_usuario(id),
  CONSTRAINT reporte_institucion_id_fkey FOREIGN KEY (institucion_id) REFERENCES public.institucion(id),
  CONSTRAINT reporte_campus_id_fkey FOREIGN KEY (campus_id) REFERENCES public.campus(id),
  CONSTRAINT reporte_carrera_id_fkey FOREIGN KEY (carrera_id) REFERENCES public.carrera(id)
);
CREATE TABLE public.dominio_institucional (
  dominio text NOT NULL CHECK (dominio = lower(dominio) AND NULLIF(btrim(dominio), ''::text) IS NOT NULL),
  institucion_id uuid NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  CONSTRAINT dominio_institucional_pkey PRIMARY KEY (dominio),
  CONSTRAINT dominio_institucional_institucion_id_fkey FOREIGN KEY (institucion_id) REFERENCES public.institucion(id)
);