import { withPostgresTransaction } from '../../../database/supabase/postgres.js';
import { ApiError } from '../../../services/api-response.js';
import type { VerifiedAuthConnection } from '../../auth/auth.types.js';
import { authorizeDigitalAccess, currentDigitalContext } from './elibrary.service.js';
import { downloadDigitalOriginal, findDigitalFile, findDigitalResource } from './elibrary.repository.js';
import { assertStoredDigitalFile } from './elibrary.files.service.js';
import { digitalId } from './elibrary.validation.js';
import { extractDigitalPreview } from './elibrary.preview.extractor.js';

export async function getDigitalPreview(auth: VerifiedAuthConnection, rawId: unknown, rawFileId: unknown) {
  authorizeDigitalAccess(auth); const id = digitalId(rawId), fileId = digitalId(rawFileId,'fileId');
  const check = () => withPostgresTransaction(async client => {
    const { campus } = await currentDigitalContext(client,auth);
    const resource = await findDigitalResource(client,id,campus.institucion_id);
    if (!resource || resource.deleted_at || resource.estado_publicacion !== 'DISPONIBLE') throw new ApiError(404,'NOT_FOUND','La publicación no está disponible.');
    const file = await findDigitalFile(client,id,fileId); assertStoredDigitalFile(resource,file); return file;
  });
  try {
    const file = await check(), bytes = await downloadDigitalOriginal(file), text = await extractDigitalPreview(bytes);
    const latest = await check();
    if (file.storage_path !== latest.storage_path || file.tamano_bytes !== latest.tamano_bytes) throw new ApiError(409,'CONFLICT','El archivo cambió. Recarga el detalle.');
    return text ? { available: true as const, text, page: 1, message: 'Fragmento limitado de la primera página.' }
      : { available: false as const, text: null, page: null, message: 'Este PDF no tiene una muestra textual segura disponible. Puedes consultar sus metadatos.' };
  } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(503,'DEPENDENCY_UNAVAILABLE','No se pudo cargar la vista previa.'); }
}
