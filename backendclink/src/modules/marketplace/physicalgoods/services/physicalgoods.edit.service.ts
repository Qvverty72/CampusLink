import { ApiError } from '../../../../shared/errors/api-error.js';
import type { VerifiedAuthConnection } from '../../../auth/types/auth.types.js';
import { editPhysicalgoods } from './physicalgoods.images.service.js';
import { physicalgoodsId, parsePhysicalgoodsUpdate, parsePhysicalgoodsVersion } from '../validators/physicalgoods.validation.js';
import { touchPhysicalgoods } from '../repositories/physicalgoods.images.repository.js';
import { updatePhysicalgoodsContent, retirePhysicalgoods } from '../repositories/physicalgoods.repository.js';

async function dependency<T>(operation: () => Promise<T>) {
  try { return await operation(); } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo guardar la publicación.');
  }
}
/** Actualiza contenido solo para el propietario y solo si coincide la versión leída por el cliente. */
export async function updatePhysicalgoods(auth: VerifiedAuthConnection, publicationId: unknown, body: unknown) {
  const id = physicalgoodsId(publicationId, 'publicationId'), input = parsePhysicalgoodsUpdate(body);
  return dependency(() => editPhysicalgoods(auth, id, async (client, row) => {
    if (row.updated_at !== input.updatedAt) throw new ApiError(409, 'CONFLICT', 'La publicación cambió. Recarga el detalle antes de guardar.');
    if (row.titulo !== input.title || row.descripcion !== input.description || row.estado_uso !== input.condition
      || row.modalidad !== input.modality || (row.precio === null ? null : Number(row.precio)) !== input.price) {
      await updatePhysicalgoodsContent(client, id, input); await touchPhysicalgoods(client, id);
    }
    return { id };
  }, true));
}
/** Retira lógicamente una publicación del propietario usando control de versión optimista. */
export async function withdrawPhysicalgoods(auth: VerifiedAuthConnection, publicationId: unknown, body: unknown) {
  const id = physicalgoodsId(publicationId, 'publicationId'), { updatedAt } = parsePhysicalgoodsVersion(body);
  return dependency(() => editPhysicalgoods(auth, id, async (client, row) => {
    if (row.updated_at !== updatedAt) throw new ApiError(409, 'CONFLICT', 'La publicación cambió. Recarga el detalle antes de retirarla.');
    await retirePhysicalgoods(client, id); await touchPhysicalgoods(client, id);
    return { id };
  }, true));
}
