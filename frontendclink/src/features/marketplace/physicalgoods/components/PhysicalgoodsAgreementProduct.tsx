import type {ReactNode} from 'react';
import { Pressable, Text, View } from 'react-native';
import { SkeletonBlock } from '@/components/Skeleton';
import { AgreementParticipants, AgreementProductDetails, AgreementProductGallery, AgreementProductModal } from '../../components/AgreementProductUI';
import { detailUI } from '../../components/ResourceDetailUI';
import { ui } from '../../components/CatalogUI';
import { agreementCopy as copy } from '../../utils/agreementPresentation';
import { usePhysicalgoodsAgreementProduct } from '../hooks/usePhysicalgoodsAgreementProduct';
import { resourceConditions, type PhysicalgoodsTransaction } from '../types/publication';
import {PhysicalgoodsOriginalPrice} from './PhysicalgoodsPriceHistory';

export function PhysicalgoodsAgreementProduct({ detail, historical, onClose, embedded = false }: { detail: PhysicalgoodsTransaction; historical: boolean; onClose: () => void; embedded?: boolean }) {
  const state = usePhysicalgoodsAgreementProduct(detail, historical);
  const content = <>
    <PhysicalgoodsProductCard detail={detail} state={state} priceContent={<PhysicalgoodsOriginalPrice original={detail.requestedTerms} current={{modality:detail.modality,amount:detail.amount,currency:detail.currency}} currentLabel="Monto acordado" previousLabel="Precio al solicitar"/>}/>
    <AgreementParticipants currentUserId={detail.role === 'PROPIETARIO' ? detail.owner.id : detail.receiver.id} donation={detail.modality === 'DONACION'} participants={[{ id: detail.owner.id, name: detail.owner.fullName, role: 'PROPIETARIO' }, { id: detail.receiver.id, name: detail.receiver.fullName, role: 'RECEPTOR' }]} />
    {state.product && <Text style={detailUI.helper}>{copy.currentProduct}</Text>}
  </>;
  return embedded ? content : <AgreementProductModal onClose={onClose}>{content}</AgreementProductModal>;
}

/** La misma ficha de producto para solicitudes y transacciones, sin fabricar un acuerdo. */
export function PhysicalgoodsProductCard({detail,state,dateLabel,priceContent}:{
  detail:Pick<PhysicalgoodsTransaction,'publication'|'modality'|'amount'|'currency'|'campus'|'startedAt'>;
  state:ReturnType<typeof usePhysicalgoodsAgreementProduct>;dateLabel?:string|null;priceContent?:ReactNode;
}){
  const product=state.product;
  return <AgreementProductDetails title={detail.publication.title} modality={detail.modality} amount={detail.amount} currency={detail.currency} campus={detail.campus.name} startedAt={detail.startedAt} dateLabel={dateLabel} priceContent={priceContent} loading={state.loading && !product}
      tags={product ? [resourceConditions.find(row => row.value === product.condition)?.label ?? product.condition, product.category.name] : []} description={product?.description}>
      {product && <AgreementProductGallery key={product.id} title={detail.publication.title} images={product.images} />}
      {state.loading && !product && <View style={{ gap: 10 }}><SkeletonBlock height="auto" style={{ aspectRatio: 4 / 3 }} borderRadius={14} /><View style={{ flexDirection: 'row', gap: 10 }}><SkeletonBlock width={48} height={48} borderRadius={10} /><SkeletonBlock width={48} height={48} borderRadius={10} /></View></View>}
      {state.unavailable && <Text style={detailUI.helper}>{copy.productUnavailable}</Text>}
      {state.error && <View style={{ gap: 10 }}><Text accessibilityRole="alert" style={detailUI.error}>{state.error}</Text>
        <Pressable accessibilityRole="button" onPress={state.reload} disabled={state.loading} style={ui.outlined}><Text style={ui.link}>{copy.productRetry}</Text></Pressable></View>}
    </AgreementProductDetails>;
}
