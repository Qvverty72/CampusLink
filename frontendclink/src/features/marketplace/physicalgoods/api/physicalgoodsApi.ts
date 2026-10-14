import { authenticatedEnvelopeRequest, authenticatedRequest, AuthApiError } from '@/lib/api/authenticated-request';
import type { PublicationCreated, PublicationInput, PublicationOptions } from '../types/publication';
import type { PhysicalgoodsGallery, PhysicalgoodsPage, PhysicalgoodsResource, PublicationPhoto } from '../types/publication';

const path = '/api/v1/marketplace/physicalgoods';
const resourcePath = (id: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Publicación inválida.');
  return path + '/' + id;
};
export function loadPhysicalgoodsResources(categoryId: string, mine: boolean, page: number, signal: AbortSignal): Promise<PhysicalgoodsPage> {
  const query = new URLSearchParams({ page: String(page), limit: '10' });
  if (categoryId) query.set('categoryId', categoryId);
  if (mine) query.set('mine', 'true');
  return authenticatedEnvelopeRequest<PhysicalgoodsResource[], PhysicalgoodsPage['meta']>(path, { signal }, query);
}
export const loadPhysicalgoodsGallery = (id: string, signal: AbortSignal) => authenticatedRequest<PhysicalgoodsGallery>(resourcePath(id) + '/images', { signal });
export const addPhysicalgoodsPhoto = (id: string, photo: PublicationPhoto, signal: AbortSignal) => authenticatedRequest<{ id: string }>(resourcePath(id) + '/images', {
  method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo: { name: photo.name, mimeType: photo.mimeType, base64: photo.base64 } }),
});
export const choosePhysicalgoodsPrincipal = (id: string, imageId: string, signal: AbortSignal) => authenticatedRequest(resourcePath(id) + '/images/' + imageId + '/principal', { method: 'PATCH', signal });
export const retirePhysicalgoodsPhoto = (id: string, imageId: string, signal: AbortSignal) => authenticatedRequest(resourcePath(id) + '/images/' + imageId, { method: 'DELETE', signal });
export const savePhysicalgoodsCategory = (id: string, categoryId: string, signal: AbortSignal) => authenticatedRequest(resourcePath(id) + '/category', {
  method: 'PATCH', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categoryId }),
});
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
