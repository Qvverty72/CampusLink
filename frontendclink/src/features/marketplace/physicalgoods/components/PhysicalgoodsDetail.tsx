import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ImageIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { MarketplaceReportForm } from '../../components/MarketplaceReportForm';
import { CATALOG_COLORS as colors, FilterOptions, PriceTag, StatusTag, ui } from '../../components/CatalogUI';
import { AgreementNotice, DetailActionBar, DetailHeader, DetailSection, OwnerCard, RequestMessageForm, RequestResourceSummary, ResourceDetailSkeleton, detailUI } from '../../components/ResourceDetailUI';
import type { usePhysicalgoodsResources } from '../hooks/usePhysicalgoodsResources';
import { useRequestPhysicalgoods } from '../hooks/useRequestPhysicalgoods';
import { PHYSICALGOODS_MAX_IMAGES, resourceConditions } from '../types/publication';
import { PhysicalgoodsEditor } from './PhysicalgoodsEditor';
import { PublicationImages } from './PublicationImages';

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
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[detailUI.content, { paddingTop: Math.max(16, insets.top + 8) }]}>
      <DetailHeader onBack={() => { if (reporting) setReporting(false); else if (requesting) setRequesting(false); else if (managing) setManaging(false); else onClose(); }}
        onReport={gallery && !reporting && !requesting && !managing ? () => setReporting(true) : undefined} disabled={busy} title={reporting ? 'Denunciar recurso' : requesting ? 'Solicitar recurso' : managing ? 'Administrar publicación' : 'Mercado'} />
      {reporting && gallery ? <MarketplaceReportForm target={{ type: 'PUBLICACION_FISICA', publicationId: gallery.id }} title={gallery.title} onBusyChange={setReportBusy} onBack={() => setReporting(false)} />
        : requesting ? <>
          {gallery && <RequestResourceSummary title={gallery.title} modality={gallery.modality} price={gallery.price} />}
          {active ? <View style={detailUI.card}><Text style={ui.sectionTitle}>Solicitud registrada</Text><StatusTag>{active.status.toLowerCase()}</StatusTag><Text style={detailUI.body}>Consulta el estado de tu solicitud y sus detalles.</Text></View>
            : <RequestMessageForm title={gallery?.title ?? ''} messages={request.options?.messages ?? []} selected={request.messageCode} onSelect={request.setMessageCode}
              disabled={busy} loading={request.loading || r.galleryLoading} error={request.error} onRetry={request.reload} />}
          <AgreementNotice />
        </> : managing ? <PhysicalgoodsManagement resources={r} /> : <>
          {r.galleryLoading && <ResourceDetailSkeleton />}
          {r.galleryError && <View style={detailUI.card}><Text accessibilityRole="alert" style={detailUI.error}>{r.galleryError}</Text><Pressable accessibilityRole="button" onPress={r.reloadGallery} style={ui.outlined}><Text style={ui.link}>Reintentar detalle</Text></Pressable></View>}
          {gallery && <>
            <View style={styles.hero}>{photo ? <Image key={photo.url} source={{ uri: photo.url }} accessibilityLabel={`Fotografía de ${gallery.title}`} style={styles.image} />
              : <><ImageIcon size={38} color={colors.secondary} /><Text style={detailUI.helper}>Sin fotografías disponibles</Text></>}</View>
            {gallery.images.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>{gallery.images.map((image, index) => <Pressable key={image.id} accessibilityRole="button" accessibilityLabel={`Ver fotografía ${index + 1}`}
              accessibilityState={{ selected: photo?.id === image.id }} onPress={() => setPhotoId(image.id)} style={[styles.thumbnail, photo?.id === image.id && styles.selected]}><Image source={{ uri: image.url }} style={styles.image} /></Pressable>)}</ScrollView>}
            <View style={{ gap: 12 }}><Text accessibilityRole="header" style={detailUI.title}>{gallery.title}</Text><PriceTag modality={gallery.modality} price={gallery.price} />
              <View style={detailUI.inline}><StatusTag>{statusLabel(gallery.status)}</StatusTag><StatusTag neutral>{resourceConditions.find(row => row.value === gallery.condition)?.label ?? gallery.condition}</StatusTag><StatusTag neutral>{gallery.category.name}</StatusTag></View>
            </View>
            <DetailSection title="Descripción"><Text style={detailUI.body}>{gallery.description}</Text></DetailSection>
            <OwnerCard owner={gallery.owner} physical /><AgreementNotice />
            {request.error && <View style={detailUI.card}><Text accessibilityRole="alert" style={detailUI.error}>{request.error}</Text><Pressable accessibilityRole="button" disabled={busy || request.loading} onPress={request.reload} style={ui.outlined}><Text style={ui.link}>Consultar estado</Text></Pressable></View>}
            {isOwner && gallery.canEdit && <Pressable accessibilityRole="button" disabled={busy} onPress={() => setManaging(true)} style={ui.outlined}><Text style={ui.link}>Administrar publicación</Text></Pressable>}
          </>}
        </>}
    </ScrollView>
    {!reporting && !managing && <DetailActionBar label={label} helper={helper} disabled={disabled} onPress={active ? openRequest : requesting ? send : () => setRequesting(true)} />}
  </View>;
}

function PhysicalgoodsManagement({ resources: r }: { resources: Resources }) {
  const button = (label: string, onPress: () => void, disabled = false) => <Pressable accessibilityRole="button" disabled={r.busy || disabled} onPress={onPress} style={ui.outlined}><Text style={ui.link}>{label}</Text></Pressable>;
  return <View style={{ gap: 20 }}>
    {r.galleryLoading && <ResourceDetailSkeleton />}
    {r.galleryError && <Text accessibilityRole="alert" style={detailUI.error}>{r.galleryError}</Text>}
    {r.gallery?.canEdit && <>
      <DetailSection title="Fotografías">{r.gallery.images.map((image, index) => <View key={image.id} style={detailUI.card}>
        <Image source={{ uri: image.url }} accessibilityLabel={`Imagen ${index + 1} de ${r.gallery!.title}`} style={styles.managementImage} />
        {image.principal ? <StatusTag>Imagen principal</StatusTag> : button(`Hacer principal la imagen ${index + 1}`, () => void r.principal(image.id))}
        {button(`Retirar imagen ${index + 1}`, () => void r.retire(image.id), r.gallery!.images.length === 1)}
      </View>)}</DetailSection>
      <Text style={detailUI.helper}>Máximo {PHYSICALGOODS_MAX_IMAGES} imágenes · JPEG, PNG o WebP · Hasta 5 MB por imagen</Text>
      {button('Seleccionar imágenes adicionales', () => void r.selectPhotos(), !r.remainingImageSlots)}
      <PublicationImages photos={r.draftImages} disabled={r.busy} onRemove={r.removeDraft} />
      {button(r.busy ? 'Guardando…' : 'Guardar imágenes adicionales', () => void r.upload(), !r.draftImages.length || r.gallery.images.length + r.draftImages.length > PHYSICALGOODS_MAX_IMAGES)}
      <FilterOptions label="Nueva categoría" allowEmpty={false} options={r.options?.categories ?? []} value={r.editCategory} onChange={id => { if (!r.busy) r.setEditCategory(id); }} />
      {button('Guardar categoría', () => void r.saveCategory(), !r.editCategory || r.editCategory === r.gallery.category.id)}
    </>}
    <PhysicalgoodsEditor resources={r} />
  </View>;
}

const styles = StyleSheet.create({
  hero: { height: 230, width: '100%', borderRadius: 20, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', gap: 10 },
  image: { width: '100%', height: '100%', resizeMode: 'contain' }, thumbnail: { width: 58, height: 58, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: colors.border, padding: 3, backgroundColor: '#FFFFFF' },
  selected: { borderColor: colors.primary }, managementImage: { width: '100%', height: 170, resizeMode: 'contain' },
});
