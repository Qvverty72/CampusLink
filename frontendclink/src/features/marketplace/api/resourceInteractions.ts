import { authenticatedRequest, AuthApiError } from '@/lib/api/authenticated-request';
import { operationId } from '@/lib/api/operation-id';

/** Llamar solo tras abrir una ficha; reintenta una respuesta incierta con la misma clave. */
export async function recordResourceOpening(publicationId: string, openingId = operationId()): Promise<void> {
  const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operationId: openingId }) };
  const path = `/api/v1/analytics/resources/${publicationId}/views`;
  try { await authenticatedRequest(path, init); }
  catch (error) {
    if (error instanceof TypeError || (error instanceof AuthApiError && error.status === 503)) {
      try { await authenticatedRequest(path, init); } catch { /* La telemetría no bloquea la ficha. */ }
    }
  }
}
