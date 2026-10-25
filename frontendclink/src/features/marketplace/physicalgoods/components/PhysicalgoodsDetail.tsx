import { safeAreaInset } from '@/lib/layout/safeArea';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ImageIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { MarketplaceReportForm } from '../../components/MarketplaceReportForm';
import { CATALOG_COLORS as colors, StatusTag, ui } from '../../components/CatalogUI';
import { AgreementNotice, DetailActionBar, DetailHeader, DetailSection, OwnerCard, RequestMessageForm, RequestResourceSummary, ResourceDetailSkeleton, detailUI } from '../../components/ResourceDetailUI';
import { PersonalStatus } from '../../components/PersonalUI';
import { RequestSentConfirmation } from '../../components/RequestFlowUI';
import type { usePhysicalgoodsResources } from '../hooks/usePhysicalgoodsResources';
import { useRequestPhysicalgoods } from '../hooks/useRequestPhysicalgoods';
import { resourceConditions } from '../types/publication';
import { PhysicalgoodsManagement } from './PhysicalgoodsManagement';
import {PhysicalgoodsOriginalPrice} from './PhysicalgoodsPriceHistory';

type Resources = ReturnType<typeof usePhysicalgoodsResources>;
const statusLabel = (status: string) => ({ DISPONIBLE: 'Disponible', RESERVADO: 'Reservado', FINALIZADO: 'Finalizado' }[status] ?? status.toLowerCase());

export function PhysicalgoodsDetail({ resources: r, onClose, onBusyChange, onRequestDetail }: {
  resources: Resources; onClose: () => void; onBusyChange: (busy: boolean) => void; onRequestDetail?: (publicationId: string, requestId: string) => void;
}) {
  const auth = useAuth(), insets = useSafeAreaInsets();
  const request = useRequestPhysicalgoods(r);
  const [reporting, setReporting] = useState(false), [reportBusy, setReportBusy] = useState(false);
  const [requesting, setRequesting] = useState(false), [managing, setManaging] = useState(false), [photoId, setPhotoId] = useState<string | null>(null);
  const gallery = r.gallery, busy = r.busy || request.busy || reportBusy;
  const isOwner = Boolean(gallery && gallery.owner.id === auth.identity?.userId);
  const active = request.options?.activeRequest;
  const photo = gallery?.images.find(image => image.id === photoId) ?? gallery?.images.find(image => image.principal) ?? gallery?.images[0];
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  const openRequest = () => {
    if (gallery && active && onRequestDetail) onRequestDetail(gallery.id, active.id);
    else setRequesting(true);
  };
  const send = () => { void request.send().then(() => r.reloadGallery()); };
  const canSend = Boolean(request.options?.canRequest && gallery?.acceptsRequests && !r.galleryLoading && !request.loading && !busy);
  const label = active ? 'Ver mi solicitud' : requesting ? request.busy ? 'Enviando solicitud…' : 'Enviar solicitud' : 'Solicitar este recurso';
  const disabled = busy || r.galleryLoading || !gallery || isOwner || (!active && (!canSend || (requesting && !request.messageCode)));
  const helper = isOwner ? 'No puedes solicitar tu propia publicación.' : active ? 'Ya tienes una solicitud activa para este recurso.'
    : gallery && !gallery.acceptsRequests ? `El recurso está ${statusLabel(gallery.status).toLowerCase()} y no admite nuevas solicitudes.`
      : request.loading ? 'Comprobando disponibilidad y solicitudes…' : request.error ? 'No pudimos comprobar si puedes solicitarlo. Reintenta la consulta.' : null;
  return <View style={detailUI.page}>
    <ScrollView style={{ flex: 1, minHeight: 0 }} keyboardShouldPersistTaps="handled" contentContainerStyle={[detailUI.content, { paddingBottom: 24, paddingTop: safeAreaInset('top', insets.top, { min: 16, offset: 8 }) }]}>
      <DetailHeader onBack={() => { if (reporting) setReporting(false); else if (requesting) setRequesting(false); else if (managing) setManaging(false); else onClose(); }}
        onReport={gallery && !reporting && !requesting && !managing ? () => setReporting(true) : undefined} disabled={busy} title={reporting ? 'Denunciar recurso' : requesting ? 'Solicitar recurso' : 'Mercado'} />
      {reporting && gallery ? <MarketplaceReportForm target={{ type: 'PUBLICACION_FISICA', publicationId: gallery.id }} title={gallery.title} onBusyChange={setReportBusy} onBack={() => setReporting(false)} />
        : requesting ? <>
          {gallery && !active && <RequestResourceSummary title={gallery.title} modality={gallery.modality} price={gallery.price} />}
          {active ? <RequestSentConfirmation title={gallery?.title ?? ''} ownerName={gallery?.owner.fullName ?? 'El propietario'} modality={active.requestedTerms===undefined?gallery?.modality??'VENTA':active.requestedTerms?.modality??'VENTA'} price={active.requestedTerms===undefined?gallery?.price??null:active.requestedTerms?.amount??null} status={active.status} />
            : <RequestMessageForm title={gallery?.title ?? ''} messages={request.options?.messages ?? []} selected={request.messageCode} onSelect={request.setMessageCode}
              disabled={busy} loading={request.loading || r.galleryLoading} error={request.error} onRetry={request.reload} />}
          <AgreementNotice />
        </> : <>
          {r.galleryLoading && <ResourceDetailSkeleton physical />}
          {r.galleryError && <View style={detailUI.card}><Text accessibilityRole="alert" style={detailUI.error}>{r.galleryError}</Text><Pressable accessibilityRole="button" onPress={r.reloadGallery} style={ui.outlined}><Text style={ui.link}>Reintentar detalle</Text></Pressable></View>}
          {gallery && <>
            <View style={styles.hero}>{photo ? <Image key={photo.url} source={{ uri: photo.url }} accessibilityLabel={`Fotografía de ${gallery.title}`} style={styles.image} />
              : <><ImageIcon size={38} color={colors.secondary} /><Text style={detailUI.helper}>Sin fotografías disponibles</Text></>}</View>
            {gallery.images.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>{gallery.images.map((image, index) => <Pressable key={image.id} accessibilityRole="button" accessibilityLabel={`Ver fotografía ${index + 1}`}
              accessibilityState={{ selected: photo?.id === image.id }} onPress={() => setPhotoId(image.id)} style={[styles.thumbnail, photo?.id === image.id && styles.selected]}><Image source={{ uri: image.url }} style={styles.image} /></Pressable>)}</ScrollView>}
            <View style={{ gap: 12 }}><View style={styles.titleRow}><Text accessibilityRole="header" style={[detailUI.title, styles.resourceTitle]}>{gallery.title}</Text><View style={styles.price}><PhysicalgoodsOriginalPrice original={gallery.originalTerms} current={{modality:gallery.modality,amount:gallery.price,currency:'CLP'}}/></View></View>
              <View style={detailUI.inline}><PersonalStatus status={gallery.status} /><StatusTag neutral>{resourceConditions.find(row => row.value === gallery.condition)?.label ?? gallery.condition}</StatusTag><StatusTag neutral>{gallery.category.name}</StatusTag></View>
            </View>
            <DetailSection title="Descripción"><Text style={detailUI.body}>{gallery.description}</Text></DetailSection>
            <OwnerCard owner={gallery.owner} physical campus={gallery.campus?.name} /><AgreementNotice />
            {request.error && <View style={detailUI.card}><Text accessibilityRole="alert" style={detailUI.error}>{request.error}</Text><Pressable accessibilityRole="button" disabled={busy || request.loading} onPress={request.reload} style={ui.outlined}><Text style={ui.link}>Consultar estado</Text></Pressable></View>}
            {isOwner && gallery.canEdit && <Pressable accessibilityRole="button" disabled={busy} onPress={() => setManaging(true)} style={ui.outlined}><Text style={ui.link}>Administrar publicación</Text></Pressable>}
          </>}
        </>}
    </ScrollView>
    {!reporting && !managing && <DetailActionBar flow busy={request.busy} secondaryAction={requesting && active ? { label: 'Volver al mercado', onPress: onClose } : undefined} label={label} helper={requesting && active && !isOwner ? null : helper} disabled={disabled} onPress={active ? openRequest : requesting ? send : () => setRequesting(true)} />}
    {managing&&<PhysicalgoodsManagement key={r.selectedId} resources={r} onClose={()=>setManaging(false)}/>}
  </View>;
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', flexWrap:'wrap', alignItems: 'flex-start', gap: 12 }, resourceTitle: { flex: 1, minWidth: 160, fontSize: 28, lineHeight: 35 }, price: { maxWidth: '100%', flexShrink: 0 },
  hero: { height: 260, width: '100%', borderRadius: 24, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', gap: 10 },
  image: { width: '100%', height: '100%', resizeMode: 'cover' }, thumbnail: { width: 58, height: 58, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: colors.border, padding: 3, backgroundColor: '#FFFFFF' },
  selected: { borderColor: colors.primary },
});
