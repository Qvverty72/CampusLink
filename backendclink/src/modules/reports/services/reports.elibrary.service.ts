import { ApiError } from '../../../shared/errors/api-error.js';
import type { VerifiedAuthConnection } from '../../auth/types/auth.types.js';
import { digitalId } from '../../marketplace/elibrary/public.js';
import { digitalConfirmations,findDigitalTrade } from '../../marketplace/elibrary/public.js';
import { withDigitalTradeContext } from '../../marketplace/elibrary/public.js';
import { findDigitalPublications } from '../../marketplace/elibrary/public.js';
import { insertContentReport,selectOwnPublicationReport } from '../repositories/reports.repository.js';
import { digitalReportSnapshot } from '../repositories/reports.elibrary.repository.js';
import { parseContentReport } from '../validators/reports.validation.js';
import type { ContentReportInput } from '../types/reports.types.js';
export async function reportDigitalResource(auth:VerifiedAuthConnection,rawId:unknown,rawTrade:unknown|null,raw:unknown) {
  const id=digitalId(rawId),tradeId=rawTrade===null?null:digitalId(rawTrade,'transactionId'),parsed=parseContentReport(raw);
  if(!parsed.success)throw new ApiError(400,'VALIDATION_ERROR','Revisa los datos de la denuncia.',{details:parsed.issues});
  const input=parsed.data as ContentReportInput;
  return withDigitalTradeContext(auth,id,async(client,resource,current)=>{
    if(!tradeId&&resource.propietario_id===current.userId)throw new ApiError(403,'FORBIDDEN','No puedes denunciar tu propia publicación.');
    if(!tradeId){const previous=await selectOwnPublicationReport(client,current.userId,resource.campus_id,'PUBLICACION_DIGITAL',id);if(previous)return previous;}
    if(!tradeId&&!(await findDigitalPublications(client,resource.institucion_id,id)).length)throw new ApiError(404,'NOT_FOUND','La publicación no está disponible para denunciar.');
    const trade=tradeId?await findDigitalTrade(client,id,tradeId):null;
    if(tradeId&&(!trade||![trade.propietario_id,trade.receptor_id].includes(current.userId)))throw new ApiError(404,'NOT_FOUND','No se encontró un acuerdo propio para denunciar.');
    const snapshot={publication:await digitalReportSnapshot(client,id,resource.institucion_id),...(trade?{transaction:trade,confirmations:await digitalConfirmations(client,trade.id)}:{})};
    const receipt=await insertContentReport(client,{...input,userId:current.userId,campusId:resource.campus_id,entityType:tradeId?'TRANSACCION':'PUBLICACION_DIGITAL',entityId:tradeId??id,snapshot});
    return {...receipt,publicationId:id,transactionId:tradeId,reason:input.reason,description:input.description??null};
  },tradeId?{tradeId}:{});
}

export async function getOwnDigitalReport(auth:VerifiedAuthConnection,rawId:unknown){
  const id=digitalId(rawId);
  return withDigitalTradeContext(auth,id,async(client,resource,current)=>{
    const previous=await selectOwnPublicationReport(client,current.userId,resource.campus_id,'PUBLICACION_DIGITAL',id);
    if(previous)return previous;
    if(resource.propietario_id===current.userId)throw new ApiError(403,'FORBIDDEN','No puedes denunciar tu propia publicación.');
    if(!(await findDigitalPublications(client,resource.institucion_id,id)).length)throw new ApiError(404,'NOT_FOUND','La publicación no está disponible para denunciar.');
    return null;
  });
}
