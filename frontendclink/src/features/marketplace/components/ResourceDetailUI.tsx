import { Skeleton, SkeletonBlock } from '@/components/Skeleton';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, Check, FileText, Flag, Package, ShieldCheck, Star, UserRound } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CATALOG_COLORS as colors, PriceTag, ui } from './CatalogUI';
import type { ResourceOwner } from '../types/resource';

export function DetailHeader({ onBack, onReport, disabled = false, title = 'Detalle del recurso' }: {
  onBack: () => void; onReport?: () => void; disabled?: boolean; title?: string;
}) {
  return <View style={detailUI.header}><Pressable accessibilityRole="button" accessibilityLabel="Volver" disabled={disabled} onPress={onBack} style={ui.back}>
    <ArrowLeft size={19} color={colors.primary} /><Text style={ui.link}>Volver</Text></Pressable>
    <Text numberOfLines={1} style={detailUI.headerTitle}>{title}</Text>
    {onReport && <Pressable accessibilityRole="button" accessibilityLabel="Denunciar recurso" disabled={disabled} onPress={onReport} style={ui.iconButton}><Flag size={19} color={colors.secondary} /></Pressable>}
  </View>;
}

export function OwnerCard({ owner, physical = false }: { owner?: ResourceOwner; physical?: boolean }) {
  return <View style={detailUI.owner}><View style={detailUI.avatar}><UserRound size={22} color={colors.primary} /></View>
    <View style={detailUI.ownerInfo}><Text style={detailUI.helper}>Publicado por</Text><Text style={detailUI.ownerName}>{owner?.fullName || 'Propietario del recurso'}</Text>
      {physical ? <Text style={detailUI.helper}>Entrega en tu campus</Text> : owner && typeof owner.completedAgreements === 'number' && <>
        <View style={detailUI.inline}><Star size={14} color={colors.primary} /><Text style={detailUI.helper}>{owner.ratingCount && owner.averageRating != null
          ? `${owner.averageRating.toLocaleString('es-CL', { maximumFractionDigits: 1 })}/5 · ${owner.ratingCount} ${owner.ratingCount === 1 ? 'valoración' : 'valoraciones'}` : 'Sin valoraciones todavía'}</Text></View>
        <Text style={detailUI.helper}>{owner.completedAgreements} acuerdo{owner.completedAgreements === 1 ? '' : 's'} completado{owner.completedAgreements === 1 ? '' : 's'} en Biblioteca</Text>
      </>}
    </View>
  </View>;
}

export function AgreementNotice() {
  return <View style={detailUI.notice}><ShieldCheck size={18} color={colors.secondary} /><Text style={detailUI.noticeText}>CampusLink registra el acuerdo; el pago se hace entre ustedes.</Text></View>;
}

export function DetailActionBar({ label, onPress, disabled = false, helper, bottomOffset = 0 }: {
  label: string; onPress: () => void; disabled?: boolean; helper?: string | null; bottomOffset?: number;
}) {
  const insets = useSafeAreaInsets();
  return <View style={[detailUI.actionBar, { bottom: bottomOffset, paddingBottom: bottomOffset ? 12 : Math.max(16, insets.bottom) }]}>
    {Boolean(helper) && <Text accessibilityLiveRegion="polite" style={detailUI.actionHelper}>{helper}</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[ui.primary, disabled && ui.disabled]}><Text style={ui.primaryText}>{label}</Text></Pressable>
  </View>;
}

export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <View style={{ gap: 10 }}><Text accessibilityRole="header" style={ui.sectionTitle}>{title}</Text>{children}</View>;
}

export function ResourceDetailSkeleton() {
  return <Skeleton label="Cargando detalle del recurso" contentStyle={{ gap: 18 }}>
    {[230, 26, 18, 76, 92].map((height, index) => <SkeletonBlock style={ui.skeletonBlock} key={index} height={height} borderRadius={16} width={index === 2 ? '65%' : '100%'} />)}
  </Skeleton>;
}

export function OptionRow({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected, disabled }} aria-checked={selected}
    disabled={disabled} onPress={onPress} style={[detailUI.optionRow, selected && ui.selectedOption]}>
    <View style={[detailUI.radio, selected && detailUI.radioSelected]}>{selected && <Check size={12} color="#FFFFFF" />}</View>
    <Text style={[detailUI.optionText, selected && ui.selectedText]}>{label}</Text>
  </Pressable>;
}

export function RequestMessageForm({ title, messages, selected, onSelect, disabled, error, loading, onRetry }: {
  title: string; messages: { code: string; label: string }[]; selected: string; onSelect: (code: string) => void;
  disabled: boolean; error?: string | null; loading?: boolean; onRetry: () => void;
}) {
  return <DetailSection title="Mensaje para el propietario"><Text style={detailUI.helper}>Elige un mensaje para expresar tu interés en {title}. Solo se enviará la opción que selecciones.</Text>
    {loading ? <Skeleton label="Cargando mensajes disponibles" contentStyle={{ gap: 10 }}>{[0, 1, 2].map(index => <SkeletonBlock style={ui.skeletonBlock} key={index} height={58} borderRadius={14} />)}</Skeleton>
      : <View accessibilityRole="radiogroup" accessibilityLabel="Mensajes disponibles" style={{ gap: 10 }}>{messages.map(row => <OptionRow key={row.code} label={row.label} selected={row.code === selected} disabled={disabled} onPress={() => onSelect(row.code)} />)}</View>}
    {error && <Text accessibilityRole="alert" style={detailUI.error}>{error}</Text>}
    {!loading && (error || !messages.length) && <><Text style={detailUI.helper}>Si no hay opciones disponibles, vuelve a comprobar el estado del recurso.</Text><Pressable accessibilityRole="button" disabled={disabled} onPress={onRetry} style={ui.outlined}><Text style={ui.link}>Consultar estado</Text></Pressable></>}
  </DetailSection>;
}

export function RequestResourceSummary({ title, modality, price, digital = false }: { title: string; modality: string; price: number | null; digital?: boolean }) {
  const Icon = digital ? FileText : Package;
  return <View style={[detailUI.card, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
    <View style={[detailUI.avatar, { width: 52, height: 60, borderRadius: 12 }]}><Icon size={26} color={colors.primary} /></View>
    <View style={{ flex: 1, gap: 8 }}><Text style={detailUI.helper}>{digital ? 'Recurso digital · Biblioteca' : 'Recurso físico · Mercado'}</Text>
      <Text accessibilityRole="header" style={ui.sectionTitle}>{title}</Text><View style={{ alignSelf: 'flex-start' }}><PriceTag modality={modality} price={price} /></View>
    </View>
  </View>;
}

export const detailUI = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 170, gap: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 }, headerTitle: { flex: 1, color: colors.muted, fontSize: 12 },
  title: { color: colors.ink, fontSize: 24, lineHeight: 31, fontWeight: '800' }, body: { color: colors.ink, fontSize: 14, lineHeight: 22 }, helper: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  inline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }, card: { borderRadius: 16, backgroundColor: '#FFFFFF', padding: 16, borderWidth: 1, borderColor: colors.border, gap: 10 },
  owner: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFFFFF', padding: 16, flexDirection: 'row', gap: 12, alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }, ownerInfo: { flex: 1, gap: 4 }, ownerName: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  notice: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: colors.tint }, noticeText: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.secondary },
  actionBar: { position: 'absolute', left: 0, right: 0, width: '100%', maxWidth: 760, alignSelf: 'center', marginHorizontal: 'auto', backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderColor: colors.border, gap: 8 }, actionHelper: { textAlign: 'center', color: colors.muted, fontSize: 12, lineHeight: 18 },
  error: { color: '#9D302A', fontSize: 14, lineHeight: 21 }, optionRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 14, padding: 14 },
  radio: { width: 20, height: 20, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, radioSelected: { backgroundColor: colors.primary, borderColor: colors.primary }, optionText: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 21 },
});
