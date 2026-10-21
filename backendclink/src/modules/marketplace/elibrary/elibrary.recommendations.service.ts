import { withPostgresTransaction } from '../../../database/supabase/postgres.js';
import { ApiError } from '../../../services/api-response.js';
import { createPaginatedResult } from '../../../services/pagination.js';
import type { VerifiedAuthConnection } from '../../auth/auth.types.js';
import { authorizeDigitalAccess,currentDigitalContext } from './elibrary.service.js';
import { digitalHistoryPage } from './elibrary.trades.service.js';
import { digitalId } from './elibrary.validation.js';
import { findDigitalPublications } from './elibrary.repository.js';
import { rankDigitalRecommendations } from './elibrary.recommendations.repository.js';
import { recordResourceView } from '../../analytics/analytics.repository.js';
export const DIGITAL_RECOMMENDATION_WEIGHTS=Object.freeze({career:30,subject:20,view:5,request:10,activity:1});
export async function getDigitalRecommendations(auth:VerifiedAuthConnection,raw:unknown) {
  authorizeDigitalAccess(auth);const page=digitalHistoryPage(raw);
  try{return await withPostgresTransaction(async client=>{
    const {current,campus}=await currentDigitalContext(client,auth);
    const ranks=await rankDigitalRecommendations(client,campus.institucion_id,current.userId,page,DIGITAL_RECOMMENDATION_WEIGHTS);
    if(!ranks.length)return createPaginatedResult([],page);
    const rows=await findDigitalPublications(client,campus.institucion_id,null,{q:'',careerId:null,subjectId:null,modality:null,page:1,offset:0,limit:ranks.length},current.userId,'available',ranks.map(row=>row.id));
    const mapped=new Map(rows.map(row=>[row.id,row]));
    return createPaginatedResult(ranks.filter(rank=>mapped.has(rank.id)).map(rank=>({...mapped.get(rank.id)!,recommendation:{score:rank.score,reasons:[
      ...(rank.careerMatches?['Coincide con tus carreras']:[]),...(rank.subjectMatches?['Asignaturas relacionadas con tu perfil']:[]),
      ...(rank.ownView||rank.ownRequest?['Relacionado con tu interés reciente']:[]),...(rank.activity?['Actividad de tu institución']:[]),
      ...(!rank.score?['Recurso reciente de tu institución']:[])]}})),page);
  });}catch(error){if(error instanceof ApiError)throw error;throw new ApiError(503,'DEPENDENCY_UNAVAILABLE','No se pudieron cargar las recomendaciones.');}
}
/** La vista del detalle forma parte del historial de demanda. */
export async function recordDigitalView(auth:VerifiedAuthConnection,rawId:unknown) {
  authorizeDigitalAccess(auth);const id=digitalId(rawId);
  try { await withPostgresTransaction(async client=>{
    const {current,campus}=await currentDigitalContext(client,auth);
    await recordResourceView(client,campus.institucion_id,null,current.userId,id,'DIGITAL');
  }); } catch(error) { if(error instanceof ApiError)throw error;
    throw new ApiError(503,'DEPENDENCY_UNAVAILABLE','No se pudo registrar la vista del recurso.'); }
}
