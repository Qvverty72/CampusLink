import type { PoolClient } from 'pg';

export interface AccessProfile {
  id: string; institucion_id: string; campus_id: string; nombre_completo: string;
  estado_cuenta: string; deleted_at: Date | null; updated_at: string;
}
export interface AccessCampus { id: string; nombre: string; institucion_id: string; activo: boolean }
export interface AccessCatalogItem { id: string; nombre: string }
export interface AccessAssignment {
  id: string; catalog_id: string; nombre: string; campus_id: string;
}
export interface AccessSnapshot { roles: AccessAssignment[]; permissions: AccessAssignment[] }
/** Datos registrados de la cuenta, exclusivos del detalle administrativo autorizado. */
export interface AccessAccountProfile extends AuditResponsibleProfile { registeredAt: string | null }
export interface AccessUpdate { roleIds: string[]; permissionIds: string[]; version: string }
export interface AccountStateUpdate { accountState: 'SUSPENDIDA' | 'DESACTIVADA'; version: string }
export interface PhysicalPublication {
  id: string; campus_id: string; propietario_id: string; estado_publicacion: string;
  deleted_at: Date | null; updated_at: string;
}
export type AccessKind = 'roles' | 'permissions';
export type AccessConnection = Pick<PoolClient, 'query'>;

/** Acciones ya admitidas por auditoria_accion_check, incluida la edición de publicaciones. */
export const SQL_AUDIT_ACTIONS = [
  'ASIGNAR_ROL', 'REVOCAR_ROL', 'ASIGNAR_PERMISO', 'REVOCAR_PERMISO',
  'SUSPENDER_CUENTA', 'DESACTIVAR_CUENTA', 'REACTIVAR_CUENTA',
  'OCULTAR_PUBLICACION', 'RESTAURAR_PUBLICACION', 'RESOLVER_DENUNCIA', 'DESESTIMAR_DENUNCIA',
  'PUBLICAR_PUBLICACION', 'EDITAR_PUBLICACION', 'RETIRAR_PUBLICACION',
] as const;
export const ACTIVITY_AUDIT_ACTIONS = [
  'CREAR_ACTIVIDAD', 'PUBLICAR_EVENTO_OFICIAL', 'EDITAR_ACTIVIDAD', 'EDITAR_EVENTO_OFICIAL',
  'ELIMINAR_ACTIVIDAD', 'ELIMINAR_EVENTO_OFICIAL',
] as const;
export const AUDIT_ACTIONS = [...SQL_AUDIT_ACTIONS, ...ACTIVITY_AUDIT_ACTIONS] as const;

export interface AuditEntry {
  id: string; actor_usuario_id: string | null; institucion_id: string; campus_id: string;
  entidad_tipo: string; entidad_id: string; accion: string; created_at: string;
  entity_name?: string;
  accessGroup?: AuditAccessGroup;
  activitySeries?: { seriesId: string; count: number };
  editGroup?: { count: number };
  changes?: { complete: boolean; fields: string[] };
}
/** Nombres literales del filtro; usuarios resueltos solo dentro del campus autorizado. */
export interface AuditSearch {
  contentName?: string;
  userName?: string;
  users?: { id: string; createdAt: number }[];
}
export interface AuditOccurrences {
  seriesId: string;
  occurrences: { auditId: string; activityId: string; index?: number; title: string | null;
    startAt: string | null; endAt: string | null; status: string | null; visibility: string | null }[];
}
export interface AuditAccessGroup {
  count: number; actions: { action: string; count: number }[]; recordIds?: string[];
}
export interface AuditActivityContext {
  kind: 'created' | 'edited' | 'deleted'; snapshotSource: 'first_change' | 'current' | 'recorded';
  changedFields: string[]; revision?: number; scope?: string; operationId?: string;
  seriesId?: string; occurrenceIndex?: number;
}
export interface AuditActorRow {
  audit_id: string; available: boolean; name: string | null; roles: string[]; permissions: string[];
}
export interface AuditActor {
  kind: 'user' | 'authorized' | 'administrator' | 'unknown';
  source: 'assignment_history' | 'unavailable'; name: string | null; roles: string[]; permissions: string[];
}
export interface AuditResponsibleProfile {
  fullName: string; email: string | null; careers: { id: string; name: string }[];
}
export interface AuditDetail extends AuditEntry {
  justificacion_accion: string | null; reporte_contenido_id: string | null;
  datos_antes: unknown; datos_despues: unknown;
  activity?: AuditActivityContext;
  responsibleProfile?: AuditResponsibleProfile | null;
  publicationOwners?: Record<string, { profile: AuditResponsibleProfile | null; assignments: AuditActor }>;
}

export type AuditReferenceKind = 'user' | 'campus' | 'institution' | 'category' | 'role' | 'permission'
  | 'publication' | 'career' | 'subject' | 'assignment' | 'file' | 'report' | 'activity' | 'building' | 'floor' | 'poi';
export interface AuditReferenceName { kind: AuditReferenceKind; id: string; name: string }
export interface AuditReferenceRequest {
  path: string; kind: AuditReferenceKind; id: string; recordedName: string | null;
}
export interface AuditReference {
  kind: AuditReferenceKind; id: string; name: string | null; source: 'recorded' | 'current' | 'unavailable';
}
