import type { PoolClient } from 'pg';
import { ApiError } from '../../../services/api-response.js';
import type { VerifiedAuthConnection } from '../../auth/auth.types.js';
import { requireCampusCapability } from '../../auth/auth.authorization.js';
import { lockPhysicalgoodsPublisher, withPhysicalgoodsTransaction } from './physicalgoods.repository.js';
import { findPhysicalgoodsMedia } from './physicalgoods.images.repository.js';
import { physicalgoodsId, parsePhysicalgoodsRequest } from './physicalgoods.validation.js';
import type { PhysicalgoodsMediaRow, PhysicalgoodsRequestRow } from './physicalgoods.types.js';
import { findActivePhysicalgoodsRequest, findPhysicalgoodsRequestMessage, insertPhysicalgoodsRequest, physicalgoodsRequestMessages } from './physicalgoods.requests.repository.js';

/** Reutiliza el orden de bloqueos de edición: perfil primero, publicación después. */
async function requestContext<T>(auth: VerifiedAuthConnection, id: string,
  operation: (client: PoolClient, resource: PhysicalgoodsMediaRow, current: VerifiedAuthConnection) => Promise<T>) {
  requireCampusCapability(auth,auth.campusId,'general');
  try {
    return await withPhysicalgoodsTransaction(async client => {
      const { profile,roles } = await lockPhysicalgoodsPublisher(client,auth.userId);
      if (!profile || profile.campus_id !== auth.campusId || profile.institucion_id !== auth.profile.institucion_id) throw new ApiError(409,'CONFLICT','Tu contexto cambió. Recarga el recurso.');
      const current = { ...auth,profile,roles,campusId:profile.campus_id };
      requireCampusCapability(current,current.campusId,'general');
      const resource = await findPhysicalgoodsMedia(client,id,current.campusId,true);
      if (!resource) throw new ApiError(404,'NOT_FOUND','La publicación no está disponible en tu campus.');
      return operation(client,resource,current);
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503,'DEPENDENCY_UNAVAILABLE','No se pudo completar la solicitud.');
  }
}
function receipt(row: PhysicalgoodsRequestRow, resource: PhysicalgoodsMediaRow) {
  return { id:row.id,publicationId:row.publicacion_id,requesterId:row.solicitante_id,ownerId:resource.propietario_id,
    campusId:resource.campus_id,messageCode:row.codigo_mensaje,status:row.estado_solicitud,requestedAt:row.solicitada_en };
}
export async function getPhysicalgoodsRequestOptions(auth: VerifiedAuthConnection, publicationId: unknown) {
  const id = physicalgoodsId(publicationId,'publicationId');
  return requestContext(auth,id,async (client,resource,current) => {
    const active = await findActivePhysicalgoodsRequest(client,id,current.userId);
    const canRequest = resource.estado_publicacion === 'DISPONIBLE' && resource.propietario_id !== current.userId && !active;
    return { canRequest,activeRequest:active ? receipt(active,resource) : null,
      messages:canRequest ? await physicalgoodsRequestMessages(client) : [] };
  });
}
/** Comprueba disponibilidad y duplicados dentro del mismo lock antes de insertar; solicitar no reserva la unidad. */
export async function createPhysicalgoodsRequest(auth: VerifiedAuthConnection, publicationId: unknown, body: unknown) {
  const id = physicalgoodsId(publicationId,'publicationId'), code = parsePhysicalgoodsRequest(body);
  return requestContext(auth,id,async (client,resource,current) => {
    if (resource.propietario_id === current.userId) throw new ApiError(403,'FORBIDDEN','No puedes solicitar tu propio recurso.');
    if (resource.estado_publicacion !== 'DISPONIBLE') throw new ApiError(409,'CONFLICT','El recurso ya no está disponible para recibir solicitudes.');
    if (await findActivePhysicalgoodsRequest(client,id,current.userId)) throw new ApiError(409,'CONFLICT','Ya tienes una solicitud activa para este recurso.');
    const message = await findPhysicalgoodsRequestMessage(client,code);
    if (!message?.activo) throw new ApiError(400,'VALIDATION_ERROR','Selecciona un mensaje predefinido disponible.');
    return receipt(await insertPhysicalgoodsRequest(client,id,current.userId,code),resource);
  });
}
