import { authenticatedRequest } from '@/lib/api/authenticated-request';
import type { DigitalFile, DigitalInput, DigitalPublication } from '../types/publication';

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
