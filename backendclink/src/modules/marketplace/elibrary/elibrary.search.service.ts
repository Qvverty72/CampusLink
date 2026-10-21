import { ApiError } from '../../../services/api-response.js';
import { createPaginatedResult, parsePaginationQuery } from '../../../services/pagination.js';
import { withPostgresTransaction } from '../../../database/supabase/postgres.js';
import type { PaginationParams } from '../../../types/api.js';
import type { VerifiedAuthConnection } from '../../auth/auth.types.js';
import { authorizeDigitalAccess, currentDigitalContext } from './elibrary.service.js';
import { digitalId, invalidDigital } from './elibrary.validation.js';
import { findDigitalPublications } from './elibrary.repository.js';

export interface DigitalSearch extends PaginationParams { q: string; careerId: string | null; subjectId: string | null; modality: string | null }
export function parseDigitalSearch(raw: unknown): DigitalSearch {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalidDigital('query', 'Revisa los filtros.');
  const query = raw as Record<string, unknown>;
  if (Object.keys(query).some(key => !['q','careerId','subjectId','modality','page','limit'].includes(key))) return invalidDigital('query', 'La búsqueda contiene filtros no admitidos.');
  const pagination = parsePaginationQuery(query);
  if (!pagination.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Revisa la paginación.', { details: pagination.issues });
  if (query.q !== undefined && (typeof query.q !== 'string' || query.q.length > 200 || /[\u0000-\u001f\u007f]/.test(query.q))) return invalidDigital('q', 'Busca con un texto de hasta 200 caracteres.');
  if (query.modality !== undefined && query.modality !== 'VENTA' && query.modality !== 'DONACION') return invalidDigital('modality', 'Elige venta o donación.');
  return { ...pagination.data, q: typeof query.q === 'string' ? query.q.trim() : '',
    careerId: query.careerId === undefined ? null : digitalId(query.careerId, 'careerIds'),
    subjectId: query.subjectId === undefined ? null : digitalId(query.subjectId, 'subjectIds'), modality: query.modality as string ?? null };
}
export async function searchDigitalPublications(auth: VerifiedAuthConnection, query: unknown) {
  authorizeDigitalAccess(auth); const filters = parseDigitalSearch(query);
  try {
    return await withPostgresTransaction(async client => {
      const { campus } = await currentDigitalContext(client, auth);
      return createPaginatedResult(await findDigitalPublications(client, campus.institucion_id, null, filters), filters);
    });
  } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(503,'DEPENDENCY_UNAVAILABLE','No se pudo consultar la biblioteca.'); }
}
