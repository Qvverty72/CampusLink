import { authenticatedEnvelopeRequest, authenticatedRequest } from '@/lib/api/authenticated-request';

import type { AuditDetail, AuditEntry, AuditParticipation, AuditOccurrences, AuditSearch } from '../types/audit';
import { auditDateBounds, EMPTY_AUDIT_DATES, type AuditDateRange } from '../utils/auditDateRange';

/** Construye la ruta auditada del campus con su segmento codificado. */
const path = (campusId: string) => '/api/v1/users/access/campuses/' + encodeURIComponent(campusId) + '/audit';
/** Consulta una página de entradas de auditoría del campus. */
export const loadAuditEntries = (campusId: string, page: number, signal: AbortSignal, action = '', dates: AuditDateRange = EMPTY_AUDIT_DATES, search: AuditSearch = { contentName:'',userName:'' }) => {
  const query = new URLSearchParams({ page: String(page), limit: '20' });
  if (action) query.set('action', action);
  const bounds = auditDateBounds(dates);
  if (bounds.from) query.set('from', bounds.from);
  if (bounds.before) query.set('before', bounds.before);
  if (search.contentName.trim()) query.set('contentName',search.contentName.trim());
  if (search.userName.trim()) query.set('userName',search.userName.trim());
  return authenticatedEnvelopeRequest<AuditEntry[], { page: number; limit: number; hasMore: boolean; total: number }>(path(campusId), { signal }, query);
};
/** Carga el detalle y snapshots asociados a una entrada de auditoría. */
export const loadAuditEntry = (campusId: string, id: string, signal: AbortSignal) =>
  authenticatedRequest<AuditDetail>(path(campusId) + '/' + encodeURIComponent(id), { signal });

/** Todas las ediciones del mismo contenido, con sus responsables y fechas originales. */
export const loadAuditEdits = (campusId: string, auditId: string, page: number, signal: AbortSignal) =>
  authenticatedEnvelopeRequest<AuditEntry[], { page: number; limit: number; hasMore: boolean; total: number }>(
    path(campusId) + '/' + encodeURIComponent(auditId) + '/edits', { signal }, new URLSearchParams({ page: String(page), limit: '5' }));

/** La firma se solicita al abrir la sección; nunca se usan URLs del JSON histórico. */
export const loadAuditImage = (campusId: string, auditId: string, imageId: string, signal: AbortSignal) =>
  authenticatedRequest<{ url: string; expiresIn: number }>(path(campusId) + '/' + encodeURIComponent(auditId) + '/images/' + encodeURIComponent(imageId), { signal });

export const loadAuditParticipation = (campusId: string, auditId: string, page: number, signal: AbortSignal) =>
  authenticatedEnvelopeRequest<AuditParticipation, { page: number; limit: number; hasMore: boolean }>(
    path(campusId) + '/' + encodeURIComponent(auditId) + '/participation', { signal }, new URLSearchParams({ page: String(page), limit: '10' }));

export const loadAuditOccurrences = (campusId: string, auditId: string, page: number, signal: AbortSignal) =>
  authenticatedEnvelopeRequest<AuditOccurrences, { page: number; limit: number; hasMore: boolean }>(
    path(campusId) + '/' + encodeURIComponent(auditId) + '/occurrences', { signal }, new URLSearchParams({ page: String(page), limit: '5' }));
