import type { PoolClient } from 'pg';
import { ApiError } from '../../../services/api-response.js';
import { createPaginatedResult, parsePaginationQuery } from '../../../services/pagination.js';
import { requireCampusCapability } from '../../auth/auth.authorization.js';
import type { VerifiedAuthConnection } from '../../auth/auth.types.js';
import { lockPhysicalgoodsPublisher, PHYSICALGOODS_BUCKET, signPrincipalPhoto, withPhysicalgoodsTransaction } from './physicalgoods.repository.js';
import { findOwnPhysicalgoods, findPhysicalgoodsImages, listOwnPhysicalgoods } from './physicalgoods.images.repository.js';
import { physicalgoodsId } from './physicalgoods.validation.js';
import type { PhysicalgoodsOwnRow } from './physicalgoods.types.js';
import { findActivePhysicalgoodsTransaction } from './physicalgoods.transactions.repository.js';

/** Revalida cuenta y contexto vigente; cada consulta histórica debe filtrar propiedad o participación. */
export async function withPhysicalgoodsHistory<T>(auth:VerifiedAuthConnection,operation:(client:PoolClient,current:VerifiedAuthConnection)=>Promise<T>) {
  requireCampusCapability(auth,auth.campusId,'general');
  try {
    return await withPhysicalgoodsTransaction(async client=>{
      const {profile,roles}=await lockPhysicalgoodsPublisher(client,auth.userId);
      if(!profile||profile.campus_id!==auth.campusId||profile.institucion_id!==auth.profile.institucion_id)throw new ApiError(409,'CONFLICT','Tu contexto cambió. Actualiza el historial.');
      const current={...auth,profile,roles,campusId:profile.campus_id};
      requireCampusCapability(current,current.campusId,'general');
      return operation(client,current);
    });
  } catch(error) {
    if(error instanceof ApiError)throw error;
    throw new ApiError(503,'DEPENDENCY_UNAVAILABLE','No se pudo consultar el historial.');
  }
}
export function physicalgoodsHistoryPagination(query:unknown) {
  const result=parsePaginationQuery(query);
  if(!result.success||Object.keys(query as object).some(key=>!['page','limit'].includes(key)))throw new ApiError(400,'VALIDATION_ERROR','Revisa la paginación del historial.');
  return result.data;
}
function ownDto(row:PhysicalgoodsOwnRow,current:VerifiedAuthConnection) {
  return {id:row.id,title:row.titulo,status:row.estado_publicacion,isWithdrawn:!!row.deleted_at,
    campus:{id:row.campus_id,name:row.campus_nombre},category:{id:row.categoria_id,name:row.categoria_nombre},
    modality:row.modalidad,price:row.modalidad==='VENTA'?Number(row.precio):null,condition:row.estado_uso,publishedAt:row.publicado_en,
    canView:row.campus_id===current.campusId&&!row.deleted_at&&['DISPONIBLE','RESERVADO','FINALIZADO'].includes(row.estado_publicacion)};
}
export async function getOwnPhysicalgoods(auth:VerifiedAuthConnection,query:unknown) {
  const pagination=physicalgoodsHistoryPagination(query);
  return withPhysicalgoodsHistory(auth,async(client,current)=>{
    const result=createPaginatedResult(await listOwnPhysicalgoods(client,current.userId,pagination),pagination);
    return {...result,data:result.data.map(row=>ownDto(row,current))};
  });
}
export async function getOwnPhysicalgoodsDetail(auth:VerifiedAuthConnection,publicationId:unknown) {
  const id=physicalgoodsId(publicationId,'publicationId');
  const result=await withPhysicalgoodsHistory(auth,async(client,current)=>{
    const row=await findOwnPhysicalgoods(client,id,current.userId);
    if(!row)throw new ApiError(404,'NOT_FOUND','No se encontró una publicación propia.');
    return {row,dto:ownDto(row,current),images:await findPhysicalgoodsImages(client,id),
      activeTransaction:await findActivePhysicalgoodsTransaction(client,id,current.userId)};
  });
  try {
    const images=[];
    for(const image of result.images) {
      if(image.bucket_id!==PHYSICALGOODS_BUCKET||!image.storage_path.startsWith(result.row.campus_id+'/'))throw new Error('Invalid stored image');
      images.push({id:image.id,name:image.nombre_original,principal:image.orden===0,url:await signPrincipalPhoto(image.storage_path)});
    }
    return {...result.dto,description:result.row.descripcion,images,expiresIn:60,activeTransaction:result.activeTransaction};
  } catch {
    throw new ApiError(503,'DEPENDENCY_UNAVAILABLE','No se pudieron cargar las imágenes de la publicación.');
  }
}
