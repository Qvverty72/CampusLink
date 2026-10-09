import type { PoolClient } from 'pg';

export interface AccessProfile {
  id: string; institucion_id: string; campus_id: string; nombre_completo: string;
  estado_cuenta: string; deleted_at: Date | null;
}
export interface AccessCampus { id: string; nombre: string; institucion_id: string; activo: boolean }
export interface AccessCatalogItem { id: string; nombre: string }
export interface AccessAssignment {
  id: string; catalog_id: string; nombre: string; campus_id: string;
}
export interface AccessSnapshot { roles: AccessAssignment[]; permissions: AccessAssignment[] }
export interface AccessUpdate { roleIds: string[]; permissionIds: string[]; version: string }
export type AccessKind = 'roles' | 'permissions';
export type AccessConnection = Pick<PoolClient, 'query'>;
