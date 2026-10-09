import { authenticatedEnvelopeRequest, authenticatedRequest } from '@/lib/api/authenticated-request';

export interface AccessUser { userId: string; fullName: string; accountState: string; campusId: string }
export interface AccessAssignment { id: string; catalog_id: string; nombre: string; campus_id: string }
export interface UserAccess extends AccessUser { roles: AccessAssignment[]; permissions: AccessAssignment[]; version: string }
export interface AccessCatalog { roles: { id: string; nombre: string }[]; permissions: { id: string; nombre: string }[] }
export interface AccessInput { roleIds: string[]; permissionIds: string[]; version: string }
export const canManageAccess = (roles: { name: string }[]) => roles.some(role => role.name === 'ADMINISTRADOR');
const campusPath = (campusId: string) => '/api/v1/users/access/campuses/' + encodeURIComponent(campusId);
export const loadAccessCampuses = (signal: AbortSignal) => authenticatedRequest<{ id: string; name: string }[]>('/api/v1/users/access/campuses', { signal });
export const loadAccessCatalog = (campusId: string, signal: AbortSignal) => authenticatedRequest<AccessCatalog>(campusPath(campusId) + '/catalog', { signal });
export const loadAccessUsers = (campusId: string, page: number, signal: AbortSignal) =>
  authenticatedEnvelopeRequest<AccessUser[], { page: number; limit: number; hasMore: boolean }>(campusPath(campusId) + '/users', { signal }, new URLSearchParams({ page: String(page), limit: '20' }));
export const loadUserAccess = (campusId: string, userId: string, signal: AbortSignal) =>
  authenticatedRequest<UserAccess>(campusPath(campusId) + '/users/' + encodeURIComponent(userId), { signal });
export const saveUserAccess = (campusId: string, userId: string, input: AccessInput, signal: AbortSignal) =>
  authenticatedRequest<UserAccess>(campusPath(campusId) + '/users/' + encodeURIComponent(userId), { signal, method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
export type AccountStateAction = 'SUSPENDIDA' | 'DESACTIVADA';
export const saveAccountState = (campusId: string, userId: string, accountState: AccountStateAction, version: string, signal: AbortSignal) =>
  authenticatedRequest<UserAccess>(campusPath(campusId) + '/users/' + encodeURIComponent(userId) + '/state', { signal, method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountState, version }) });
export const accessLabels: Record<string, string> = {
  ADMINISTRADOR: 'Administrador', USUARIO_AUTORIZADO: 'Usuario autorizado',
  PUBLICAR_EVENTO: 'Publicar actividades oficiales', ACCEDER_ANALITICA: 'Acceder a Analítica', ACCEDER_REPORTERIA: 'Acceder a Reportería',
};
