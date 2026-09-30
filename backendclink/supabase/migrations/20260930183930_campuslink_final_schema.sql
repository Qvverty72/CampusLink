-- CampusLink - esquema relacional v0.4 SLIM
-- Supabase/PostgreSQL
--
-- Objetivo de esta version:
--   * PostgreSQL = persistencia e integridad estructural.
--   * Express = fuente de verdad de reglas de negocio, autorizacion y flujos.
--   * Expo = UX y validaciones rapidas.
--   * MongoDB = mapa 3D, actividades y participaciones.
--
-- Deliberadamente NO se implementan triggers de negocio.
-- El backend debe encargarse, entre otros, de:
--   - validar correo institucional y verificacion en Supabase Auth;
--   - validar rol, permiso y campus del actor;
--   - validar coherencia campus <-> carrera <-> asignatura;
--   - controlar transiciones de estados;
--   - aceptar/rechazar solicitudes y reservar/liberar publicaciones;
--   - completar/cancelar transacciones;
--   - comprobar que las confirmaciones correspondan a propietario/receptor;
--   - comprobar que el receptor valore al propietario solo tras completar;
--   - crear accesos digitales tras una transaccion digital completada;
--   - registrar auditoria SOLO para acciones administrativas criticas;
--   - validar referencias hacia MongoDB;
--   - generar analitica y reportería mediante consultas;
--   - persistir snapshots historicos de reportes cuando el usuario los genere.
--
-- El frontend NO accede directamente a estas tablas. La API Express utiliza
-- la service role de Supabase exclusivamente en backend.
--
-- Script pensado para una instalacion nueva. Para una BD existente usar ALTER.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. ORGANIZACION ACADEMICA
-- ============================================================

CREATE TABLE public.institucion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  tipo text,
  pais text NOT NULL DEFAULT 'Chile',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.campus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institucion_id uuid NOT NULL REFERENCES public.institucion(id),
  nombre text NOT NULL,
  direccion text,
  ciudad text,
  region text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.carrera (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institucion_id uuid NOT NULL REFERENCES public.institucion(id),
  nombre text NOT NULL,
  codigo text,
  facultad text,
  jornada text CHECK (jornada IS NULL OR jornada IN ('DIURNA', 'VESPERTINA')),
  nivel_formacion text CHECK (
    nivel_formacion IS NULL OR nivel_formacion IN ('TECNICO', 'PROFESIONAL')
  ),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.asignatura (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  codigo text NOT NULL UNIQUE,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.campus_carrera (
  campus_id uuid NOT NULL REFERENCES public.campus(id),
  carrera_id uuid NOT NULL REFERENCES public.carrera(id),
  PRIMARY KEY (campus_id, carrera_id)
);

CREATE TABLE public.carrera_asignatura (
  carrera_id uuid NOT NULL REFERENCES public.carrera(id),
  asignatura_id uuid NOT NULL REFERENCES public.asignatura(id),
  semestre_nivel smallint NOT NULL CHECK (semestre_nivel > 0),
  PRIMARY KEY (carrera_id, asignatura_id)
);

-- ============================================================
-- 2. IDENTIDAD Y PERFIL
-- auth.users conserva correo, autenticacion y credenciales.
-- perfil_usuario contiene solo informacion funcional CampusLink.
-- ============================================================

CREATE TABLE public.perfil_usuario (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  institucion_id uuid NOT NULL REFERENCES public.institucion(id),
  campus_id uuid NOT NULL REFERENCES public.campus(id),
  nombre_completo varchar(200) NOT NULL CHECK (nullif(btrim(nombre_completo), '') IS NOT NULL),
  foto_path text,
  estado_cuenta text NOT NULL DEFAULT 'ACTIVA'
    CHECK (estado_cuenta IN ('ACTIVA', 'SUSPENDIDA', 'DESACTIVADA')),
  verificado_en timestamptz,
  genero text CHECK (
    genero IS NULL OR genero IN ('MASCULINO', 'FEMENINO', 'OTRO', 'PREFIERO_NO_INFORMAR')
  ),
  fecha_nacimiento date,
  pais_origen text NOT NULL DEFAULT 'Chile',
  region_origen text,
  comuna_origen text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- El backend valida que la carrera se imparta en el campus actual del usuario.
CREATE TABLE public.usuario_carrera (
  perfil_usuario_id uuid NOT NULL REFERENCES public.perfil_usuario(id),
  carrera_id uuid NOT NULL REFERENCES public.carrera(id),
  anio_ingreso smallint CHECK (
    anio_ingreso IS NULL OR anio_ingreso BETWEEN 1900 AND 2200
  ),
  PRIMARY KEY (perfil_usuario_id, carrera_id)
);

-- Necesaria para HU de perfil/recomendaciones por asignaturas cursadas.
-- El backend valida que la asignatura pertenezca a alguna carrera del usuario.
CREATE TABLE public.usuario_asignatura (
  perfil_usuario_id uuid NOT NULL REFERENCES public.perfil_usuario(id),
  asignatura_id uuid NOT NULL REFERENCES public.asignatura(id),
  PRIMARY KEY (perfil_usuario_id, asignatura_id)
);

-- ============================================================
-- 3. AUTORIZACION
-- Las reglas de autorizacion se ejecutan en Express.
-- La BD conserva la estructura e historial de asignacion/revocacion.
-- ============================================================

CREATE TABLE public.rol (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  descripcion text
);

CREATE TABLE public.permiso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  descripcion text
);

CREATE TABLE public.rol_permiso (
  rol_id uuid NOT NULL REFERENCES public.rol(id),
  permiso_id uuid NOT NULL REFERENCES public.permiso(id),
  PRIMARY KEY (rol_id, permiso_id)
);

CREATE TABLE public.usuario_rol (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_usuario_id uuid NOT NULL REFERENCES public.perfil_usuario(id),
  rol_id uuid NOT NULL REFERENCES public.rol(id),
  campus_id uuid NOT NULL REFERENCES public.campus(id),
  asignado_por_id uuid REFERENCES public.perfil_usuario(id),
  asignado_en timestamptz NOT NULL DEFAULT now(),
  revocado_en timestamptz,
  CHECK (revocado_en IS NULL OR revocado_en >= asignado_en)
);

CREATE TABLE public.usuario_permiso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_usuario_id uuid NOT NULL REFERENCES public.perfil_usuario(id),
  permiso_id uuid NOT NULL REFERENCES public.permiso(id),
  campus_id uuid NOT NULL REFERENCES public.campus(id),
  otorgado_por_id uuid REFERENCES public.perfil_usuario(id),
  otorgado_en timestamptz NOT NULL DEFAULT now(),
  revocado_en timestamptz,
  CHECK (revocado_en IS NULL OR revocado_en >= otorgado_en)
);

CREATE UNIQUE INDEX usuario_rol_vigente_uq
  ON public.usuario_rol (perfil_usuario_id, rol_id, campus_id)
  WHERE revocado_en IS NULL;

CREATE UNIQUE INDEX usuario_permiso_vigente_uq
  ON public.usuario_permiso (perfil_usuario_id, permiso_id, campus_id)
  WHERE revocado_en IS NULL;

-- ============================================================
-- 4. PUBLICACIONES Y RECURSOS
-- ============================================================

CREATE TABLE public.publicacion_recurso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES public.campus(id),
  propietario_id uuid NOT NULL REFERENCES public.perfil_usuario(id),
  tipo_recurso text NOT NULL CHECK (tipo_recurso IN ('FISICO', 'DIGITAL')),
  titulo text NOT NULL CHECK (nullif(btrim(titulo), '') IS NOT NULL),
  descripcion text,
  modalidad text NOT NULL CHECK (modalidad IN ('VENTA', 'DONACION')),
  precio numeric(12,2),
  moneda varchar(3) NOT NULL DEFAULT 'CLP' CHECK (moneda ~ '^[A-Z]{3}$'),
  estado_publicacion text NOT NULL DEFAULT 'DISPONIBLE'
    CHECK (estado_publicacion IN (
      'DISPONIBLE', 'RESERVADO', 'FINALIZADO', 'CANCELADO', 'OCULTO'
    )),
  publicado_en timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT publicacion_precio_modalidad_chk CHECK (
    (modalidad = 'VENTA' AND precio IS NOT NULL AND precio > 0)
    OR
    (modalidad = 'DONACION' AND precio IS NULL)
  )
);

-- Subtipo digital. No contiene contadores derivados ni licencia_confirmada:
-- la autorizacion/derechos de publicacion se valida en el flujo del backend.
CREATE TABLE public.recurso_digital (
  publicacion_id uuid PRIMARY KEY REFERENCES public.publicacion_recurso(id)
);

CREATE TABLE public.categoria_recurso_fisico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  descripcion text,
  activo boolean NOT NULL DEFAULT true
);

CREATE TABLE public.recurso_fisico (
  publicacion_id uuid PRIMARY KEY REFERENCES public.publicacion_recurso(id),
  categoria_id uuid NOT NULL REFERENCES public.categoria_recurso_fisico(id),
  estado_uso text NOT NULL
    CHECK (estado_uso IN ('NUEVO', 'BUEN_ESTADO', 'USADO', 'DETERIORADO'))
);

-- Storage guarda el binario. PostgreSQL solo guarda referencia/metadatos.
-- PREVIEW existe porque la regla de negocio permite vista previa.
CREATE TABLE public.archivo_publicacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publicacion_id uuid NOT NULL REFERENCES public.publicacion_recurso(id),
  bucket_id text NOT NULL CHECK (nullif(btrim(bucket_id), '') IS NOT NULL),
  storage_path text NOT NULL CHECK (nullif(btrim(storage_path), '') IS NOT NULL),
  nombre_original text NOT NULL CHECK (nullif(btrim(nombre_original), '') IS NOT NULL),
  mime_type text NOT NULL CHECK (nullif(btrim(mime_type), '') IS NOT NULL),
  tamano_bytes bigint NOT NULL CHECK (tamano_bytes > 0 AND tamano_bytes <= 26214400),
  tipo_archivo text NOT NULL CHECK (tipo_archivo IN ('IMAGEN', 'RECURSO', 'PREVIEW')),
  orden smallint NOT NULL DEFAULT 0 CHECK (orden >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (bucket_id, storage_path)
);

-- Clasificacion comun para publicaciones fisicas y digitales.
-- Evita cuatro tablas duplicadas por subtipo.
CREATE TABLE public.publicacion_carrera (
  publicacion_id uuid NOT NULL REFERENCES public.publicacion_recurso(id),
  carrera_id uuid NOT NULL REFERENCES public.carrera(id),
  PRIMARY KEY (publicacion_id, carrera_id)
);

CREATE TABLE public.publicacion_asignatura (
  publicacion_id uuid NOT NULL REFERENCES public.publicacion_recurso(id),
  asignatura_id uuid NOT NULL REFERENCES public.asignatura(id),
  PRIMARY KEY (publicacion_id, asignatura_id)
);

CREATE INDEX publicacion_busqueda_idx
  ON public.publicacion_recurso
  (campus_id, tipo_recurso, estado_publicacion, publicado_en DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX publicacion_propietario_idx
  ON public.publicacion_recurso (propietario_id, publicado_en DESC);

CREATE INDEX publicacion_carrera_idx
  ON public.publicacion_carrera (carrera_id, publicacion_id);

CREATE INDEX publicacion_asignatura_idx
  ON public.publicacion_asignatura (asignatura_id, publicacion_id);

CREATE INDEX archivo_publicacion_idx
  ON public.archivo_publicacion (publicacion_id, tipo_archivo)
  WHERE deleted_at IS NULL;

-- ============================================================
-- 5. SOLICITUDES Y TRANSACCIONES
-- Express controla el flujo de estados y la coherencia entre estas tablas.
-- ============================================================

CREATE TABLE public.mensaje_solicitud (
  codigo text PRIMARY KEY,
  descripcion text NOT NULL,
  activo boolean NOT NULL DEFAULT true
);

CREATE TABLE public.solicitud_recurso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publicacion_id uuid NOT NULL REFERENCES public.publicacion_recurso(id),
  solicitante_id uuid NOT NULL REFERENCES public.perfil_usuario(id),
  estado_solicitud text NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado_solicitud IN ('PENDIENTE', 'ACEPTADA', 'RECHAZADA', 'CANCELADA')),
  codigo_mensaje text NOT NULL REFERENCES public.mensaje_solicitud(codigo),
  solicitada_en timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX solicitud_activa_unica_uq
  ON public.solicitud_recurso (publicacion_id, solicitante_id)
  WHERE estado_solicitud IN ('PENDIENTE', 'ACEPTADA');

CREATE INDEX solicitud_publicacion_estado_idx
  ON public.solicitud_recurso (publicacion_id, estado_solicitud, solicitada_en DESC);

CREATE INDEX solicitud_solicitante_idx
  ON public.solicitud_recurso (solicitante_id, solicitada_en DESC);

CREATE TABLE public.transaccion_recurso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id uuid NOT NULL UNIQUE REFERENCES public.solicitud_recurso(id),
  publicacion_id uuid NOT NULL REFERENCES public.publicacion_recurso(id),
  propietario_id uuid NOT NULL REFERENCES public.perfil_usuario(id),
  receptor_id uuid NOT NULL REFERENCES public.perfil_usuario(id),
  cancelada_por_id uuid REFERENCES public.perfil_usuario(id),

  estado_transaccion text NOT NULL DEFAULT 'RESERVADA'
    CHECK (estado_transaccion IN (
      'RESERVADA', 'PENDIENTE_CONFIRMACION', 'COMPLETADA', 'CANCELADA'
    )),

  modalidad_acordada text NOT NULL CHECK (modalidad_acordada IN ('VENTA', 'DONACION')),
  monto_acordado numeric(12,2),
  moneda varchar(3) NOT NULL DEFAULT 'CLP' CHECK (moneda ~ '^[A-Z]{3}$'),

  iniciada_en timestamptz NOT NULL DEFAULT now(),
  completada_en timestamptz,
  cancelada_en timestamptz,

  motivo_cancelacion text CHECK (
    motivo_cancelacion IS NULL OR motivo_cancelacion IN (
      'USUARIO_DESISTE',
      'NO_RESPONDE',
      'RECURSO_NO_DISPONIBLE',
      'PROBLEMA_ACUERDO',
      'OTRO'
    )
  ),
  detalle_cancelacion text,

  CONSTRAINT transaccion_participantes_chk
    CHECK (propietario_id <> receptor_id),

  CONSTRAINT transaccion_monto_modalidad_chk CHECK (
    (modalidad_acordada = 'VENTA' AND monto_acordado IS NOT NULL AND monto_acordado > 0)
    OR
    (modalidad_acordada = 'DONACION' AND monto_acordado IS NULL)
  ),

  CONSTRAINT transaccion_cancelacion_chk CHECK (
    (
      estado_transaccion = 'CANCELADA'
      AND cancelada_por_id IS NOT NULL
      AND cancelada_en IS NOT NULL
      AND motivo_cancelacion IS NOT NULL
    )
    OR
    (
      estado_transaccion <> 'CANCELADA'
      AND cancelada_por_id IS NULL
      AND cancelada_en IS NULL
      AND motivo_cancelacion IS NULL
      AND detalle_cancelacion IS NULL
    )
  ),

  CONSTRAINT transaccion_detalle_otro_chk CHECK (
    (motivo_cancelacion = 'OTRO' AND nullif(btrim(detalle_cancelacion), '') IS NOT NULL)
    OR
    (motivo_cancelacion IS DISTINCT FROM 'OTRO' AND detalle_cancelacion IS NULL)
  ),

  CONSTRAINT transaccion_completada_chk CHECK (
    (estado_transaccion = 'COMPLETADA' AND completada_en IS NOT NULL)
    OR
    (estado_transaccion <> 'COMPLETADA' AND completada_en IS NULL)
  )
);

-- La exclusividad de una transaccion FISICA activa se valida en Express,
-- porque depende del tipo de la publicacion y del flujo de negocio.

CREATE INDEX transaccion_receptor_idx
  ON public.transaccion_recurso (receptor_id, iniciada_en DESC);

CREATE INDEX transaccion_propietario_idx
  ON public.transaccion_recurso (propietario_id, iniciada_en DESC);

CREATE TABLE public.confirmacion_transaccion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaccion_id uuid NOT NULL REFERENCES public.transaccion_recurso(id),
  usuario_id uuid NOT NULL REFERENCES public.perfil_usuario(id),
  rol_confirmante text NOT NULL CHECK (rol_confirmante IN ('PROPIETARIO', 'RECEPTOR')),
  confirmado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transaccion_id, usuario_id),
  UNIQUE (transaccion_id, rol_confirmante)
);

CREATE TABLE public.valoracion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaccion_id uuid NOT NULL UNIQUE REFERENCES public.transaccion_recurso(id),
  evaluador_id uuid NOT NULL REFERENCES public.perfil_usuario(id),
  evaluado_id uuid NOT NULL REFERENCES public.perfil_usuario(id),
  puntuacion smallint NOT NULL CHECK (puntuacion BETWEEN 1 AND 5),
  comentario text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (evaluador_id <> evaluado_id)
);

CREATE INDEX valoracion_evaluado_idx
  ON public.valoracion (evaluado_id, created_at DESC);

-- Derecho de acceso persistente a una publicacion digital adquirida.
-- Express crea esta fila solo al completar una transaccion DIGITAL.
CREATE TABLE public.acceso_recurso_digital (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaccion_id uuid NOT NULL UNIQUE REFERENCES public.transaccion_recurso(id),
  publicacion_id uuid NOT NULL REFERENCES public.publicacion_recurso(id),
  receptor_id uuid NOT NULL REFERENCES public.perfil_usuario(id),
  concedido_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (publicacion_id, receptor_id)
);

-- ============================================================
-- 6. NOTIFICACIONES E INTERACCION
-- ============================================================

CREATE TABLE public.notificacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destinatario_id uuid NOT NULL REFERENCES public.perfil_usuario(id),
  publicacion_id uuid REFERENCES public.publicacion_recurso(id),
  transaccion_id uuid REFERENCES public.transaccion_recurso(id),
  actividad_id text, -- ObjectId/ID logico de MongoDB; la API valida su existencia.
  tipo_notificacion text,
  titulo text,
  mensaje text NOT NULL,
  leida_en timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX notificacion_destinatario_idx
  ON public.notificacion (destinatario_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Eventos para recomendaciones/analitica de recursos.
-- El campus se obtiene desde publicacion_recurso, por lo que no se duplica aqui.
CREATE TABLE public.interaccion_recurso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_usuario_id uuid NOT NULL REFERENCES public.perfil_usuario(id),
  publicacion_id uuid NOT NULL REFERENCES public.publicacion_recurso(id),
  tipo_interaccion text NOT NULL CHECK (tipo_interaccion IN ('VISTA', 'CLIC', 'GUARDADO')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX interaccion_usuario_fecha_idx
  ON public.interaccion_recurso (perfil_usuario_id, created_at DESC);

CREATE INDEX interaccion_publicacion_fecha_idx
  ON public.interaccion_recurso (publicacion_id, created_at DESC);

-- ============================================================
-- 7. MODERACION, AUDITORIA Y REPORTERIA
--
-- Los KPI se calculan desde los datos operacionales.
-- Cuando un usuario autorizado genera un reporte, Express persiste aqui
-- sus parametros, periodo y snapshot para conservar el resultado historico.
-- ============================================================

CREATE TABLE public.reporte_contenido (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reportante_id uuid NOT NULL REFERENCES public.perfil_usuario(id),
  resuelto_por_id uuid REFERENCES public.perfil_usuario(id),
  campus_id uuid NOT NULL REFERENCES public.campus(id),

  entidad_tipo text NOT NULL CHECK (
    entidad_tipo IN (
      'PUBLICACION_FISICA',
      'PUBLICACION_DIGITAL',
      'TRANSACCION',
      'ACTIVIDAD',
      'COMPORTAMIENTO'
    )
  ),
  entidad_id text NOT NULL, -- UUID SQL u ObjectId MongoDB.
  motivo text NOT NULL,
  descripcion text,

  -- Snapshot opcional del contenido denunciado para trazabilidad.
  contenido_reportado_json jsonb,

  estado_reporte text NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado_reporte IN ('PENDIENTE', 'EN_REVISION', 'RESUELTO', 'DESESTIMADO')),

  fundamento_resolucion text,
  medida_aplicada text,
  reportado_en timestamptz NOT NULL DEFAULT now(),
  resuelto_en timestamptz,

  CONSTRAINT reporte_resolucion_chk CHECK (
    (
      estado_reporte IN ('RESUELTO', 'DESESTIMADO')
      AND resuelto_por_id IS NOT NULL
      AND resuelto_en IS NOT NULL
      AND nullif(btrim(fundamento_resolucion), '') IS NOT NULL
    )
    OR
    (
      estado_reporte IN ('PENDIENTE', 'EN_REVISION')
      AND resuelto_por_id IS NULL
      AND resuelto_en IS NULL
      AND fundamento_resolucion IS NULL
      AND medida_aplicada IS NULL
    )
  )
);

CREATE INDEX reporte_contenido_campus_estado_idx
  ON public.reporte_contenido (campus_id, estado_reporte, reportado_en DESC);

CREATE INDEX reporte_contenido_entidad_idx
  ON public.reporte_contenido (entidad_tipo, entidad_id);

-- Solo acciones criticas. Express inserta estas filas explicitamente.
CREATE TABLE public.auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_usuario_id uuid REFERENCES public.perfil_usuario(id),
  institucion_id uuid NOT NULL REFERENCES public.institucion(id),
  campus_id uuid REFERENCES public.campus(id),
  entidad_tipo text NOT NULL,
  entidad_id text NOT NULL,

  accion text NOT NULL CHECK (accion IN (
    'SUSPENDER_CUENTA',
    'REACTIVAR_CUENTA',
    'DESACTIVAR_CUENTA',
    'ASIGNAR_ROL',
    'REVOCAR_ROL',
    'ASIGNAR_PERMISO',
    'REVOCAR_PERMISO',
    'OCULTAR_PUBLICACION',
    'RESTAURAR_PUBLICACION',
    'RESOLVER_DENUNCIA',
    'DESESTIMAR_DENUNCIA'
  )),

  justificacion_accion text,
  reporte_contenido_id uuid REFERENCES public.reporte_contenido(id),
  datos_antes jsonb,
  datos_despues jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auditoria_ambito_fecha_idx
  ON public.auditoria (institucion_id, campus_id, created_at DESC);

CREATE INDEX auditoria_accion_fecha_idx
  ON public.auditoria (accion, created_at DESC);

-- Snapshot historico de reporteria.
-- Express calcula el reporte usando PostgreSQL y, cuando corresponda, MongoDB;
-- PostgreSQL solo persiste el resultado generado.
CREATE TABLE public.reporte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generado_por_id uuid NOT NULL REFERENCES public.perfil_usuario(id),
  institucion_id uuid NOT NULL REFERENCES public.institucion(id),
  campus_id uuid REFERENCES public.campus(id),
  carrera_id uuid REFERENCES public.carrera(id),

  tipo_reporte text NOT NULL CHECK (nullif(btrim(tipo_reporte), '') IS NOT NULL),

  periodo_desde timestamptz NOT NULL,
  periodo_hasta timestamptz NOT NULL,

  agrupacion text NOT NULL
    CHECK (agrupacion IN ('SEMANA', 'MES')),

  filtros_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_json jsonb NOT NULL,

  generado_en timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reporte_periodo_chk
    CHECK (periodo_desde < periodo_hasta)
);

CREATE INDEX reporte_ambito_fecha_idx
  ON public.reporte (institucion_id, campus_id, generado_en DESC);

CREATE INDEX reporte_generado_por_idx
  ON public.reporte (generado_por_id, generado_en DESC);

-- ============================================================
-- 8. CORREO INSTITUCIONAL
-- El backend extrae el dominio de auth.users.email y valida contra este catalogo.
-- Los administradores pueden seguir la excepcion definida por la regla de negocio.
-- ============================================================

CREATE TABLE public.dominio_institucional (
  dominio text PRIMARY KEY
    CHECK (dominio = lower(dominio) AND nullif(btrim(dominio), '') IS NOT NULL),
  institucion_id uuid NOT NULL REFERENCES public.institucion(id),
  activo boolean NOT NULL DEFAULT true
);

-- ============================================================
-- 9. INDICES GENERALES
-- ============================================================

CREATE INDEX campus_institucion_idx
  ON public.campus (institucion_id);

CREATE INDEX carrera_institucion_idx
  ON public.carrera (institucion_id);

CREATE INDEX usuario_carrera_carrera_idx
  ON public.usuario_carrera (carrera_id);

CREATE INDEX usuario_asignatura_asignatura_idx
  ON public.usuario_asignatura (asignatura_id);

CREATE INDEX usuario_rol_usuario_idx
  ON public.usuario_rol (perfil_usuario_id);

CREATE INDEX usuario_permiso_usuario_idx
  ON public.usuario_permiso (perfil_usuario_id);

CREATE INDEX acceso_digital_receptor_idx
  ON public.acceso_recurso_digital (receptor_id, concedido_en DESC);

-- ============================================================
-- 10. AISLAMIENTO ESENCIAL
--
-- Modelo simple:
--   Expo -> Express -> Supabase
--
-- anon/authenticated NO acceden directamente a las tablas.
-- Express utiliza SUPABASE_SERVICE_ROLE_KEY solo en servidor.
-- Autorizacion de usuario, rol, permiso y campus se resuelve en Express.
--
-- Se habilita RLS como defensa contra acceso directo accidental, pero no se
-- replica toda la logica de autorizacion en decenas de policies/triggers.
-- Sin policies, anon/authenticated quedan bloqueados.
-- ============================================================

ALTER TABLE public.institucion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrera ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asignatura ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_carrera ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrera_asignatura ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfil_usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_carrera ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_asignatura ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rol ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permiso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rol_permiso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_rol ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_permiso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publicacion_recurso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurso_digital ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categoria_recurso_fisico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurso_fisico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archivo_publicacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publicacion_carrera ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publicacion_asignatura ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensaje_solicitud ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitud_recurso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaccion_recurso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.confirmacion_transaccion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valoracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acceso_recurso_digital ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interaccion_recurso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reporte_contenido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reporte ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dominio_institucional ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.institucion FROM anon, authenticated;
REVOKE ALL ON TABLE public.campus FROM anon, authenticated;
REVOKE ALL ON TABLE public.carrera FROM anon, authenticated;
REVOKE ALL ON TABLE public.asignatura FROM anon, authenticated;
REVOKE ALL ON TABLE public.campus_carrera FROM anon, authenticated;
REVOKE ALL ON TABLE public.carrera_asignatura FROM anon, authenticated;
REVOKE ALL ON TABLE public.perfil_usuario FROM anon, authenticated;
REVOKE ALL ON TABLE public.usuario_carrera FROM anon, authenticated;
REVOKE ALL ON TABLE public.usuario_asignatura FROM anon, authenticated;
REVOKE ALL ON TABLE public.rol FROM anon, authenticated;
REVOKE ALL ON TABLE public.permiso FROM anon, authenticated;
REVOKE ALL ON TABLE public.rol_permiso FROM anon, authenticated;
REVOKE ALL ON TABLE public.usuario_rol FROM anon, authenticated;
REVOKE ALL ON TABLE public.usuario_permiso FROM anon, authenticated;
REVOKE ALL ON TABLE public.publicacion_recurso FROM anon, authenticated;
REVOKE ALL ON TABLE public.recurso_digital FROM anon, authenticated;
REVOKE ALL ON TABLE public.categoria_recurso_fisico FROM anon, authenticated;
REVOKE ALL ON TABLE public.recurso_fisico FROM anon, authenticated;
REVOKE ALL ON TABLE public.archivo_publicacion FROM anon, authenticated;
REVOKE ALL ON TABLE public.publicacion_carrera FROM anon, authenticated;
REVOKE ALL ON TABLE public.publicacion_asignatura FROM anon, authenticated;
REVOKE ALL ON TABLE public.mensaje_solicitud FROM anon, authenticated;
REVOKE ALL ON TABLE public.solicitud_recurso FROM anon, authenticated;
REVOKE ALL ON TABLE public.transaccion_recurso FROM anon, authenticated;
REVOKE ALL ON TABLE public.confirmacion_transaccion FROM anon, authenticated;
REVOKE ALL ON TABLE public.valoracion FROM anon, authenticated;
REVOKE ALL ON TABLE public.acceso_recurso_digital FROM anon, authenticated;
REVOKE ALL ON TABLE public.notificacion FROM anon, authenticated;
REVOKE ALL ON TABLE public.interaccion_recurso FROM anon, authenticated;
REVOKE ALL ON TABLE public.reporte_contenido FROM anon, authenticated;
REVOKE ALL ON TABLE public.reporte FROM anon, authenticated;
REVOKE ALL ON TABLE public.auditoria FROM anon, authenticated;
REVOKE ALL ON TABLE public.dominio_institucional FROM anon, authenticated;

COMMIT;
