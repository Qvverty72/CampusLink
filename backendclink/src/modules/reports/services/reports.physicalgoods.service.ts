import { ApiError } from '../../../shared/errors/api-error.js';
import { requireCampusCapability } from '../../auth/domain/auth.authorization.js';
import type { VerifiedAuthConnection } from '../../auth/types/auth.types.js';
import { lockPhysicalgoodsPublisher, withPhysicalgoodsTransaction } from '../../marketplace/physicalgoods/public.js';
import { findPhysicalgoodsMedia } from '../../marketplace/physicalgoods/public.js';
import { physicalgoodsSnapshot } from '../../marketplace/physicalgoods/public.js';
import { findPhysicalgoodsTransaction, lockPhysicalgoodsTransactionResource, physicalgoodsConfirmations,
  physicalgoodsTransactionDetail } from '../../marketplace/physicalgoods/public.js';
import { physicalgoodsId } from '../../marketplace/physicalgoods/public.js';
import { insertContentReport,selectOwnPublicationReport } from '../repositories/reports.repository.js';
import {withPhysicalgoodsHistory} from '../../marketplace/physicalgoods/public.js';
import { parseContentReport } from '../validators/reports.validation.js';
import type { ContentReportInput, PhysicalgoodsReportReceipt } from '../types/reports.types.js';

/** Registra contenido físico accesible o un acuerdo propio, sin alterar el elemento denunciado. */
export async function reportPhysicalgoods(auth:VerifiedAuthConnection,publicationId:unknown,transactionId:unknown|null,
  input:unknown):Promise<PhysicalgoodsReportReceipt> {
  requireCampusCapability(auth,auth.campusId,'general');
  const id=physicalgoodsId(publicationId,'publicationId'),agreement=transactionId===null?null:physicalgoodsId(transactionId,'transactionId');
  const parsed=parseContentReport(input);
  if(!parsed.success)throw new ApiError(400,'VALIDATION_ERROR','Revisa los datos de la denuncia.',{details:parsed.issues});
  try {
    return await withPhysicalgoodsTransaction(async client=>{
      const {profile,roles}=await lockPhysicalgoodsPublisher(client,auth.userId);
      if(!profile||profile.campus_id!==auth.campusId||profile.institucion_id!==auth.profile.institucion_id)throw new ApiError(409,'CONFLICT','Tu contexto cambió. Actualiza la sesión.');
      const current={...auth,profile,roles,campusId:profile.campus_id};
      requireCampusCapability(current,current.campusId,'general');
      const resource=agreement?await lockPhysicalgoodsTransactionResource(client,id,current.campusId):await findPhysicalgoodsMedia(client,id,current.campusId,true);
      if(!resource)throw new ApiError(404,'NOT_FOUND','No se encontró un elemento disponible para denunciar en tu campus.');
      if(!agreement&&'propietario_id' in resource&&resource.propietario_id===current.userId)throw new ApiError(403,'FORBIDDEN','No puedes denunciar tu propia publicación.');
      if(!agreement){const previous=await selectOwnPublicationReport(client,current.userId,current.campusId,'PUBLICACION_FISICA',id);if(previous)return previous;}
      const transaction=agreement?await findPhysicalgoodsTransaction(client,id,agreement):null;
      if(agreement&&(!transaction||![transaction.propietario_id,transaction.receptor_id].includes(current.userId)))throw new ApiError(404,'NOT_FOUND','No se encontró un acuerdo propio para denunciar.');
      const snapshot={publication:await physicalgoodsSnapshot(client,id),...(transaction?{
        transaction:await physicalgoodsTransactionDetail(client,transaction.id),confirmations:await physicalgoodsConfirmations(client,transaction.id),
      }:{})};
      const receipt=await insertContentReport(client,{...parsed.data as ContentReportInput,userId:current.userId,campusId:current.campusId,
        entityType:agreement?'TRANSACCION':'PUBLICACION_FISICA',entityId:agreement??id,snapshot});
      const input=parsed.data as ContentReportInput;
      return {...receipt,publicationId:id,transactionId:agreement,reason:input.reason,description:input.description??null};
    });
  } catch(error) {
    if(error instanceof ApiError)throw error;
    throw new ApiError(503,'DEPENDENCY_UNAVAILABLE','No se pudo confirmar el envío de la denuncia.');
  }
}

export async function getOwnPhysicalgoodsReport(auth:VerifiedAuthConnection,publicationId:unknown){
  const id=physicalgoodsId(publicationId,'publicationId');
  return withPhysicalgoodsHistory(auth,async(client,current)=>{
    const previous=await selectOwnPublicationReport(client,current.userId,current.campusId,'PUBLICACION_FISICA',id);
    if(previous)return previous;
    const resource=await findPhysicalgoodsMedia(client,id,current.campusId);
    if(!resource)throw new ApiError(404,'NOT_FOUND','No se encontró la publicación.');
    if(resource.propietario_id===current.userId)throw new ApiError(403,'FORBIDDEN','No puedes denunciar tu propia publicación.');
    return null;
  });
}
