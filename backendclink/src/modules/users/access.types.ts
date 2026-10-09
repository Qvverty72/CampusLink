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
export interface AccessUpdate { roleIds: string[]; permissionIds: string[]; version: string }
export interface AccountStateUpdate { accountState: 'SUSPENDIDA' | 'DESACTIVADA'; version: string }
export interface PhysicalPublication {
  id: string; campus_id: string; propietario_id: string; estado_publicacion: string;
  deleted_at: Date | null; updated_at: string;
}
export type AccessKind = 'roles' | 'permissions';
export type AccessConnection = Pick<PoolClient, 'query'>;

export interface AuditEntry {
  id: string; actor_usuario_id: string | null; institucion_id: string; campus_id: string;
  entidad_tipo: string; entidad_id: string; accion: string; created_at: string;
}
export interface AuditDetail extends AuditEntry {
  justificacion_accion: string | null; reporte_contenido_id: string | null;
  datos_antes: unknown; datos_despues: unknown;
}
