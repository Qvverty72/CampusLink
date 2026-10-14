import { authenticatedEnvelopeRequest, authenticatedRequest } from '@/lib/api/authenticated-request';

import type { AccessCatalog, AccessInput, AccessUser, AccountStateAction, UserAccess } from '../types/access';

// Codifica el segmento de campus para conservarlo como un único elemento de ruta.
const campusPath = (campusId: string) => '/api/v1/users/access/campuses/' + encodeURIComponent(campusId);
/** Lista campus en los que el usuario puede administrar accesos. */
export const loadAccessCampuses = (signal: AbortSignal) => authenticatedRequest<{ id: string; name: string }[]>('/api/v1/users/access/campuses', { signal });
/** Obtiene los catálogos autorizados para asignar roles y permisos. */
export const loadAccessCatalog = (campusId: string, signal: AbortSignal) => authenticatedRequest<AccessCatalog>(campusPath(campusId) + '/catalog', { signal });
/** Lista usuarios por página y conserva el indicador `hasMore` del servidor. */
export const loadAccessUsers = (campusId: string, page: number, signal: AbortSignal) =>
  authenticatedEnvelopeRequest<AccessUser[], { page: number; limit: number; hasMore: boolean }>(campusPath(campusId) + '/users', { signal }, new URLSearchParams({ page: String(page), limit: '20' }));
/** Consulta asignaciones y versión actual de un usuario en ese campus. */
export const loadUserAccess = (campusId: string, userId: string, signal: AbortSignal) =>
  authenticatedRequest<UserAccess>(campusPath(campusId) + '/users/' + encodeURIComponent(userId), { signal });
/** Actualiza roles y permisos usando la versión leída para detectar conflictos. */
export const saveUserAccess = (campusId: string, userId: string, input: AccessInput, signal: AbortSignal) =>
  authenticatedRequest<UserAccess>(campusPath(campusId) + '/users/' + encodeURIComponent(userId), { signal, method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
/** Cambia el estado de cuenta bajo control de versión optimista del backend. */
export const saveAccountState = (campusId: string, userId: string, accountState: AccountStateAction, version: string, signal: AbortSignal) =>
  authenticatedRequest<UserAccess>(campusPath(campusId) + '/users/' + encodeURIComponent(userId) + '/state', { signal, method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountState, version }) });
