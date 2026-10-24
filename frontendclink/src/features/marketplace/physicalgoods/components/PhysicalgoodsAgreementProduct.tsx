import { Pressable, Text, View } from 'react-native';
import { Skeleton, SkeletonBlock } from '@/components/Skeleton';
import { AgreementProductGallery, AgreementProductModal } from '../../components/AgreementProductUI';
import { detailUI, ResourcePrice } from '../../components/ResourceDetailUI';
import { StatusTag, ui } from '../../components/CatalogUI';
import { agreementCopy as copy } from '../../utils/agreementPresentation';
import { usePhysicalgoodsAgreementProduct } from '../hooks/usePhysicalgoodsAgreementProduct';
import { resourceConditions, type PhysicalgoodsTransaction } from '../types/publication';
import { transactionDate } from '../../components/TransactionUI';

export function PhysicalgoodsAgreementProduct({ detail, historical, onClose }: { detail: PhysicalgoodsTransaction; historical: boolean; onClose: () => void }) {
  const state = usePhysicalgoodsAgreementProduct(detail, historical), product = state.product;
  return <AgreementProductModal onClose={onClose}>
    <Text accessibilityRole="header" style={ui.title}>{detail.publication.title}</Text>
    <ResourcePrice modality={detail.modality} price={detail.amount} />
    <View style={{ gap: 6 }}><Text style={detailUI.body}>{detail.owner.fullName} → {detail.receiver.fullName}</Text>
      <Text style={detailUI.helper}>{detail.campus.name}</Text><Text style={detailUI.helper}>{copy.started(transactionDate(detail.startedAt))}</Text>
    </View>
    {state.loading && !product && <Skeleton label={copy.productLoading} contentStyle={{ gap: 12 }}><SkeletonBlock height={200} borderRadius={16} /><SkeletonBlock height={16} /><SkeletonBlock width="75%" height={16} /></Skeleton>}
    {state.unavailable && <Text style={detailUI.helper}>{copy.productUnavailable}</Text>}
    {state.error && <View style={{ gap: 10 }}><Text accessibilityRole="alert" style={detailUI.error}>{state.error}</Text>
      <Pressable accessibilityRole="button" onPress={state.reload} disabled={state.loading} style={ui.outlined}><Text style={ui.link}>{copy.productRetry}</Text></Pressable></View>}
    {product && <><AgreementProductGallery key={product.id} title={detail.publication.title} images={product.images} />
      <View style={detailUI.inline}><StatusTag neutral>{resourceConditions.find(row => row.value === product.condition)?.label ?? product.condition}</StatusTag><StatusTag neutral>{product.category.name}</StatusTag></View>
      <Text accessibilityRole="header" style={ui.sectionTitle}>{copy.description}</Text><Text style={detailUI.body}>{product.description}</Text><Text style={detailUI.helper}>{copy.currentProduct}</Text>
    </>}
  </AgreementProductModal>;
}
