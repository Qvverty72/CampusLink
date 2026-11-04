-- Usa tablas y columnas existentes; aplicar después de las migraciones previas de recursos físicos y auditoría.
BEGIN;
ALTER TABLE public.auditoria DROP CONSTRAINT IF EXISTS auditoria_accion_check;
ALTER TABLE public.auditoria ADD CONSTRAINT auditoria_accion_check CHECK (accion IN (
  'SUSPENDER_CUENTA','REACTIVAR_CUENTA','DESACTIVAR_CUENTA','ASIGNAR_ROL','REVOCAR_ROL',
  'ASIGNAR_PERMISO','REVOCAR_PERMISO','OCULTAR_PUBLICACION','RESTAURAR_PUBLICACION',
  'RESOLVER_DENUNCIA','DESESTIMAR_DENUNCIA','PUBLICAR_PUBLICACION','EDITAR_PUBLICACION','RETIRAR_PUBLICACION'
));
GRANT UPDATE(titulo,descripcion,modalidad,precio,deleted_at,updated_at) ON public.publicacion_recurso TO service_role;
GRANT UPDATE(estado_uso,categoria_id) ON public.recurso_fisico TO service_role;
COMMIT;
