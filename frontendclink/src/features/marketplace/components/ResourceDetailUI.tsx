import { safeAreaInset } from '@/lib/layout/safeArea';
import type { DimensionValue } from 'react-native';
import { Skeleton, SkeletonBlock } from '@/components/Skeleton';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, Check, CircleCheck, FileText, Flag, MapPin, Package, ShieldCheck, Star, UserRound } from 'lucide-react-native';
import { APP_COLORS } from '@/types/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CATALOG_COLORS as colors, ui } from './CatalogUI';
import type { ResourceOwner } from '../types/resource';

export function DetailHeader({ onBack, onReport, disabled = false, title = 'Detalle del recurso' }: {
  onBack: () => void; onReport?: () => void; disabled?: boolean; title?: string;
}) {
  return <View style={detailUI.header}><Pressable accessibilityRole="button" accessibilityLabel="Volver" disabled={disabled} onPress={onBack} style={detailUI.backButton}>
    <ArrowLeft size={20} color={colors.primary} /></Pressable>
    <Text numberOfLines={1} style={detailUI.headerTitle}>{title}</Text>
    {onReport && <Pressable accessibilityRole="button" accessibilityLabel="Denunciar recurso" disabled={disabled} onPress={onReport} style={ui.iconButton}><Flag size={19} color={colors.secondary} /></Pressable>}
  </View>;
}

export function OwnerCard({ owner, physical = false, campus }: { owner?: ResourceOwner; physical?: boolean; campus?: string }) {
  const average = owner?.averageRating, ratings = owner?.ratingCount ?? 0;
  const hasRating = typeof average === 'number' && Number.isFinite(average) && ratings > 0;
  const score = hasRating ? average.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '';
  const completed = owner?.completedAgreements;
  const delivery = campus ? /^campus\b/i.test(campus.trim()) ? `Entrega en ${campus}` : `Entrega en campus ${campus}` : 'Entrega en tu campus';
  return <View style={detailUI.owner}>
    <Text style={detailUI.ownerCaption}>PUBLICADO POR</Text>
    <View style={detailUI.ownerBody}><View style={detailUI.avatar}><UserRound size={24} color={colors.primary} /></View>
      <View style={detailUI.ownerInfo}><Text style={detailUI.ownerName}>{owner?.fullName || 'Propietario del recurso'}</Text>
        {Boolean(owner?.careers?.length) && <Text style={detailUI.ownerCareer}>{owner?.careers?.join(' · ')}</Text>}
        {typeof owner?.ratingCount === 'number' && <View style={detailUI.ownerRating} accessible
          accessibilityLabel={hasRating ? `Valoración del propietario: ${score} de 5. ${ratings} ${ratings === 1 ? 'valoración' : 'valoraciones'}` : 'Sin valoraciones todavía'}>
          <Star size={15} color={hasRating ? APP_COLORS.ACCENT : colors.secondary} fill={hasRating ? APP_COLORS.ACCENT : 'transparent'} aria-hidden />
          {hasRating ? <Text style={detailUI.ownerRatingText}><Text style={detailUI.ownerRatingScore}>{score}</Text> · {ratings} {ratings === 1 ? 'valoración' : 'valoraciones'}</Text>
            : <Text style={detailUI.helper}>Sin valoraciones todavía</Text>}
        </View>}
      </View>
    </View>
    {(typeof completed === 'number' || physical) && <View style={detailUI.ownerFooter}>
      {typeof completed === 'number' && <View style={detailUI.ownerFact}><CircleCheck size={17} color={colors.primary} />
        <Text style={detailUI.ownerFactText}>{completed} {completed === 1 ? 'transacción completada' : 'transacciones completadas'}</Text></View>}
      {physical && <View style={detailUI.ownerFact}><MapPin size={17} color={colors.primary} /><Text style={detailUI.ownerFactText}>{delivery}</Text></View>}
    </View>}
  </View>;
}

export function AgreementNotice() {
  return <View style={detailUI.notice}><ShieldCheck size={18} color={colors.secondary} /><Text style={detailUI.noticeText}>CampusLink registra el acuerdo; el pago se hace entre ustedes.</Text></View>;
}

export function DetailActionBar({ label, onPress, disabled = false, helper, bottomOffset = 0, secondaryAction, flow = false, busy = false, neutralDisabled = false }: {
  label: string; onPress: () => void; disabled?: boolean; helper?: string | null; bottomOffset?: DimensionValue; secondaryAction?: { label: string; onPress: () => void }; flow?: boolean; busy?: boolean; neutralDisabled?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return <View style={[detailUI.actionBar, flow && detailUI.flowBar, { bottom: bottomOffset, paddingBottom: bottomOffset ? 12 : safeAreaInset('bottom', insets.bottom, { min: 16 }) }]}>
    {Boolean(helper) && <Text accessibilityLiveRegion="polite" style={detailUI.actionHelper}>{helper}</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[ui.primary, { flexDirection: 'row', gap: 8 }, disabled && (neutralDisabled ? detailUI.disabledPrimary : ui.disabled)]}>{busy && <ActivityIndicator size="small" color={neutralDisabled && disabled ? colors.primary : colors.surface} />}<Text style={[ui.primaryText, { flexShrink: 1, textAlign: 'center' }, neutralDisabled && disabled && { color: colors.primary }]}>{label}</Text></Pressable>
    {secondaryAction && <Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }} onPress={secondaryAction.onPress} style={[ui.outlined, disabled && ui.disabled]}><Text style={ui.link}>{secondaryAction.label}</Text></Pressable>}
  </View>;
}

export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <View style={{ gap: 10 }}><Text accessibilityRole="header" style={ui.sectionTitle}>{title}</Text>{children}</View>;
}

export function ResourceDetailSkeleton({ physical = false }: { physical?: boolean } = {}) {
  return <Skeleton label="Cargando detalle del recurso" contentStyle={{ gap: 18 }}>
    {[230, 26, 18, 76].map((height, index) => <SkeletonBlock style={ui.skeletonBlock} key={index} height={height} borderRadius={16} width={index === 2 ? '65%' : '100%'} />)}
    <View style={detailUI.owner}><SkeletonBlock width={100} height={12}/>
      <View style={detailUI.ownerBody}><SkeletonBlock width={48} height={48} borderRadius={24}/><View style={detailUI.ownerInfo}>
        <SkeletonBlock width="65%" height={20}/><SkeletonBlock width="90%" height={14}/><SkeletonBlock width="70%" height={16}/>
      </View></View><View style={detailUI.ownerFooter}><SkeletonBlock width="65%" height={18}/>{physical&&<SkeletonBlock width="85%" height={18}/>}</View>
    </View>
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

export function ResourcePrice({ modality, price }: { modality: string; price: number | null }) {
  return <Text style={detailUI.price}>{modality === 'DONACION' ? 'Donación' : price === null ? 'Precio no disponible' : `$${price.toLocaleString('es-CL')}`}</Text>;
}

export function ResourceSummaryRow({ title, subtitle, digital = false, keyData }: { title: string; subtitle: string; digital?: boolean; keyData?: ReactNode }) {
  const Icon = digital ? FileText : Package;
  return <View style={detailUI.resourceRow}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={detailUI.resourceIcon}><Icon size={25} color={colors.primary} /></View>
    <View style={{ flex: 1, minWidth: 0, gap: 5 }}><Text accessibilityRole="header" style={ui.sectionTitle}>{title}</Text><Text style={detailUI.helper}>{subtitle}</Text></View>
    {keyData && <View style={{ maxWidth: '40%' }}>{keyData}</View>}
  </View>;
}

export function RequestResourceSummary({ title, modality, price, digital = false, subtitle }: { title: string; modality: string; price: number | null; digital?: boolean; subtitle?: string }) {
  return <View style={detailUI.card}><ResourceSummaryRow title={title} digital={digital}
    subtitle={subtitle ?? (digital ? 'Recurso digital · Biblioteca' : 'Recurso físico · Mercado')} keyData={<ResourcePrice modality={modality} price={price} />} /></View>;
}

export const detailUI = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 170, gap: 20 },
  backButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  disabledPrimary: { backgroundColor: colors.tint },
  flowBar: { position: 'relative', flexShrink: 0 },
  resourceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, resourceIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  price: { color: colors.primary, fontSize: 23, lineHeight: 30, fontWeight: '800', flexShrink: 1 }, campusChip: { color: colors.primary, fontSize: 12, backgroundColor: colors.tint, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 }, headerTitle: { flex: 1, color: colors.muted, fontSize: 12 },
  title: { color: colors.ink, fontSize: 24, lineHeight: 31, fontWeight: '800' }, body: { color: colors.ink, fontSize: 14, lineHeight: 22 }, helper: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  inline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }, card: { borderRadius: 20, backgroundColor: '#FFFFFF', padding: 16, borderWidth: 1, borderColor: colors.border, gap: 10 },
  owner: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFFFFF', padding: 16, gap: 14 },
  ownerCaption: { color: colors.secondary, fontSize: 11, lineHeight: 16, letterSpacing: 1 }, ownerBody: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  ownerInfo: { flex: 1, minWidth: 0, gap: 2 }, ownerName: { color: colors.ink, fontSize: 16, lineHeight: 21, fontWeight: '700' }, ownerCareer: { color: colors.ink, fontSize: 12, lineHeight: 17 },
  ownerRating: { flexDirection: 'row', alignItems: 'center', gap: 5 }, ownerRatingText: { color: colors.primary, fontSize: 13, lineHeight: 18, flexShrink: 1 }, ownerRatingScore: { fontWeight: '700' },
  ownerFooter: { borderTopWidth: 1, borderColor: colors.border, paddingTop: 12, gap: 9 }, ownerFact: { flexDirection: 'row', alignItems: 'center', gap: 9 }, ownerFactText: { color: colors.primary, fontSize: 13, lineHeight: 19, flex: 1 },
  notice: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: colors.tint }, noticeText: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.secondary },
  actionBar: { position: 'absolute', left: 0, right: 0, width: '100%', maxWidth: 760, alignSelf: 'center', marginHorizontal: 'auto', backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderColor: colors.border, gap: 8 }, actionHelper: { textAlign: 'center', color: colors.muted, fontSize: 12, lineHeight: 18 },
  error: { color: '#9D302A', fontSize: 14, lineHeight: 21 }, optionRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 14, padding: 14 },
  radio: { width: 20, height: 20, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, radioSelected: { backgroundColor: colors.primary, borderColor: colors.primary }, optionText: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 21 },
});
