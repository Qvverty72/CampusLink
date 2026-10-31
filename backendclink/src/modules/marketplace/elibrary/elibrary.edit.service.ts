import { ApiError } from '../../../shared/errors/api-error.js';
import { notifyResourceUpdated } from '../marketplace.notifications.js';
import type { VerifiedAuthConnection } from '../../auth/types/auth.types.js';
import { digitalAction,withDigitalTradeContext } from './elibrary.trades.service.js';
import { parseDigitalInput,invalidDigital } from './elibrary.validation.js';
import { findDigitalPublications } from './elibrary.repository.js';
import { auditDigitalAcademics } from './elibrary.academics.repository.js';
import { retireDigitalPublication,updateDigitalContent } from './elibrary.edit.repository.js';
export async function editDigitalPublication(auth:VerifiedAuthConnection,id:unknown,raw:unknown,retiring=false) {
  const body=digitalAction(raw,retiring?['updatedAt']:['title','description','modality','price','updatedAt']);
  if(typeof body.updatedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(body.updatedAt))invalidDigital('updatedAt','Recarga la publicación antes de editar.');
  const input=retiring?null:parseDigitalInput({title:body.title,description:body.description,modality:body.modality,price:body.price});
  return withDigitalTradeContext(auth,id,async(client,resource,current)=>{
    if(resource.propietario_id!==current.userId)throw new ApiError(403,'FORBIDDEN','Solo el propietario puede editar o retirar este recurso.');
    const before=(await findDigitalPublications(client,resource.institucion_id,resource.id,undefined,current.userId,'owned'))[0];
    if(retiring&&before.isWithdrawn)return before;
    if(before.updatedAt!==body.updatedAt||before.isWithdrawn||before.status!=='DISPONIBLE')throw new ApiError(409,'CONFLICT','La publicación cambió o no está disponible para editar. Recarga sus datos.');
    if(input&&input.title===before.title&&input.description===before.description&&input.modality===before.modality&&input.price===before.price)return before;
    if(retiring)await retireDigitalPublication(client,resource.id);else await updateDigitalContent(client,resource.id,input!);
    const after=(await findDigitalPublications(client,resource.institucion_id,resource.id,undefined,current.userId,'owned'))[0];
    await auditDigitalAcademics(client,current,before,after,retiring?'RETIRAR_PUBLICACION':'EDITAR_PUBLICACION');
    if(!retiring)await notifyResourceUpdated(client,resource.id);
    return after;
  });
}
