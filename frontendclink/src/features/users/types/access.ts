export interface AccessUser { userId: string; fullName: string; accountState: string; campusId: string }
export interface AccessAssignment { id: string; catalog_id: string; nombre: string; campus_id: string }
export interface UserAccess extends AccessUser { roles: AccessAssignment[]; permissions: AccessAssignment[]; version: string }
export interface AccessCatalog { roles: { id: string; nombre: string }[]; permissions: { id: string; nombre: string }[] }
export interface AccessInput { roleIds: string[]; permissionIds: string[]; version: string }
export const canManageAccess = (roles: { name: string }[]) => roles.some(role => role.name === 'ADMINISTRADOR');

export type AccountStateAction = 'SUSPENDIDA' | 'DESACTIVADA';

export const accessLabels: Record<string, string> = {
  ADMINISTRADOR: 'Administrador', USUARIO_AUTORIZADO: 'Usuario autorizado',
  PUBLICAR_EVENTO: 'Publicar actividades oficiales', ACCEDER_ANALITICA: 'Acceder a Analítica', ACCEDER_REPORTERIA: 'Acceder a Reportería',
};
