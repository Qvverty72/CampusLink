import { authenticatedRequest, AuthApiError } from '@/lib/api/authenticated-request';
import type { PublicationCreated, PublicationInput, PublicationOptions } from '../types/publication';

const path = '/api/v1/marketplace/physicalgoods';
export const loadPublicationOptions = (signal: AbortSignal) => authenticatedRequest<PublicationOptions>(path + '/options', { signal });
export async function publishPhysicalgoods(input: PublicationInput, signal: AbortSignal) {
  try {
    return await authenticatedRequest<PublicationCreated>(path, { method: 'POST', signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 400) throw new Error(error.serverMessage || 'Revisa los datos de la publicación.');
    if (error instanceof AuthApiError && error.status === 413) throw new Error('La fotografía debe pesar como máximo 5 MB.');
    if (error instanceof AuthApiError && error.status === 409) throw new Error('Tu campus cambió. Recarga el formulario antes de publicar.');
    if (!(error instanceof AuthApiError) || error.status >= 500) throw new Error('No se pudo publicar el recurso. Revisa tu conexión e inténtalo nuevamente.');
    throw error;
  }
}
