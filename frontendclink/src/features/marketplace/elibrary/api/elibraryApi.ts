import { authenticatedEnvelopeRequest, authenticatedRequest, authenticatedResponseRequest } from '@/lib/api/authenticated-request';
import type { DigitalAcademicCatalog, DigitalAttachment, DigitalFile, DigitalInput, DigitalPublication } from '../types/publication';
import type { DigitalFilters, DigitalPage } from '../types/publication';

const base = '/api/v1/marketplace/elibrary';
export interface DigitalPreviewResult { available: boolean; text: string | null; page: number | null; message: string }
export const loadDigitalPreview = (id: string, fileId: string, signal?: AbortSignal) =>
  authenticatedRequest<DigitalPreviewResult>(`${base}/${id}/files/${fileId}/preview`, { signal });
export const loadDigitalAcademicCatalog = (signal?: AbortSignal) => authenticatedRequest<DigitalAcademicCatalog>(`${base}/academic-options`, { signal });
export const updateDigitalAcademics = (id: string, input: Pick<DigitalInput, 'careerIds' | 'subjectIds'> & { updatedAt: string }, signal?: AbortSignal) =>
  authenticatedRequest<DigitalPublication>(`${base}/${id}/academics`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal,
  });
export const loadDigitalPublications = (signal?: AbortSignal) => authenticatedRequest<DigitalPublication[]>(base, { signal });
export const loadAcquiredDigitalResources=(page:number,signal?:AbortSignal)=>authenticatedEnvelopeRequest<DigitalPublication[],DigitalPage>(`${base}/acquired`,{signal},new URLSearchParams({page:String(page),limit:'20'}));
export const loadAcquiredDigitalResource=(id:string,signal?:AbortSignal)=>authenticatedRequest<DigitalPublication>(`${base}/acquired/${id}`,{signal});
export const loadOwnedDigitalResources=(page:number,signal?:AbortSignal)=>authenticatedEnvelopeRequest<DigitalPublication[],DigitalPage>(`${base}/mine`,{signal},new URLSearchParams({page:String(page),limit:'20'}));
export const loadOwnedDigitalResource=(id:string,signal?:AbortSignal)=>authenticatedRequest<DigitalPublication>(`${base}/mine/${id}`,{signal});
export const editDigitalContent=(id:string,input:Pick<DigitalInput,'title'|'description'|'modality'|'price'>&{updatedAt:string},signal?:AbortSignal)=>authenticatedRequest<DigitalPublication>(`${base}/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal});
export const retireDigitalResource=(id:string,updatedAt:string,signal?:AbortSignal)=>authenticatedRequest<DigitalPublication>(`${base}/${id}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({updatedAt}),signal});
export function searchDigitalPublications(filters: DigitalFilters, page: number, signal?: AbortSignal) {
  const query = new URLSearchParams({ page: String(page), limit: '20' });
  for (const [key, value] of Object.entries(filters)) if (value.trim()) query.set(key, value.trim());
  return authenticatedEnvelopeRequest<DigitalPublication[], DigitalPage>(base, { signal }, query);
}
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
