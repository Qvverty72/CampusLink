import {Text,View} from 'react-native';
import {AgreementProductModal} from '../../components/AgreementProductUI';
import {PersonalStatus} from '../../components/PersonalUI';
import {RequestButton} from '../../components/RequestsUI';
import {detailUI} from '../../components/ResourceDetailUI';
import {PhysicalgoodsProductCard} from './PhysicalgoodsAgreementProduct';
import {usePhysicalgoodsAgreementProduct} from '../hooks/usePhysicalgoodsAgreementProduct';
import type {PhysicalgoodsOwnPublication} from '../types/publication';

/** Misma ficha de solicitudes/transacciones, leída como propietario sin inventar participantes. */
export function PhysicalgoodsPublicationProduct({publication,onClose,onManage,onAgreement}:{publication:PhysicalgoodsOwnPublication;onClose:()=>void;onManage?:()=>void;onAgreement?:(publicationId:string,transactionId:string)=>void}){
 const state=usePhysicalgoodsAgreementProduct({id:publication.id,role:'PROPIETARIO',publication:{id:publication.id,title:publication.title,status:publication.status,isWithdrawn:publication.isWithdrawn}},!publication.canView);
 const product=state.product,detail={publication:{id:publication.id,title:product?.title??publication.title,status:product?.status??publication.status,isWithdrawn:product?.isWithdrawn??publication.isWithdrawn},modality:product?.modality??publication.modality,amount:product?product.price:publication.price,currency:'CLP',campus:publication.campus,startedAt:publication.publishedAt};
 return <AgreementProductModal title="Recurso de la publicación" closeLabel="Cerrar recurso de la publicación" onClose={onClose}>
  <PhysicalgoodsProductCard detail={detail} state={state} dateLabel={`Publicado el ${new Date(publication.publishedAt).toLocaleDateString('es-CL')}`}/>
  <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Text style={detailUI.helper}>Estado de la publicación</Text><PersonalStatus status={detail.publication.isWithdrawn?'RETIRADA':detail.publication.status}/></View>
  {product?.canView&&onManage&&<RequestButton label="Gestionar publicación" onPress={onManage} disabled={state.loading}/>}
  {product?.activeTransaction&&onAgreement&&<RequestButton label="Ver transacción" onPress={()=>onAgreement(publication.id,product.activeTransaction!.id)} disabled={state.loading}/>}
 </AgreementProductModal>;
}
