import { authenticatedEnvelopeRequest, authenticatedRequest } from '@/lib/api/authenticated-request';

import type { AccessCatalog, AccessInput, AccessUser, AccountStateAction, UserAccess } from '../types/access';

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
export const saveAccountState = (campusId: string, userId: string, accountState: AccountStateAction, version: string, signal: AbortSignal) =>
  authenticatedRequest<UserAccess>(campusPath(campusId) + '/users/' + encodeURIComponent(userId) + '/state', { signal, method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountState, version }) });
