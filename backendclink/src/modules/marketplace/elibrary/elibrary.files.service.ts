import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ApiError } from '../../../services/api-response.js';
import { withPostgresTransaction } from '../../../database/supabase/postgres.js';
import type { VerifiedAuthConnection } from '../../auth/auth.types.js';
import { requireResourceOwner } from '../../auth/auth.authorization.js';
import { authorizeDigitalAccess, currentDigitalContext } from './elibrary.service.js';
import { DIGITAL_MAX_BYTES, digitalId, validateDigitalFile } from './elibrary.validation.js';
import { DIGITAL_BUCKET, digitalFileHasReference, downloadDigitalOriginal, findDigitalFile, findDigitalResource,
  hasDigitalAcquisition, insertDigitalAttachment, lockDigitalPersistence, removeDigitalFile, uploadDigitalFile } from './elibrary.repository.js';
import type { DigitalAttachment, DigitalResourceRow, DigitalStoredFile, DigitalUpload } from './elibrary.types.js';

const unavailable = () => new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo completar la operación del archivo.');
const notFound = () => new ApiError(404, 'NOT_FOUND', 'El recurso o archivo no está disponible en tu institución.');
async function contextForFile(client: PoolClient, auth: VerifiedAuthConnection, id: string, writing = false) {
  const { current, campus } = await currentDigitalContext(client, auth);
  if (writing) await lockDigitalPersistence(client,id);
  const resource = await findDigitalResource(client, id, campus.institucion_id);
  if (!resource) throw notFound();
  return { current, resource };
}
function requireWritable(auth: VerifiedAuthConnection, resource: DigitalResourceRow) {
  requireResourceOwner(auth, resource.propietario_id);
  if (resource.deleted_at || resource.estado_publicacion !== 'DISPONIBLE') throw new ApiError(409, 'CONFLICT', 'Solo puedes adjuntar archivos a una publicación disponible.');
}
export async function addDigitalAttachment(auth: VerifiedAuthConnection, publicationId: unknown, upload?: DigitalUpload): Promise<DigitalAttachment> {
  authorizeDigitalAccess(auth); const id = digitalId(publicationId);
  let resource: DigitalResourceRow;
  try {
    resource = await withPostgresTransaction(async client => {
      const context = await contextForFile(client, auth, id); requireWritable(context.current, context.resource); return context.resource;
    });
  } catch (error) { if (error instanceof ApiError) throw error; throw unavailable(); }
  const file = await validateDigitalFile(upload), fileId = randomUUID();
  const path = `${resource.campus_id}/${resource.propietario_id}/${id}/${fileId}.pdf`;
  let persistenceAttempted = false, saved: DigitalAttachment | undefined;
  try {
    await uploadDigitalFile(path, file); persistenceAttempted = true;
    return await withPostgresTransaction(async client => {
      const context = await contextForFile(client, auth, id, true); requireWritable(context.current, context.resource);
      const result = await insertDigitalAttachment(client, id, fileId, path, file);
      if (!result) throw new ApiError(409, 'CONFLICT', 'La publicación alcanzó el límite de orden de archivos admitido por el sistema.');
      saved = result; return result;
    });
  } catch (error) {
    try {
      const referenced = persistenceAttempted && await digitalFileHasReference(id, path);
      if (referenced && saved) return saved;
      if (!referenced) await removeDigitalFile(path);
    } catch { console.error('Digital attachment reconciliation required', { publicationId: id, fileId }); }
    if (error instanceof ApiError) throw error; throw unavailable();
  }
}
async function authorizedFile(client: PoolClient, auth: VerifiedAuthConnection, id: string, fileId: string) {
  const { current, resource } = await contextForFile(client, auth, id);
  if (resource.propietario_id !== current.userId && !await hasDigitalAcquisition(client, id, resource.propietario_id, current.userId)) {
    throw new ApiError(403, 'FORBIDDEN', 'Solo el propietario o un receptor con adquisición completada puede descargar el archivo.');
  }
  const file = await findDigitalFile(client, id, fileId);
  assertStoredDigitalFile(resource, file);
  return file;
}
export function assertStoredDigitalFile(resource: DigitalResourceRow, file: DigitalStoredFile | null): asserts file is DigitalStoredFile {
  const prefix = `${resource.campus_id}/${resource.propietario_id}/${resource.id}/`;
  if (!file || file.bucket_id !== DIGITAL_BUCKET || !file.storage_path.startsWith(prefix)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i.test(file.storage_path.slice(prefix.length))
    || file.mime_type !== 'application/pdf' || Number(file.tamano_bytes) <= 0 || Number(file.tamano_bytes) > DIGITAL_MAX_BYTES) throw notFound();
}
export async function getDigitalOriginal(auth: VerifiedAuthConnection, publicationId: unknown, attachmentId: unknown) {
  authorizeDigitalAccess(auth); const id = digitalId(publicationId), fileId = digitalId(attachmentId, 'fileId');
  try {
    const file = await withPostgresTransaction(client => authorizedFile(client, auth, id, fileId));
    const bytes = await downloadDigitalOriginal(file);
    // Storage no mantiene bloqueos SQL: vuelve a comprobar cuenta/derecho antes de entregar los bytes.
    const current = await withPostgresTransaction(client => authorizedFile(client, auth, id, fileId));
    if (current.storage_path !== file.storage_path || current.tamano_bytes !== file.tamano_bytes) throw notFound();
    return { bytes, name: current.nombre_original };
  } catch (error) { if (error instanceof ApiError) throw error; throw unavailable(); }
}
