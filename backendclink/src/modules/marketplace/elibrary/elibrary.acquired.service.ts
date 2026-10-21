import { withPostgresTransaction } from '../../../database/supabase/postgres.js';
import { ApiError } from '../../../services/api-response.js';
import { createPaginatedResult } from '../../../services/pagination.js';
import type { VerifiedAuthConnection } from '../../auth/auth.types.js';
import { authorizeDigitalAccess,currentDigitalContext } from './elibrary.service.js';
import { digitalHistoryPage } from './elibrary.trades.service.js';
import { digitalId } from './elibrary.validation.js';
import { findDigitalPublications } from './elibrary.repository.js';
export async function getAcquiredDigitalResources(auth:VerifiedAuthConnection,query:unknown,rawId?:unknown) {
  authorizeDigitalAccess(auth);const pagination=digitalHistoryPage(query),id=rawId===undefined?null:digitalId(rawId);
  try{return await withPostgresTransaction(async client=>{
    const {current,campus}=await currentDigitalContext(client,auth);
    const filters={...pagination,q:'',careerId:null,subjectId:null,modality:null};
    const rows=await findDigitalPublications(client,campus.institucion_id,id,filters,current.userId,'acquired');
    if(id&&!rows.length)throw new ApiError(404,'NOT_FOUND','No se encontró un material adquirido autorizado.');
    return createPaginatedResult(rows,pagination);
  });}catch(error){if(error instanceof ApiError)throw error;throw new ApiError(503,'DEPENDENCY_UNAVAILABLE','No se pudieron cargar tus materiales adquiridos.');}
}
