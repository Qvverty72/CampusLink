import type { PoolClient } from 'pg';
import { assertMarketplaceRatingEligible } from '../marketplace.rating.js';
import { ApiError } from '../../../services/api-response.js';
import { createPaginatedResult,parsePaginationQuery } from '../../../services/pagination.js';
import { requireCampusCapability } from '../../auth/auth.authorization.js';
import type { VerifiedAuthConnection } from '../../auth/auth.types.js';
import { lockPhysicalgoodsPublisher, withPhysicalgoodsTransaction } from './physicalgoods.repository.js';
import { parsePhysicalgoodsCoordination,parsePhysicalgoodsEmptyAction,parsePhysicalgoodsRating,physicalgoodsId } from './physicalgoods.validation.js';
import { touchPhysicalgoods } from './physicalgoods.images.repository.js';
import { auditPhysicalgoods, physicalgoodsSnapshot } from './physicalgoods.history.repository.js';
import { closePendingPhysicalgoodsRequests, updatePhysicalgoodsRequestStatus } from './physicalgoods.requests.repository.js';
import { findPhysicalgoodsTransaction, insertPhysicalgoodsConfirmation, lockPhysicalgoodsTransactionResource,
  physicalgoodsConfirmations,setPhysicalgoodsPublicationStatus,updatePhysicalgoodsTransactionStatus,
  findPhysicalgoodsRating,insertPhysicalgoodsRating,listOwnPhysicalgoodsTransactions,countOwnPhysicalgoodsTransactions,physicalgoodsTransactionDetail,physicalgoodsCoordinationMessages,insertPhysicalgoodsCoordination } from './physicalgoods.transactions.repository.js';
import { physicalgoodsHistoryPagination, withPhysicalgoodsHistory } from './physicalgoods.history.service.js';
import type { PhysicalgoodsCoordinationRow,PhysicalgoodsRatingRow,PhysicalgoodsTransactionRow } from './physicalgoods.types.js';
import { findActiveMapByCampusId } from '../../maps/map.repository.js';
import { spatialBuildings } from '../../maps/map.location.js';
import {findPhysicalgoodsRequestTerms} from './physicalgoods.price-history.repository.js';

/** Revalida identidad y participación; solo detalle/mensajes habilitan lectura histórica de otro campus. */
async function transactionContext<T>(auth: VerifiedAuthConnection, publicationId: unknown, transactionId: unknown,
  operation:(client:PoolClient,resource:{id:string;estado_publicacion:string},transaction:PhysicalgoodsTransactionRow,current:VerifiedAuthConnection)=>Promise<T>,historical=false) {
  requireCampusCapability(auth,auth.campusId,'general');
  const id = physicalgoodsId(publicationId,'publicationId'), selected = physicalgoodsId(transactionId,'transactionId');
  try {
    return await withPhysicalgoodsTransaction(async client => {
      const { profile,roles } = await lockPhysicalgoodsPublisher(client,auth.userId);
      if (!profile || profile.campus_id !== auth.campusId || profile.institucion_id !== auth.profile.institucion_id) throw new ApiError(409,'CONFLICT','Tu contexto cambió. Recarga el acuerdo.');
      const current = { ...auth,profile,roles,campusId:profile.campus_id };
      requireCampusCapability(current,current.campusId,'general');
      const resource = await lockPhysicalgoodsTransactionResource(client,id,historical?null:current.campusId);
      if (!resource) throw new ApiError(404,'NOT_FOUND','No se encontró el acuerdo en tu campus.');
      const transaction = await findPhysicalgoodsTransaction(client,id,selected);
      if (!transaction || ![transaction.propietario_id,transaction.receptor_id].includes(current.userId)) throw new ApiError(404,'NOT_FOUND','No se encontró un acuerdo propio.');
      return operation(client,resource,transaction,current);
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503,'DEPENDENCY_UNAVAILABLE','No se pudo actualizar el acuerdo.');
  }
}
const inProgress = (row:PhysicalgoodsTransactionRow) => ['RESERVADA','PENDIENTE_CONFIRMACION'].includes(row.estado_transaccion);
const ratingDto=(row:PhysicalgoodsRatingRow)=>({id:row.id,score:row.puntuacion,createdAt:row.created_at});

/** Solo el receptor del acuerdo completado valora al propietario, una vez y sin modificar el acuerdo. */
export async function ratePhysicalgoodsOwner(auth:VerifiedAuthConnection,publicationId:unknown,transactionId:unknown,body:unknown) {
  const score=parsePhysicalgoodsRating(body);
  return transactionContext(auth,publicationId,transactionId,async(client,_resource,transaction,current)=>{
    assertMarketplaceRatingEligible(current.userId,transaction.propietario_id,transaction.receptor_id,transaction.estado_transaccion);
    if(await findPhysicalgoodsRating(client,transaction.id))throw new ApiError(409,'CONFLICT','Esta transacción ya tiene una valoración. No se puede editar.');
    return ratingDto(await insertPhysicalgoodsRating(client,transaction.id,current.userId,transaction.propietario_id,score));
  });
}

/** Conserva las transiciones atómicas implementadas en F2.4-07. */
export async function transitionPhysicalgoodsTransaction(auth: VerifiedAuthConnection, publicationId: unknown, transactionId: unknown, body: unknown, action:'CONFIRMAR'|'CANCELAR') {
  parsePhysicalgoodsEmptyAction(body);
  return transactionContext(auth,publicationId,transactionId,async(client,resource,transaction,current)=>{
    const id=resource.id,selected=transaction.id,confirmations=await physicalgoodsConfirmations(client,selected);
    if (action==='CONFIRMAR'&&transaction.estado_transaccion==='COMPLETADA') return {id:selected,status:transaction.estado_transaccion};
    if (action==='CANCELAR'&&transaction.estado_transaccion==='CANCELADA') return {id:selected,status:transaction.estado_transaccion};
    if (!inProgress(transaction)) throw new ApiError(409,'CONFLICT','El acuerdo ya fue cerrado.');
    const before=await physicalgoodsSnapshot(client,id);
    let status:'PENDIENTE_CONFIRMACION'|'COMPLETADA'|'CANCELADA';
    if (action==='CANCELAR') {
      status='CANCELADA';await updatePhysicalgoodsRequestStatus(client,transaction.solicitud_id,'CANCELADA');
    } else {
      const role=transaction.propietario_id===current.userId?'PROPIETARIO':'RECEPTOR';
      if (!confirmations.some(row=>row.usuario_id===current.userId&&row.rol_confirmante===role)) {
        confirmations.push(await insertPhysicalgoodsConfirmation(client,selected,current.userId,role));
      }
      const both=confirmations.some(row=>row.usuario_id===transaction.propietario_id&&row.rol_confirmante==='PROPIETARIO')
        &&confirmations.some(row=>row.usuario_id===transaction.receptor_id&&row.rol_confirmante==='RECEPTOR');
      status=both?'COMPLETADA':'PENDIENTE_CONFIRMACION';
      if(both)await closePendingPhysicalgoodsRequests(client,id);
    }
    await updatePhysicalgoodsTransactionStatus(client,selected,status,current.userId);
    // Cerrar el acuerdo no reactiva publicaciones retiradas ni sobrescribe estados de moderación.
    if(status!=='PENDIENTE_CONFIRMACION'&&resource.estado_publicacion==='RESERVADO') {
      await setPhysicalgoodsPublicationStatus(client,id,status==='COMPLETADA'?'FINALIZADO':'DISPONIBLE');await touchPhysicalgoods(client,id);
      await auditPhysicalgoods(client,current,id,'EDITAR_PUBLICACION',before,await physicalgoodsSnapshot(client,id));
    }
    return {id:selected,status};
  });
}
export async function getPhysicalgoodsTransaction(auth:VerifiedAuthConnection,publicationId:unknown,transactionId:unknown) {
  return transactionContext(auth,publicationId,transactionId,async(client,_resource,transaction,current)=>{
    const row=await physicalgoodsTransactionDetail(client,transaction.id),confirmations=await physicalgoodsConfirmations(client,transaction.id);
    const rating=await findPhysicalgoodsRating(client,transaction.id);
    const requestedTerms=(await findPhysicalgoodsRequestTerms(client,[transaction.solicitud_id])).get(transaction.solicitud_id)??null;
    return {id:row.id,requestedTerms,publication:{id:row.publicacion_id,title:row.titulo,status:row.estado_publicacion,isWithdrawn:!!row.deleted_at},
      campus:{id:row.campus_id,name:row.campus_nombre},owner:{id:row.propietario_id,fullName:row.propietario_nombre},
      receiver:{id:row.receptor_id,fullName:row.receptor_nombre},role:row.propietario_id===current.userId?'PROPIETARIO' as const:'RECEPTOR' as const,
      status:row.estado_transaccion,modality:row.modalidad_acordada,amount:row.monto_acordado===null?null:Number(row.monto_acordado),currency:row.moneda,
      startedAt:row.iniciada_en,completedAt:row.completada_en,cancelledAt:row.cancelada_en,cancelledById:row.cancelada_por_id,
      confirmations:confirmations.map(value=>({userId:value.usuario_id,role:value.rol_confirmante,confirmedAt:value.confirmado_en})),
      canConfirm:row.campus_id===current.campusId&&inProgress(row)&&!confirmations.some(value=>value.usuario_id===current.userId),
      canCancel:row.campus_id===current.campusId&&inProgress(row),rating:rating?ratingDto(rating):null,
      canRate:row.campus_id===current.campusId&&row.estado_transaccion==='COMPLETADA'&&row.receptor_id===current.userId&&row.propietario_id!==current.userId&&!rating};
  },true);
}
export async function getOwnPhysicalgoodsTransactions(auth:VerifiedAuthConnection,query:unknown) {
  if(!query||typeof query!=='object'||Array.isArray(query))throw new ApiError(400,'VALIDATION_ERROR','Revisa la paginación del historial.');
  const {tab,...paging}=query as Record<string,unknown>;
  if(tab!==undefined&&tab!=='active'&&tab!=='finished')throw new ApiError(400,'VALIDATION_ERROR','Selecciona una pestaña de transacciones válida.');
  const pagination=physicalgoodsHistoryPagination(paging);
  return withPhysicalgoodsHistory(auth,async(client,current)=>{
    const result=createPaginatedResult(await listOwnPhysicalgoodsTransactions(client,current.userId,pagination,tab),pagination);
    const counts=tab?await countOwnPhysicalgoodsTransactions(client,current.userId):undefined;
    const meta=counts&&tab?{...result.meta,total:counts[tab],totalPages:Math.max(1,Math.ceil(counts[tab]/pagination.limit)),counts}:result.meta;
    return {...result,meta,data:result.data.map(row=>({id:row.id,publication:{id:row.publicacion_id,title:row.titulo,status:row.estado_publicacion,isWithdrawn:!!row.deleted_at},
      campus:{id:row.campus_id,name:row.campus_nombre},role:row.propietario_id===current.userId?'PROPIETARIO' as const:'RECEPTOR' as const,
      status:row.estado_transaccion,modality:row.modalidad_acordada,amount:row.monto_acordado===null?null:Number(row.monto_acordado),currency:row.moneda,startedAt:row.iniciada_en}))};
  });
}
async function coordinationBuildings(campusId:string) {
  try {
  const map=await findActiveMapByCampusId(campusId);
  if(!map)return [];
  if(map.campusId!==campusId||map.status!=='ACTIVE')throw new Error('Invalid active map context');
  const buildings=spatialBuildings(map);
  return buildings.filter(building=>building.name.trim()&&building.name.length<=200&&/^[a-zA-Z0-9_-]{1,120}$/.test(building.id)
    &&buildings.filter(value=>value.id===building.id).length===1).map(building=>({id:building.id,name:building.name,
      floors:building.floors.filter(floor=>floor.name.trim()&&floor.name.length<=200&&/^[a-zA-Z0-9_-]{1,120}$/.test(floor.id)
        &&building.floors.filter(value=>value.id===floor.id).length===1).map(floor=>({id:floor.id,name:floor.name,
          pois:floor.pois.filter(poi=>poi.name.trim()&&poi.name.length<=200&&/^[a-zA-Z0-9_-]{1,120}$/.test(poi.poiKey)
            &&floor.pois.filter(value=>value.poiKey===poi.poiKey).length===1).map(poi=>({id:poi.poiKey,name:poi.name}))}))})).filter(building=>building.floors.length);
  } catch {
    throw new ApiError(503,'DEPENDENCY_UNAVAILABLE','No se pudieron cargar las ubicaciones del campus.');
  }
}
export async function getPhysicalgoodsCoordinationOptions(auth:VerifiedAuthConnection,publicationId:unknown,transactionId:unknown) {
  const campusId=await transactionContext(auth,publicationId,transactionId,async(_client,_resource,transaction,current)=>inProgress(transaction)?current.campusId:null);
  return {buildings:campusId?await coordinationBuildings(campusId):[]};
}
function coordinationDto(row:PhysicalgoodsCoordinationRow,transaction:PhysicalgoodsTransactionRow) {
  return {id:row.id,senderId:row.destinatario_id===transaction.propietario_id?transaction.receptor_id:transaction.propietario_id,
    recipientId:row.destinatario_id,text:row.mensaje,createdAt:row.created_at};
}
export async function getPhysicalgoodsCoordinationMessages(auth:VerifiedAuthConnection,publicationId:unknown,transactionId:unknown,query:unknown) {
  const pagination=parsePaginationQuery(query);
  if(!pagination.success||Object.keys(query as object).some(key=>!['page','limit'].includes(key)))throw new ApiError(400,'VALIDATION_ERROR','Revisa la paginación de mensajes.');
  return transactionContext(auth,publicationId,transactionId,async(client,resource,transaction)=>{
    const rows=await physicalgoodsCoordinationMessages(client,resource.id,transaction.id,[transaction.propietario_id,transaction.receptor_id],pagination.data);
    const result=createPaginatedResult(rows,pagination.data);
    return {...result,data:result.data.map(row=>coordinationDto(row,transaction))};
  },true);
}
/** El cliente solo selecciona ubicaciones; destinatario, texto y fecha proceden del servidor. */
export async function sendPhysicalgoodsCoordination(auth:VerifiedAuthConnection,publicationId:unknown,transactionId:unknown,body:unknown) {
  const location=parsePhysicalgoodsCoordination(body);
  // Mongo se consulta sin mantener locks SQL; antes de guardar se revalidan actor, campus y acuerdo.
  const campusId=await transactionContext(auth,publicationId,transactionId,async(_client,_resource,transaction,current)=>{
    if(!inProgress(transaction))throw new ApiError(409,'CONFLICT','El acuerdo ya fue cerrado.');
    return current.campusId;
  });
  const buildings=await coordinationBuildings(campusId),building=buildings.find(value=>value.id===location.buildingId);
  const floor=building?.floors.find(value=>value.id===location.floorId);
  if(!building||!floor)throw new ApiError(400,'VALIDATION_ERROR','El edificio o piso ya no está disponible. Actualiza las ubicaciones.');
  const poi=location.poiKey?floor.pois.find(value=>value.id===location.poiKey):undefined;
  if(location.poiKey&&!poi)throw new ApiError(400,'VALIDATION_ERROR','El punto de interés ya no está disponible en ese piso. Actualiza las ubicaciones.');
  return transactionContext(auth,publicationId,transactionId,async(client,resource,transaction,current)=>{
    if(!inProgress(transaction))throw new ApiError(409,'CONFLICT','El acuerdo ya fue cerrado.');
    const recipient=current.userId===transaction.propietario_id?transaction.receptor_id:transaction.propietario_id;
    const message=await insertPhysicalgoodsCoordination(client,resource.id,transaction.id,recipient,`Estoy en ${building.name}, en ${floor.name}${poi?`, en ${poi.name}`:''}.`);
    return coordinationDto(message,transaction);
  });
}
