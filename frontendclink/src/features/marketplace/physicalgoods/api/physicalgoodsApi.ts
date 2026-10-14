import { authenticatedEnvelopeRequest, authenticatedRequest, AuthApiError } from '@/lib/api/authenticated-request';
import type { PublicationCreated, PublicationInput, PublicationOptions } from '../types/publication';
import type { PhysicalgoodsGallery, PhysicalgoodsPage, PhysicalgoodsResource, PhysicalgoodsSearchFilters, PublicationPhoto } from '../types/publication';
import type { PhysicalgoodsRequest, PhysicalgoodsRequestOptions } from '../types/publication';
import type { PhysicalgoodsReceivedPage, PhysicalgoodsReceivedRequest } from '../types/publication';

const path = '/api/v1/marketplace/physicalgoods';
/** Valida el UUID antes de incorporarlo a una ruta de publicación. */
const resourcePath = (id: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Publicación inválida.');
  return path + '/' + id;
};
/** Construye filtros de búsqueda y consulta una página del campus autorizado. */
export function loadPhysicalgoodsResources(filters: PhysicalgoodsSearchFilters, page: number, signal: AbortSignal): Promise<PhysicalgoodsPage> {
  const query = new URLSearchParams({ page: String(page), limit: '10' });
  for (const key of ['q', 'categoryId', 'modality', 'condition', 'careerId', 'subjectId', 'minPrice', 'maxPrice'] as const) {
    const value = filters[key].trim();
    if (value) query.set(key, ['minPrice', 'maxPrice'].includes(key) ? value.replace(',', '.') : value);
  }
  if (filters.mine) query.set('mine', 'true');
  return authenticatedEnvelopeRequest<PhysicalgoodsResource[], PhysicalgoodsPage['meta']>(path, { signal }, query);
}
/** Carga la galería y los permisos de edición calculados por el backend. */
export const loadPhysicalgoodsGallery = (id: string, signal: AbortSignal) => authenticatedRequest<PhysicalgoodsGallery>(resourcePath(id) + '/images', { signal });
export const loadPhysicalgoodsRequestOptions = (id: string, signal: AbortSignal) => authenticatedRequest<PhysicalgoodsRequestOptions>(resourcePath(id) + '/request-options',{ signal });
export const requestPhysicalgoods = (id: string, messageCode: string, signal: AbortSignal) => authenticatedRequest<PhysicalgoodsRequest>(resourcePath(id) + '/requests',{
  method:'POST',signal,headers:{ 'Content-Type':'application/json' },body:JSON.stringify({ messageCode }),
});
export const loadPhysicalgoodsRequests = (page:number,received:boolean,signal:AbortSignal) => authenticatedEnvelopeRequest<PhysicalgoodsReceivedRequest[],PhysicalgoodsReceivedPage['meta']>(
  path+(received?'/received-requests':'/sent-requests'),{signal},new URLSearchParams({page:String(page),limit:'10'}));
export const resolvePhysicalgoodsRequest = (id:string,requestId:string,decision:'ACEPTAR'|'RECHAZAR',signal:AbortSignal) => {
  resourcePath(requestId);
  return authenticatedRequest(resourcePath(id)+'/requests/'+requestId,{method:'PATCH',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({decision})});
};
/** Edita campos de publicación con `updatedAt` para detectar escrituras concurrentes. */
export const updatePhysicalgoods = (id: string, input: Pick<PublicationInput,'title'|'description'|'condition'|'modality'|'price'> & { updatedAt: string }, signal: AbortSignal) => authenticatedRequest(resourcePath(id), {
  method: 'PATCH', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
});
/** Solicita la baja lógica de la publicación con su versión temporal vigente. */
export const withdrawPhysicalgoods = (id: string, updatedAt: string, signal: AbortSignal) => authenticatedRequest(resourcePath(id), {
  method: 'DELETE', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updatedAt }),
});
/** Envía una fotografía adicional codificada; el backend valida y persiste el recurso. */
export const addPhysicalgoodsPhoto = (id: string, photo: PublicationPhoto, signal: AbortSignal) => authenticatedRequest<{ id: string }>(resourcePath(id) + '/images', {
  method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo: { name: photo.name, mimeType: photo.mimeType, base64: photo.base64 } }),
});
/** Cambia la imagen principal de la publicación. */
export const choosePhysicalgoodsPrincipal = (id: string, imageId: string, signal: AbortSignal) => authenticatedRequest(resourcePath(id) + '/images/' + imageId + '/principal', { method: 'PATCH', signal });
/** Retira una imagen de la galería mediante el endpoint autorizado. */
export const retirePhysicalgoodsPhoto = (id: string, imageId: string, signal: AbortSignal) => authenticatedRequest(resourcePath(id) + '/images/' + imageId, { method: 'DELETE', signal });
/** Asigna la categoría seleccionada a una publicación. */
export const savePhysicalgoodsCategory = (id: string, categoryId: string, signal: AbortSignal) => authenticatedRequest(resourcePath(id) + '/category', {
  method: 'PATCH', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categoryId }),
});
/** Carga campus y catálogos permitidos para publicación y filtros. */
export const loadPublicationOptions = (signal: AbortSignal) => authenticatedRequest<PublicationOptions>(path + '/options', { signal });
/** Publica el recurso principal y transforma errores de validación conocidos en mensajes de UI. */
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
