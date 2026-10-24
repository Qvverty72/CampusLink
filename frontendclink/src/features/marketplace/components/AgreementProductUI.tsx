import { Fragment, useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Clock, ImageIcon, MapPin } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { CATALOG_COLORS as colors } from './CatalogUI';
import { AgreementStepModal } from './AgreementStepModal';
import { detailUI } from './ResourceDetailUI';
import { agreementCopy as copy } from '../utils/agreementPresentation';
import type { TransactionParticipant } from '../types/transaction';
import { Skeleton, SkeletonBlock } from '@/components/Skeleton';

/** Contenedor de consulta compartido; no añade navegación ni permisos al recurso. */
export function AgreementProductModal({ onClose, children, title = copy.product, closeLabel = copy.closeProduct }: { onClose: () => void; children: ReactNode; title?: string; closeLabel?: string }) {
  return <AgreementStepModal title={title} closeLabel={closeLabel} onClose={onClose} fillHeight contentStyle={styles.modalContent}>{children}</AgreementStepModal>;
}

/** Ficha de solo lectura sin importar DTO físico; el consumidor elige los términos mostrados. */
export function AgreementProductDetails({ title, modality, amount, currency, campus, startedAt, tags, description, children, loading = false, dateLabel }: {
  title: string; modality: string; amount: number | null; currency: string; campus: string; startedAt: string;
  tags: string[]; description?: string; children: ReactNode; loading?: boolean; dateLabel?: string|null;
}) {
  const date = new Date(startedAt);
  const price = modality === 'DONACION' ? copy.donation : amount === null ? 'Precio no disponible' : `$${amount.toLocaleString('es-CL')}${currency === 'CLP' ? '' : ` ${currency}`}`;
  const content = <View style={styles.productCard}>{children}<View style={styles.details}>
    {loading ? <View style={styles.tags}><SkeletonBlock width={54} height={22} borderRadius={12} /><SkeletonBlock width={110} height={22} borderRadius={12} /></View>
      : tags.length > 0 && <View style={styles.tags}>{tags.map((tag, index) => <View key={`${index}:${tag}`} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>)}</View>}
    <View style={styles.titleRow}><Text accessibilityRole="header" style={styles.title}>{title}</Text><Text accessibilityLabel={`${price}${modality === 'VENTA' && amount !== null && currency === 'CLP' ? ' CLP' : ''}`} style={styles.price}>{price}</Text></View>
    <View style={styles.metadataRow}><MapPin size={14} color={colors.secondary} /><Text style={styles.metadata}>{campus}</Text></View>
    {dateLabel!==null&&<View style={styles.metadataRow}><Clock size={14} color={colors.secondary} /><Text style={styles.metadata}>{dateLabel ?? copy.productStarted(date.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }), date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }))}</Text></View>}
    {description !== undefined && <View style={styles.description}><Text accessibilityRole="header" style={styles.descriptionTitle}>{copy.description}</Text><Text style={detailUI.body}>{description}</Text></View>}
    {loading && description === undefined && <View style={styles.description}><SkeletonBlock width={90} height={20} /><SkeletonBlock height={18} /><SkeletonBlock width="75%" height={18} /></View>}
  </View></View>;
  return loading ? <Skeleton label={copy.productLoading}>{content}</Skeleton> : content;
}

export function AgreementParticipants({ participants, donation = false, currentUserId, children, embedded = false }: { participants: TransactionParticipant[]; donation?: boolean; currentUserId?: string; children?: ReactNode; embedded?: boolean }) {
  const compact = useWindowDimensions().width < 380;
  return <View style={embedded ? styles.participantsContent : styles.participantsCard}><Text accessibilityRole="header" style={styles.participantsTitle}>{copy.participants}</Text>
    <View style={[styles.participantsRow, compact && { alignItems: 'flex-start' }]}>{participants.map((person, index) => <Fragment key={person.id}>
      {index > 0 && <View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.direction, compact && styles.directionCompact]}><Svg width={72} height={16} viewBox="0 0 72 16" fill="none"><Path d="M2 8H70M65 3L70 8L65 13" stroke={colors.secondary} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></Svg></View>}
      <View style={styles.participantSlot}>
      <View style={[styles.person, compact && styles.personCompact]}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.avatar, index > 0 && { backgroundColor: colors.secondary }]}><Text style={styles.initials}>{person.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('es-CL')}</Text></View>
        <View style={[styles.personText, compact && { width: '100%' }]}><Text style={[styles.personName, compact && styles.centeredText]}>{person.name}</Text><Text style={[styles.personRole, compact && styles.centeredText]}>{person.role === 'PROPIETARIO' ? donation ? copy.donor : copy.seller : donation ? copy.recipient : copy.buyer}{person.id === currentUserId ? copy.participantSelf : ''}</Text></View>
      </View>
    </View></Fragment>)}</View>{children}
  </View>;
}

/** Fotografías de solo lectura, reutilizables sin importar DTO de physicalgoods. */
export function AgreementProductGallery({ title, images }: { title: string; images: { id: string; url: string; principal?: boolean }[] }) {
  const [selected, setSelected] = useState<string | null>(null), [failed, setFailed] = useState<string | null>(null);
  const photo = images.find(row => row.id === selected) ?? images.find(row => row.principal) ?? images[0];
  return <View style={{ gap: 10 }}>
    <View style={styles.hero}>{photo && failed !== photo.url
      ? <Image key={photo.url} source={{ uri: photo.url }} resizeMode="contain" accessibilityLabel={`${title}. ${copy.photo(images.indexOf(photo) + 1, images.length)}`} style={styles.photo} onError={() => setFailed(photo.url)} />
      : <><ImageIcon size={32} color={colors.secondary} /><Text style={detailUI.helper}>{copy.noPhotos}</Text></>}
    </View>
    {images.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
      {images.map((row, index) => <Pressable key={row.id} accessibilityRole="button" accessibilityLabel={copy.photo(index + 1, images.length)}
        accessibilityState={{ selected: row.id === photo?.id }} onPress={() => { setSelected(row.id); setFailed(null); }} style={[styles.thumbnail, row.id === photo?.id && styles.selected]}>
        <Image source={{ uri: row.url }} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
      </Pressable>)}
    </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  modalContent: { backgroundColor: colors.background, padding: 12, gap: 12, flexGrow: 1 },
  productCard: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 8, gap: 8 },
  details: { padding: 6, gap: 8 }, tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, backgroundColor: colors.tint }, tagText: { color: colors.primary, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, title: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 22, lineHeight: 28, fontWeight: '800' },
  price: { maxWidth: '48%', flexShrink: 1, color: colors.primary, fontSize: 22, lineHeight: 28, fontWeight: '800', textAlign: 'right' },
  metadataRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 }, metadata: { flex: 1, minWidth: 0, color: colors.secondary, fontSize: 12, lineHeight: 18 },
  description: { gap: 6, marginTop: 8 }, descriptionTitle: { color: colors.primary, fontSize: 13, lineHeight: 20, fontWeight: '700' },
  participantsCard: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 12 }, participantsTitle: { color: colors.primary, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  participantsContent: { gap: 12 },
  participantsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 }, participantSlot: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  direction: { width: 72, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  directionCompact: { alignSelf: 'flex-start', marginTop: 10 }, personCompact: { flexDirection: 'column', alignItems: 'center' }, centeredText: { textAlign: 'center' },
  person: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }, personText: { flex: 1, minWidth: 0, gap: 2 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, initials: { color: colors.surface, fontSize: 12, fontWeight: '700' },
  personName: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '600' }, personRole: { color: colors.secondary, fontSize: 11, lineHeight: 16 },
  hero: { width: '100%', aspectRatio: 4 / 3, borderRadius: 14, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center', gap: 10, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' }, thumbnail: { width: 48, height: 48, borderRadius: 10, padding: 3, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.tint },
  selected: { borderColor: colors.primary },
});
