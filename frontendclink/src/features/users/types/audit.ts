/** Opciones existentes de auditoría, independientes de la página actualmente cargada. */
export const AUDIT_ACTIONS = [
  'ASIGNAR_ROL', 'REVOCAR_ROL', 'ASIGNAR_PERMISO', 'REVOCAR_PERMISO',
  'SUSPENDER_CUENTA', 'DESACTIVAR_CUENTA', 'REACTIVAR_CUENTA',
  'OCULTAR_PUBLICACION', 'RESTAURAR_PUBLICACION', 'RESOLVER_DENUNCIA', 'DESESTIMAR_DENUNCIA',
  'PUBLICAR_PUBLICACION', 'EDITAR_PUBLICACION', 'RETIRAR_PUBLICACION',
  'CREAR_ACTIVIDAD', 'PUBLICAR_EVENTO_OFICIAL', 'EDITAR_ACTIVIDAD', 'EDITAR_EVENTO_OFICIAL', 'ELIMINAR_ACTIVIDAD', 'ELIMINAR_EVENTO_OFICIAL',
] as const;

export interface AuditSearch { contentName: string; userName: string }
export const EMPTY_AUDIT_SEARCH: AuditSearch = { contentName:'',userName:'' };

/** Fila mínima de auditoría acotada al campus seleccionado. */
export interface AuditEntry {
  id: string; actor_usuario_id: string | null; institucion_id: string; campus_id: string;
  entidad_tipo: string; entidad_id: string; accion: string; created_at: string;
  actor?: AuditActor;
  entity_name?: string;
  accessGroup?: { count: number; actions: { action: string; count: number }[]; recordIds?: string[] };
  activitySeries?: { seriesId: string; count: number };
  editGroup?: { count: number };
  changes?: { complete: boolean; fields: string[] };
}
export interface AuditOccurrences {
  seriesId: string;
  occurrences: { auditId: string; activityId: string; index?: number; title: string | null;
    startAt: string | null; endAt: string | null; status: string | null; visibility: string | null }[];
}
export interface AuditActor {
  kind: 'user' | 'authorized' | 'administrator' | 'unknown';
  source: 'assignment_history' | 'unavailable'; name: string | null; roles: string[]; permissions: string[];
}
/** Detalle con snapshots históricos filtrados por el backend. */
export interface AuditDetail extends AuditEntry {
  justificacion_accion: string | null; reporte_contenido_id: string | null;
  datos_antes: Record<string, unknown> | null; datos_despues: Record<string, unknown> | null;
  /** Nombres por ruta; los snapshots conservan sus valores originales. Opcional para servidores anteriores. */
  references?: Record<string, AuditReference>;
  responsibleProfile?: { fullName: string; email: string | null; careers: { id: string; name: string }[] } | null;
  publicationOwners?: Record<string, { profile: NonNullable<AuditDetail['responsibleProfile']> | null; assignments: AuditActor }>;
  activity?: {
    kind: 'created' | 'edited' | 'deleted'; snapshotSource: 'first_change' | 'current' | 'recorded';
    changedFields: string[]; revision?: number; scope?: string; operationId?: string;
    seriesId?: string; occurrenceIndex?: number;
  };
}

export interface AuditParticipation {
  activityId: string;
  summary: { joined: number; left: number; historyIncomplete: boolean };
  events: { id: string; userId: string; name: string | null; type: 'JOINED' | 'LEFT'; occurredAt: string; provenance: 'LIVE' | 'LEGACY_STATE' }[];
}

export interface AuditReference {
  kind: string; id: string; name: string | null; source: 'recorded' | 'current' | 'unavailable';
}

export const auditLabels: Record<string,string> = {
  CREAR_ACTIVIDAD: 'Actividad publicada', PUBLICAR_EVENTO_OFICIAL: 'Evento oficial publicado',
  EDITAR_ACTIVIDAD: 'Actividad editada', EDITAR_EVENTO_OFICIAL: 'Evento oficial editado',
  ELIMINAR_ACTIVIDAD: 'Actividad eliminada', ELIMINAR_EVENTO_OFICIAL: 'Evento oficial eliminado',
  actividad: 'Actividad comunitaria', evento_oficial: 'Evento oficial',
  tipo_actividad: 'Tipo de actividad', estado_actividad: 'Estado de actividad', visibilidad: 'Visibilidad',
  inicio_en: 'Inicio', termino_en: 'Término', eliminado_en: 'Eliminada en', ubicacion: 'Ubicación',
  edificio_clave: 'Edificio', piso_clave: 'Piso', poi_clave: 'Punto de interés (POI)', referencia: 'Referencia del lugar',
  COMMUNITY_ACTIVITY: 'Actividad comunitaria', OFFICIAL_EVENT: 'Evento oficial',
  ACTIVE: 'Activa', FINISHED: 'Finalizada', DELETED: 'Eliminada', PUBLIC: 'Pública', HIDDEN: 'Oculta',
  title: 'Título', description: 'Descripción', startAt: 'Inicio', endAt: 'Término', location: 'Ubicación', status: 'Estado', deletedAt: 'Eliminación', type: 'Tipo',
  PUBLICAR_PUBLICACION: 'Publicación creada', EDITAR_PUBLICACION: 'Publicación editada', RETIRAR_PUBLICACION: 'Publicación retirada',
  descripcion: 'Descripción', estado_uso: 'Condición', categoria_id: 'Categoría', modalidad: 'Modalidad', precio: 'Precio', moneda: 'Moneda',
  images: 'Imágenes', nombre_original: 'Archivo', mime_type: 'Tipo', tamano_bytes: 'Tamaño', orden: 'Orden (0: principal)',
  careers: 'Carreras', subjects: 'Asignaturas', name: 'Nombre', code: 'Código',
  ASIGNAR_ROL: 'Asignación de rol', REVOCAR_ROL: 'Revocación de rol',
  ASIGNAR_PERMISO: 'Asignación de permiso', REVOCAR_PERMISO: 'Revocación de permiso',
  SUSPENDER_CUENTA: 'Suspensión de cuenta', DESACTIVAR_CUENTA: 'Desactivación de cuenta', REACTIVAR_CUENTA: 'Reactivación de cuenta',
  OCULTAR_PUBLICACION: 'Publicación ocultada', RESTAURAR_PUBLICACION: 'Publicación restaurada',
  RESOLVER_DENUNCIA: 'Denuncia resuelta', DESESTIMAR_DENUNCIA: 'Denuncia desestimada',
  perfil_usuario: 'Cuenta', publicacion_recurso: 'Publicación', reporte_contenido: 'Denuncia',
  id: 'Identificador', institucion_id: 'Institución', campus_id: 'Campus', nombre_completo: 'Nombre', estado_cuenta: 'Estado de cuenta',
  deleted_at: 'Retirada en', updated_at: 'Actualizado en', roles: 'Roles', permissions: 'Permisos',
  assignmentId: 'Asignación afectada', catalogId: 'Rol o permiso afectado', catalog_id: 'Rol o permiso', nombre: 'Nombre',
  action: 'Acción',
  perfil_usuario_id: 'Usuario', rol_id: 'Rol', permiso_id: 'Permiso', revocado_en: 'Revocado en',
  asignado_por_id: 'Asignado por', otorgado_por_id: 'Otorgado por', asignado_en: 'Asignado en', otorgado_en: 'Otorgado en',
  propietario_id: 'Propietario', estado_publicacion: 'Estado de publicación', tipo_recurso: 'Tipo de recurso', titulo: 'Título',
  reportante_id: 'Reportante', resuelto_por_id: 'Resuelto por', entidad_tipo: 'Tipo de entidad', entidad_id: 'Entidad',
  motivo: 'Motivo original', estado_reporte: 'Estado de denuncia', fundamento_resolucion: 'Fundamento de resolución',
  medida_aplicada: 'Medida aplicada', reportado_en: 'Reportado en', resuelto_en: 'Resuelto en',
};
