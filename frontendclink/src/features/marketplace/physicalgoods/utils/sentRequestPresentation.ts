import type {SentRequestTone} from '../../components/SentRequestCard';
import type {PhysicalgoodsReceivedRequest} from '../types/publication';
import {physicalgoodsRequestTerms,physicalgoodsTermsLabel} from './requestTerms';

/** Nunca deduce rechazo por una reserva ajena ni usa el precio actual como monto acordado. */
export function sentRequestPresentation(request:PhysicalgoodsReceivedRequest){
  const owner=request.owner.fullName.trim().split(/\s+/)[0]||'El propietario';
  let tone:SentRequestTone='pending',summary=`Esperando respuesta de ${owner}`,status=summary;
  if(request.transaction?.status==='COMPLETADA'){
    tone='completed';summary='Transacción finalizada';status='El intercambio se completó.';
  }else if(request.transaction?.status==='CANCELADA'){
    tone='closed';summary='Transacción cancelada';status='La transacción fue cancelada. Conservas su historial.';
  }else if(request.status==='ACEPTADA'){
    tone='accepted';summary='Solicitud aceptada';status=`${owner} aceptó tu solicitud`;
  }else if(request.status==='RECHAZADA'){
    tone='rejected';summary='Solicitud rechazada';status=`${owner} rechazó tu solicitud`;
  }else if(request.status==='CANCELADA'){
    tone='closed';summary='Solicitud cerrada';status='La solicitud está cerrada. Conservas su historial.';
  }else if(request.publication.status==='RESERVADO'){
    summary='Pendiente · recurso reservado';status='Tu solicitud sigue pendiente. El recurso está reservado para otra persona.';
  }
  const terms=physicalgoodsRequestTerms(request),amount=physicalgoodsTermsLabel(terms.selected);
  return {tone,summary,status,amount,amountLabel:terms.label};
}
