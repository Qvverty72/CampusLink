import { authenticatedRequest, authenticatedResponseRequest } from '@/lib/api/authenticated-request';
import type { DigitalAttachment, DigitalFile, DigitalInput, DigitalPublication } from '../types/publication';

const base = '/api/v1/marketplace/elibrary';
export const loadDigitalPublications = (signal?: AbortSignal) => authenticatedRequest<DigitalPublication[]>(base, { signal });
export function loadDigitalPublication(id: string, signal?: AbortSignal) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Publicación inválida.');
  return authenticatedRequest<DigitalPublication>(`${base}/${id}`, { signal });
}
export function publishDigitalPublication(input: DigitalInput, file: DigitalFile, signal?: AbortSignal) {
  const body = new FormData();
  body.append('metadata', JSON.stringify(input));
  body.append('file', file.webFile ?? { uri: file.uri, name: file.name, type: 'application/pdf' } as unknown as Blob, file.name);
  return authenticatedRequest<DigitalPublication>(base, { method: 'POST', body, signal });
}
export function attachDigitalFile(publicationId: string, file: DigitalFile, signal?: AbortSignal) {
  const body = new FormData();
  body.append('file', file.webFile ?? { uri: file.uri, name: file.name, type: 'application/pdf' } as unknown as Blob, file.name);
  return authenticatedRequest<DigitalAttachment>(`${base}/${publicationId}/files`, { method: 'POST', body, signal });
}
export async function downloadDigitalFile(publicationId: string, file: DigitalAttachment, signal?: AbortSignal) {
  const response = await authenticatedResponseRequest(`${base}/${publicationId}/files/${file.id}/download`, { signal });
  const blob = await response.blob();
  if (blob.size !== file.sizeBytes) throw new Error('La descarga no está completa. Inténtalo nuevamente.');
  return blob;
}
