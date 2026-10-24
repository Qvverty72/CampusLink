import {Text} from 'react-native';
import {AgreementParticipants,AgreementProductModal} from '../../components/AgreementProductUI';
import {detailUI} from '../../components/ResourceDetailUI';
import {agreementCopy as copy} from '../../utils/agreementPresentation';
import {usePhysicalgoodsAgreementProduct} from '../hooks/usePhysicalgoodsAgreementProduct';
import type {PhysicalgoodsReceivedRequest} from '../types/publication';
import {PhysicalgoodsProductCard} from './PhysicalgoodsAgreementProduct';

export function PhysicalgoodsRequestProduct({request,onClose,viewerRole='RECEPTOR',grouped=false}:{request:PhysicalgoodsReceivedRequest;onClose:()=>void;viewerRole?:'PROPIETARIO'|'RECEPTOR';grouped?:boolean}){
  const state=usePhysicalgoodsAgreementProduct({id:request.id,role:viewerRole,publication:request.publication},!request.publication.canView);
  const agreed=!grouped&&Boolean(request.transaction?.modality&&request.transaction.currency);
  const modality=(agreed?request.transaction!.modality:state.product?.modality??request.publication.modality)!;
  const detail={publication:request.publication,campus:request.campus,startedAt:request.requestedAt,modality,
    amount:(agreed?request.transaction!.amount:state.product&&state.product.price!==undefined?state.product.price:request.publication.price)??null,currency:agreed?request.transaction!.currency!:'CLP'};
  return <AgreementProductModal title="Recurso de la solicitud" closeLabel="Cerrar recurso de la solicitud" onClose={onClose}>
    <PhysicalgoodsProductCard detail={detail} state={state} dateLabel={grouped?null:`Solicitud enviada el ${new Date(request.requestedAt).toLocaleString('es-CL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'numeric',minute:'2-digit'})}`}/>
    {!grouped&&<AgreementParticipants currentUserId={viewerRole==='PROPIETARIO'?request.owner.id:request.requester.id} donation={modality==='DONACION'} participants={[
      {id:request.owner.id,name:request.owner.fullName,role:'PROPIETARIO'},{id:request.requester.id,name:request.requester.fullName,role:'RECEPTOR'},
    ]}/>}
    {state.product&&<Text style={detailUI.helper}>{agreed?copy.currentProduct:'Las imágenes y la descripción corresponden a la publicación actual.'}</Text>}
  </AgreementProductModal>;
}
