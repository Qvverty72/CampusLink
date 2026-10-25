import {Text} from 'react-native';
import {AgreementParticipants,AgreementProductModal} from '../../components/AgreementProductUI';
import {detailUI} from '../../components/ResourceDetailUI';
import {agreementCopy as copy} from '../../utils/agreementPresentation';
import {usePhysicalgoodsAgreementProduct} from '../hooks/usePhysicalgoodsAgreementProduct';
import type {PhysicalgoodsReceivedRequest} from '../types/publication';
import {PhysicalgoodsProductCard} from './PhysicalgoodsAgreementProduct';
import {physicalgoodsRequestTerms} from '../utils/requestTerms';
import {PhysicalgoodsOriginalPrice} from './PhysicalgoodsPriceHistory';

export function PhysicalgoodsRequestProduct({request,onClose,viewerRole='RECEPTOR',grouped=false}:{request:PhysicalgoodsReceivedRequest;onClose:()=>void;viewerRole?:'PROPIETARIO'|'RECEPTOR';grouped?:boolean}){
  const state=usePhysicalgoodsAgreementProduct({id:request.id,role:viewerRole,publication:request.publication},!request.publication.canView);
  const terms=physicalgoodsRequestTerms(request),agreed=!grouped&&Boolean(terms.agreed);
  const selected=grouped?{modality:state.product?.modality??request.publication.modality,amount:state.product?state.product.price:request.publication.price,currency:'CLP'}:terms.agreed??terms.current;
  const priceLabel=agreed?'Monto acordado':'Precio actual';
  const modality=selected?.modality??'VENTA';
  const detail={publication:request.publication,campus:request.campus,startedAt:request.requestedAt,modality,
    amount:selected?.amount??null,currency:selected?.currency??'CLP'};
  return <AgreementProductModal title="Recurso de la solicitud" closeLabel="Cerrar recurso de la solicitud" onClose={onClose}>
    <PhysicalgoodsProductCard detail={detail} state={state} dateLabel={grouped?null:`Solicitud enviada el ${new Date(request.requestedAt).toLocaleString('es-CL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'numeric',minute:'2-digit'})}`}
      priceContent={<PhysicalgoodsOriginalPrice original={grouped?state.product?.originalTerms:terms.requested} current={selected} currentLabel={priceLabel} previousLabel={grouped?'Precio anterior':'Precio al solicitar'}/>}/>
    {!grouped&&request.requestedTerms===null&&<Text style={detailUI.helper}>Precio al solicitar no disponible en el historial.</Text>}
    {!grouped&&<AgreementParticipants currentUserId={viewerRole==='PROPIETARIO'?request.owner.id:request.requester.id} donation={modality==='DONACION'} participants={[
      {id:request.owner.id,name:request.owner.fullName,role:'PROPIETARIO'},{id:request.requester.id,name:request.requester.fullName,role:'RECEPTOR'},
    ]}/>}
    {state.product&&<Text style={detailUI.helper}>{agreed?copy.currentProduct:'Las imágenes y la descripción corresponden a la publicación actual.'}</Text>}
  </AgreementProductModal>;
}
