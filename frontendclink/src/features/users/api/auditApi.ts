import { authenticatedEnvelopeRequest, authenticatedRequest } from '@/lib/api/authenticated-request';

import type { AuditDetail, AuditEntry } from '../types/audit';

const path = (campusId: string) => '/api/v1/users/access/campuses/' + encodeURIComponent(campusId) + '/audit';
export const loadAuditEntries = (campusId: string, page: number, signal: AbortSignal) =>
  authenticatedEnvelopeRequest<AuditEntry[], { page: number; limit: number; hasMore: boolean }>(path(campusId), { signal },
    new URLSearchParams({ page: String(page), limit: '20' }));
export const loadAuditEntry = (campusId: string, id: string, signal: AbortSignal) =>
  authenticatedRequest<AuditDetail>(path(campusId) + '/' + encodeURIComponent(id), { signal });
