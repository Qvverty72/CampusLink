import { PHYSICALGOODS_BUCKET, signPrincipalPhoto } from '../../marketplace/physicalgoods/repositories/physicalgoods.repository.js';
import { auditSnapshot } from '../domain/audit.snapshot.js';
import type { AuditDetail } from '../types/access.types.js';

/** La identidad de la foto sale exclusivamente de los snapshots saneados del registro autorizado. */
export function auditContainsImage(entry: AuditDetail, imageId: string) {
  return [entry.datos_antes, entry.datos_despues].some(value => {
    const images = auditSnapshot(value)?.images;
    return Array.isArray(images) && images.some(image => typeof image.id === 'string' && image.id.toLowerCase() === imageId);
  });
}

export function isAuditImageFile(campusId: string, file: { bucket_id: string; storage_path: string; mime_type: string }) {
  return file.bucket_id === PHYSICALGOODS_BUCKET && file.storage_path.startsWith(campusId + '/')
    && !file.storage_path.split('/').includes('..') && !/[\\?#]/.test(file.storage_path)
    && ['image/jpeg', 'image/png', 'image/webp'].includes(file.mime_type);
}

// Reutiliza bucket privado y vencimiento de 60 s de la galería; nunca persiste URLs firmadas.
export const auditImageStorage = { sign: signPrincipalPhoto };
