import type { PoolClient } from 'pg';
import { withPostgresTransaction } from '../../../database/supabase/postgres.js';
import { ApiError } from '../../../services/api-response.js';
import { createPaginatedResult, parsePaginationQuery } from '../../../services/pagination.js';
import type { VerifiedAuthConnection } from '../../auth/auth.types.js';
import { authorizeDigitalAccess, currentDigitalContext } from './elibrary.service.js';
import { digitalId, invalidDigital } from './elibrary.validation.js';
import { findDigitalPublications, findDigitalResource, hasDigitalAcquisition, lockDigitalPersistence } from './elibrary.repository.js';
import type { DigitalRequestRow, DigitalResourceRow, DigitalTradeRow } from './elibrary.types.js';
import { activeDigitalRequest, confirmDigitalParticipant, digitalConfirmations, digitalMembersEnabled, digitalRequestMessages,
  digitalTradeParticipants, findDigitalRequest, findDigitalTrade, insertDigitalRequest, insertDigitalTrade, listDigitalRequests,
  lockDigitalProfiles, setDigitalRequestStatus, setDigitalTradeStatus } from './elibrary.trades.repository.js';
import { findDigitalRating } from './elibrary.rating.repository.js';
import { digitalParticipantNames } from './elibrary.activity.repository.js';
import { parseResourceOperationId, resourceOperationKey } from '../../analytics/analytics.service.js';
import { findResourceRequestOperation } from '../../analytics/analytics.repository.js';

export function digitalAction(raw: unknown, fields: string[] = []): Record<string,unknown> {
  if (!raw || typeof raw!=='object' || Array.isArray(raw) || Object.keys(raw).some(key=>!fields.includes(key))) return invalidDigital('body','La solicitud contiene campos no admitidos.');
  return raw as Record<string,unknown>;
}
const missing = () => new ApiError(404,'NOT_FOUND','No se encontró el recurso o acuerdo en tu institución.');
const conflict = (message: string) => new ApiError(409,'CONFLICT',message);
/** Perfiles ordenados → barrera de persistencia → publicación → solicitud/acuerdo. */
export async function withDigitalTradeContext<T>(auth: VerifiedAuthConnection, rawId: unknown,
  operation: (client: PoolClient, resource: DigitalResourceRow, current: VerifiedAuthConnection) => Promise<T>,
  ids: {requestId?:string;tradeId?:string} = {}) {
  authorizeDigitalAccess(auth); const id=digitalId(rawId);
  try { return await withPostgresTransaction(async client => {
    const participants=await digitalTradeParticipants(client,id,auth.profile.institucion_id,ids.requestId??null,ids.tradeId??null);
    if(!participants || (ids.tradeId && ![participants.ownerId,participants.receiverId].includes(auth.userId)))throw missing();
    if(ids.requestId && participants.ownerId!==auth.userId)throw new ApiError(403,'FORBIDDEN','Solo el propietario puede resolver solicitudes.');
    await lockDigitalProfiles(client,[...new Set([auth.userId,participants.ownerId,...(participants.receiverId?[participants.receiverId]:[])])].sort());
    const {current,campus}=await currentDigitalContext(client,auth); await lockDigitalPersistence(client,id);
    const resource=await findDigitalResource(client,id,campus.institucion_id);
    if(!resource)throw missing();if(resource.propietario_id!==participants.ownerId)throw conflict('La publicación cambió. Recarga el recurso.');
    return operation(client,resource,current);
  });} catch(error) {if(error instanceof ApiError)throw error;throw new ApiError(503,'DEPENDENCY_UNAVAILABLE','No se pudo confirmar la operación. Revisa su estado antes de reintentar.');}
}
function requestDto(row: DigitalRequestRow) {
  return {id:row.id,publicationId:row.publicacion_id,title:row.title,ownerId:row.ownerId,requesterId:row.solicitante_id,requesterName:row.requesterName,
    status:row.estado_solicitud,messageCode:row.codigo_mensaje,message:row.message,requestedAt:new Date(row.solicitada_en).toISOString(),
    transactionId:row.transactionId,transactionStatus:row.transactionStatus};
}
export async function digitalTradeDto(client: PoolClient, resource: DigitalResourceRow, current: VerifiedAuthConnection, trade: DigitalTradeRow) {
  if(![trade.propietario_id,trade.receptor_id].includes(current.userId))throw missing();
  const active=['RESERVADA','PENDIENTE_CONFIRMACION'].includes(trade.estado_transaccion), confirmations=await digitalConfirmations(client,trade.id);
  const rating=await findDigitalRating(client,trade.id);
  return {id:trade.id,publicationId:resource.id,campusId:resource.campus_id,title:resource.title,ownerId:trade.propietario_id,receiverId:trade.receptor_id,status:trade.estado_transaccion,
    modality:trade.modalidad_acordada,amount:trade.monto_acordado===null?null:Number(trade.monto_acordado),currency:trade.moneda,
    startedAt:new Date(trade.iniciada_en).toISOString(),completedAt:trade.completada_en?new Date(trade.completada_en).toISOString():null,
    cancelledAt:trade.cancelada_en?new Date(trade.cancelada_en).toISOString():null,
    rating:rating?{...rating,createdAt:new Date(rating.createdAt).toISOString()}:null,
    participants:await digitalParticipantNames(client,trade.propietario_id,trade.receptor_id),
    canRate:trade.estado_transaccion==='COMPLETADA'&&current.userId===trade.receptor_id&&current.userId!==trade.propietario_id&&!rating,
    confirmations:confirmations.map(row=>({...row,confirmedAt:new Date(row.confirmedAt).toISOString()})),
    canConfirm:active&&!confirmations.some(row=>row.userId===current.userId)&&await digitalMembersEnabled(client,[trade.propietario_id,trade.receptor_id],resource.institucion_id),canCancel:active};
}
async function available(client:PoolClient,resource:DigitalResourceRow) {
  if(resource.deleted_at||resource.estado_publicacion!=='DISPONIBLE'||!(await findDigitalPublications(client,resource.institucion_id,resource.id)).length)throw conflict('La publicación ya no recibe solicitudes.');
}
export async function getDigitalRequestOptions(auth:VerifiedAuthConnection,id:unknown) {
  return withDigitalTradeContext(auth,id,async(client,resource,current)=>{
    await available(client,resource);
    const active=await activeDigitalRequest(client,resource.id,current.userId), acquired=await hasDigitalAcquisition(client,resource.id,resource.propietario_id,current.userId);
    const canRequest=current.userId!==resource.propietario_id&&!active&&!acquired&&await digitalMembersEnabled(client,[current.userId,resource.propietario_id],resource.institucion_id);
    return {canRequest,acquired,activeRequestId:active?.id??null,messages:canRequest?await digitalRequestMessages(client):[]};
  });
}
export async function createDigitalRequest(auth:VerifiedAuthConnection,id:unknown,raw:unknown,rawOperationId?:unknown) {
  const {messageCode}=digitalAction(raw,['messageCode']);if(typeof messageCode!=='string'||!messageCode.trim()||messageCode.length>200)invalidDigital('messageCode','Selecciona un mensaje disponible.');
  const operationId=parseResourceOperationId(rawOperationId);
  const operationRequestId=operationId?resourceOperationKey('request',auth.userId,operationId):undefined;
  return withDigitalTradeContext(auth,id,async(client,resource,current)=>{
    if(operationRequestId){
      const previous=await findResourceRequestOperation(client,operationRequestId);
      if(previous){
        if(previous.publicacion_id!==resource.id||previous.solicitante_id!==current.userId||previous.codigo_mensaje!==messageCode)throw conflict('La clave de operación ya corresponde a otra solicitud.');
        return requestDto((await findDigitalRequest(client,resource.id,previous.id))!);
      }
    }
    await available(client,resource);if(current.userId===resource.propietario_id)throw new ApiError(403,'FORBIDDEN','No puedes solicitar tu propio recurso.');
    if(!await digitalMembersEnabled(client,[current.userId,resource.propietario_id],resource.institucion_id))throw conflict('Los participantes deben estar habilitados en la misma institución.');
    if(await activeDigitalRequest(client,resource.id,current.userId)||await hasDigitalAcquisition(client,resource.id,resource.propietario_id,current.userId))throw conflict('Ya tienes una solicitud activa o adquiriste este recurso.');
    if(!(await digitalRequestMessages(client)).some(row=>row.code===messageCode))invalidDigital('messageCode','Selecciona un mensaje disponible.');
    const selected=await insertDigitalRequest(client,resource.id,current.userId,messageCode as string,operationRequestId);
    return requestDto((await findDigitalRequest(client,resource.id,selected))!);
  });
}
export function digitalHistoryPage(raw: unknown) {
  digitalAction(raw,['page','limit']); const parsed=parsePaginationQuery(raw);
  if(!parsed.success)throw new ApiError(400,'VALIDATION_ERROR','Revisa la paginación.',{details:parsed.issues});return parsed.data;
}
export async function getDigitalRequests(auth:VerifiedAuthConnection,query:unknown,received:boolean) {
  authorizeDigitalAccess(auth); const page=digitalHistoryPage(query);
  try {return await withPostgresTransaction(async client=>{
    const {current,campus}=await currentDigitalContext(client,auth);
    const result=createPaginatedResult(await listDigitalRequests(client,campus.institucion_id,current.userId,received,page),page);
    return {...result,data:result.data.map(requestDto)};
  });}catch(error){if(error instanceof ApiError)throw error;throw new ApiError(503,'DEPENDENCY_UNAVAILABLE','No se pudieron cargar las solicitudes.');}
}
export async function resolveDigitalRequest(auth:VerifiedAuthConnection,id:unknown,rawRequest:unknown,raw:unknown) {
  const requestId=digitalId(rawRequest,'requestId'),{decision}=digitalAction(raw,['decision']);
  if(decision!=='ACEPTAR'&&decision!=='RECHAZAR')invalidDigital('decision','Elige aceptar o rechazar.');
  return withDigitalTradeContext(auth,id,async(client,resource,current)=>{
    const request=await findDigitalRequest(client,resource.id,requestId);if(!request)throw missing();
    if(request.estado_solicitud!=='PENDIENTE') {
      if((decision==='ACEPTAR'&&request.transactionId)||(decision==='RECHAZAR'&&request.estado_solicitud==='RECHAZADA'))return requestDto(request);
      throw conflict('La solicitud ya fue resuelta.');
    }
    if(decision==='ACEPTAR') {
      await available(client,resource);
      if(current.userId===request.solicitante_id||!await digitalMembersEnabled(client,[current.userId,request.solicitante_id],resource.institucion_id))throw conflict('El receptor ya no está habilitado en tu institución.');
      if(await hasDigitalAcquisition(client,resource.id,resource.propietario_id,request.solicitante_id))throw conflict('El receptor ya adquirió este recurso.');
      await insertDigitalTrade(client,resource.id,requestId,request.solicitante_id);
    }
    await setDigitalRequestStatus(client,requestId,decision==='ACEPTAR'?'ACEPTADA':'RECHAZADA');
    return requestDto((await findDigitalRequest(client,resource.id,requestId))!);
  },{requestId});
}
export async function getDigitalTrade(auth:VerifiedAuthConnection,id:unknown,rawTrade:unknown) {
  const tradeId=digitalId(rawTrade,'transactionId');
  return withDigitalTradeContext(auth,id,async(client,resource,current)=>{const trade=await findDigitalTrade(client,resource.id,tradeId);if(!trade)throw missing();return digitalTradeDto(client,resource,current,trade);},{tradeId});
}
export async function transitionDigitalTrade(auth:VerifiedAuthConnection,id:unknown,rawTrade:unknown,raw:unknown,action:'CONFIRMAR'|'CANCELAR') {
  digitalAction(raw); const tradeId=digitalId(rawTrade,'transactionId');
  return withDigitalTradeContext(auth,id,async(client,resource,current)=>{
    const trade=await findDigitalTrade(client,resource.id,tradeId);if(!trade)throw missing();
    if((action==='CONFIRMAR'&&trade.estado_transaccion==='COMPLETADA')||(action==='CANCELAR'&&trade.estado_transaccion==='CANCELADA'))return digitalTradeDto(client,resource,current,trade);
    if(!['RESERVADA','PENDIENTE_CONFIRMACION'].includes(trade.estado_transaccion))throw conflict('El acuerdo ya fue cerrado.');
    if(action==='CANCELAR')await setDigitalTradeStatus(client,trade,'CANCELADA',current.userId);
    else {
      if(!await digitalMembersEnabled(client,[trade.propietario_id,trade.receptor_id],resource.institucion_id))throw conflict('Los participantes deben seguir habilitados en la misma institución.');
      await confirmDigitalParticipant(client,tradeId,current.userId,current.userId===trade.propietario_id?'PROPIETARIO':'RECEPTOR');
      const confirmations=await digitalConfirmations(client,tradeId);
      const both=confirmations.some(row=>row.userId===trade.propietario_id&&row.role==='PROPIETARIO')&&confirmations.some(row=>row.userId===trade.receptor_id&&row.role==='RECEPTOR');
      await setDigitalTradeStatus(client,trade,both?'COMPLETADA':'PENDIENTE_CONFIRMACION',current.userId);
    }
    return digitalTradeDto(client,resource,current,(await findDigitalTrade(client,resource.id,tradeId))!);
  },{tradeId});
}
