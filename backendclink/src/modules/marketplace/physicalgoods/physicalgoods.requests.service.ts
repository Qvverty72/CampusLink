import type { PoolClient } from 'pg';
import { ApiError } from '../../../services/api-response.js';
import type { VerifiedAuthConnection } from '../../auth/auth.types.js';
import { requireCampusCapability } from '../../auth/auth.authorization.js';
import { lockPhysicalgoodsPublisher, withPhysicalgoodsTransaction } from './physicalgoods.repository.js';
import { findPhysicalgoodsMedia } from './physicalgoods.images.repository.js';
import { physicalgoodsId, parsePhysicalgoodsRequest, parsePhysicalgoodsDecision } from './physicalgoods.validation.js';
import type { PhysicalgoodsMediaRow, PhysicalgoodsRequestRow } from './physicalgoods.types.js';
import { findActivePhysicalgoodsRequest, findPhysicalgoodsRequestMessage, insertPhysicalgoodsRequest, physicalgoodsRequestMessages,
  findPhysicalgoodsRequest, updatePhysicalgoodsRequestStatus, listPhysicalgoodsRequests } from './physicalgoods.requests.repository.js';
import { hasActivePhysicalgoodsTransaction, insertPhysicalgoodsTransaction, setPhysicalgoodsPublicationStatus } from './physicalgoods.transactions.repository.js';
import { touchPhysicalgoods } from './physicalgoods.images.repository.js';
import { auditPhysicalgoods, physicalgoodsSnapshot } from './physicalgoods.history.repository.js';
import { createPaginatedResult, parsePaginationQuery } from '../../../services/pagination.js';

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
/** Vista operacional propia, independiente de la búsqueda estrictamente disponible. */
async function getPhysicalgoodsRequests(auth: VerifiedAuthConnection, query: unknown, received: boolean) {
  requireCampusCapability(auth,auth.campusId,'general');
  const pagination = parsePaginationQuery(query);
  if (!pagination.success || Object.keys(query as object).some(key => !['page','limit'].includes(key))) throw new ApiError(400,'VALIDATION_ERROR','Revisa la paginación de solicitudes.');
  try {
    const rows = await withPhysicalgoodsTransaction(client => listPhysicalgoodsRequests(client,auth.campusId,auth.userId,pagination.data,received));
    const result = createPaginatedResult(rows,pagination.data);
    return { ...result,data:result.data.map(row => ({ id:row.id,publication:{ id:row.publicacion_id,title:row.titulo,status:row.estado_publicacion,
      modality:row.modalidad,price:row.modalidad==='VENTA'?Number(row.precio):null },requester:{ id:row.solicitante_id,fullName:row.solicitante_nombre },
      message:row.mensaje,messageCode:row.codigo_mensaje,status:row.estado_solicitud,requestedAt:row.solicitada_en,
      transaction:row.transaccion_id ? { id:row.transaccion_id,status:row.estado_transaccion } : null })) };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503,'DEPENDENCY_UNAVAILABLE','No se pudieron consultar las solicitudes.');
  }
}
export const getReceivedPhysicalgoodsRequests = (auth: VerifiedAuthConnection, query: unknown) => getPhysicalgoodsRequests(auth,query,true);
export const getSentPhysicalgoodsRequests = (auth: VerifiedAuthConnection, query: unknown) => getPhysicalgoodsRequests(auth,query,false);
/** Publicación y solicitud se resuelven juntas; el lock evita reservar dos veces la misma unidad. */
export async function resolvePhysicalgoodsRequest(auth: VerifiedAuthConnection, publicationId: unknown, requestId: unknown, body: unknown) {
  const id = physicalgoodsId(publicationId,'publicationId'), selected = physicalgoodsId(requestId,'requestId'), decision = parsePhysicalgoodsDecision(body);
  return requestContext(auth,id,async (client,resource,current) => {
    if (resource.propietario_id !== current.userId) throw new ApiError(403,'FORBIDDEN','Solo el propietario puede resolver estas solicitudes.');
    const request = await findPhysicalgoodsRequest(client,id,selected);
    if (!request) throw new ApiError(404,'NOT_FOUND','La solicitud no pertenece a esta publicación.');
    if (request.estado_solicitud !== 'PENDIENTE') throw new ApiError(409,'CONFLICT','La solicitud ya fue resuelta. Actualiza las solicitudes recibidas.');
    if (decision === 'RECHAZAR') {
      await updatePhysicalgoodsRequestStatus(client,selected,'RECHAZADA');
      return { request:{ ...receipt(request,resource),status:'RECHAZADA' as const },transaction:null };
    }
    if (resource.estado_publicacion !== 'DISPONIBLE' || await hasActivePhysicalgoodsTransaction(client,id)) throw new ApiError(409,'CONFLICT','El recurso ya tiene una reserva o no está disponible.');
    if (request.solicitante_id === resource.propietario_id) throw new ApiError(409,'CONFLICT','El propietario no puede ser receptor de su propio recurso.');
    const before = await physicalgoodsSnapshot(client,id);
    const transaction = await insertPhysicalgoodsTransaction(client,id,selected,request.solicitante_id);
    await updatePhysicalgoodsRequestStatus(client,selected,'ACEPTADA');
    await setPhysicalgoodsPublicationStatus(client,id,'RESERVADO'); await touchPhysicalgoods(client,id);
    await auditPhysicalgoods(client,current,id,'EDITAR_PUBLICACION',before,await physicalgoodsSnapshot(client,id));
    return { request:{ ...receipt(request,resource),status:'ACEPTADA' as const },
      transaction:{ id:transaction.id,status:transaction.estado_transaccion,modality:transaction.modalidad_acordada,
        amount:transaction.monto_acordado===null?null:Number(transaction.monto_acordado),currency:transaction.moneda } };
  });
}
