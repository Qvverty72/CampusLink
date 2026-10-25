import type {PhysicalgoodsReceivedRequest,PhysicalgoodsTerms} from '../types/publication';

export function physicalgoodsTermsLabel(terms:PhysicalgoodsTerms|null) {
  return !terms?'Precio no disponible':terms.modality==='DONACION'?'Donación':terms.amount===null?'Precio no disponible':`$${terms.amount.toLocaleString('es-CL')}${terms.currency==='CLP'?'':` ${terms.currency}`}`;
}
export function samePhysicalgoodsTerms(a:PhysicalgoodsTerms|null|undefined,b:PhysicalgoodsTerms|null|undefined) {
  return Boolean(a&&b&&a.modality===b.modality&&a.amount===b.amount&&a.currency===b.currency);
}
export function physicalgoodsRequestTerms(request:PhysicalgoodsReceivedRequest) {
  const current:PhysicalgoodsTerms={modality:request.publication.modality,amount:request.publication.price,currency:'CLP'};
  // Compatibilidad con servidores anteriores: null explícito significa historia desconocida, nunca precio vigente.
  const requested=request.requestedTerms===undefined?current:request.requestedTerms;
  const agreed=request.transaction?.modality&&request.transaction.currency
    ?{modality:request.transaction.modality,amount:request.transaction.amount??null,currency:request.transaction.currency}:null;
  return {current,requested,agreed,selected:agreed??requested,label:agreed?'Monto acordado':request.requestedTerms===undefined?current.modality==='DONACION'?'Modalidad':'Precio publicado':'Precio al solicitar'};
}
