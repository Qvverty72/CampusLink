import type { ReactNode } from 'react';
import {Skeleton,SkeletonBlock} from '@/components/Skeleton';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CATALOG_COLORS as colors, ui } from './CatalogUI';
import { ResourceSummaryRow, detailUI } from './ResourceDetailUI';
import { PersonalAction, PersonalEmpty, PersonalRow, PersonalSkeleton, PersonalStatus, personalStatusLabel, personalUI } from './PersonalUI';

export const requestStatusLabel = personalStatusLabel;

export function RequestButton({ label, accessibilityLabel = label, onPress, disabled = false, primary = false, variant = 'button', busy = false }: {
  label: string; accessibilityLabel?: string; onPress: () => void; disabled?: boolean; primary?: boolean; variant?: 'button' | 'text'; busy?: boolean;
}) {
  if (variant === 'text') return <PersonalAction label={label} accessibilityLabel={accessibilityLabel} onPress={onPress} disabled={disabled} />;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={[primary ? ui.primary : ui.outlined, { flexDirection: 'row', gap: 8 }, disabled && ui.disabled]}>
    {busy && <ActivityIndicator size="small" color={primary ? colors.surface : colors.primary} />}<Text style={primary ? ui.primaryText : ui.link}>{label}</Text>
  </Pressable>;
}

export function RequestsHeader({ received, helper, busy, compact = false }: {
  received: boolean; helper: string; loading: boolean; busy: boolean; onReload: () => void; compact?: boolean;
}) {
  return <View style={{ gap: 8 }}><View style={requestUI.header}>
    <View style={{ flex: 1, gap: 4 }}>{!compact && <Text accessibilityRole="header" style={requestUI.title}>{received ? 'Solicitudes recibidas' : 'Mis solicitudes'}</Text>}<Text style={detailUI.helper}>{helper}</Text></View>
  </View>
    {busy && <View accessibilityLiveRegion="polite" style={requestUI.inline}><ActivityIndicator size="small" color={colors.primary} /><Text style={detailUI.helper}>Guardando decisión…</Text></View>}
  </View>;
}

export function RequestsFeedback({ loading, error, empty, received, onReload, disabled = false, onExplore, firstPage = true, redesigned = false }: {
  loading: boolean; error: string | null; empty: boolean; received: boolean; onReload: () => void; disabled?: boolean; onExplore?: () => void; firstPage?: boolean; redesigned?: boolean;
}) {
  return <>
    {error && <View style={detailUI.card}><Text accessibilityRole="alert" style={detailUI.error}>{error}</Text>
      <RequestButton label="Reintentar consulta" onPress={onReload} disabled={disabled || loading} /></View>}
    {loading ? <PersonalSkeleton label="Cargando solicitudes" /> : !error && empty && <PersonalEmpty
      title={redesigned && firstPage ? received ? 'No tienes solicitudes pendientes' : 'Aún no has enviado solicitudes' : received ? 'Aún no hay solicitudes recibidas' : 'No hay solicitudes en esta página'}
      helper={received ? 'Cuando alguien se interese en tus recursos, podrás responder desde aquí.' : 'Las solicitudes que envíes y sus acuerdos aparecerán aquí, junto con su historial.'}
      action={!received && firstPage && onExplore ? 'Explorar mercado' : 'Actualizar solicitudes'} onAction={!received && firstPage && onExplore ? onExplore : onReload} disabled={disabled} />}
  </>;
}

export function RequestCard({ title, requester, status, requestedAt, message, digital = false, keyData, children, variant = 'row', campus, resourceStatus, highlighted = false }: {
  title: string; requester?: string; status: string; requestedAt: string; message: string; historical?: boolean; digital?: boolean; keyData?: string; children?: ReactNode; variant?: 'row' | 'card'; campus?: string; resourceStatus?: string; highlighted?: boolean;
}) {
  if (variant === 'card') return <View style={[detailUI.card, highlighted && requestUI.highlighted]}>
    <ResourceSummaryRow title={requester ? `${requester} quiere ${title}` : title} digital={digital}
      subtitle={new Date(requestedAt).toLocaleDateString('es-CL')} keyData={keyData ? <Text style={requestUI.price}>{keyData}</Text> : undefined} />
    <View style={requestUI.inline}><PersonalStatus status={status} />{campus && <Text style={detailUI.campusChip}>{campus}</Text>}{resourceStatus && <PersonalStatus status={resourceStatus} />}</View>
    <View style={requestUI.message}><Text style={detailUI.body}>“{message}”</Text></View>
    {children}
  </View>;
  return <PersonalRow title={title} digital={digital} keyData={keyData} status={status}
    helper={`${requester ? `De ${requester}` : 'Solicitud enviada'} · ${new Date(requestedAt).toLocaleDateString('es-CL')}`}>
    <Text style={detailUI.helper}>{message}</Text>
    {children}
  </PersonalRow>;
}

export function RequestSegments({ received, onChange, pendingCount, acceptedCount, countsLoading=false, disabled = false,showPendingSummary=true,pendingCountLabel='pendientes en esta página' }: { received: boolean; onChange: (received: boolean) => void; pendingCount?: number;acceptedCount?:number;countsLoading?:boolean; disabled?: boolean;showPendingSummary?:boolean;pendingCountLabel?:string }) {
  return <View style={{ gap: 6 }}><View accessibilityRole="tablist" accessibilityLabel="Bandeja de solicitudes" style={requestUI.segments}>
    {[{ value: false, label: 'Enviadas' }, { value: true, label: 'Recibidas' }].map(tab => {
      const count=tab.value?pendingCount:acceptedCount;
      const countLabel=tab.value?pendingCountLabel:count===1?'solicitud aceptada':'solicitudes aceptadas';
      return <Pressable key={tab.label} accessibilityRole="tab" aria-selected={received === tab.value} accessibilityState={{ selected: received === tab.value, disabled }}
      accessibilityLabel={count!==undefined?`${tab.label}, ${count} ${countLabel}`:countsLoading?`${tab.label}, cargando contador`:tab.label}
      disabled={disabled} onPress={() => onChange(tab.value)} style={[requestUI.segment, received === tab.value && requestUI.activeSegment, disabled && ui.disabled]}>
      <Text style={[detailUI.body, received === tab.value && { fontWeight: '700' }]}>{tab.label}</Text>
      {count!==undefined&&count>0?<View style={requestUI.badge}><Text style={requestUI.badgeText}>{count}</Text></View>:count===undefined&&countsLoading?<Skeleton label={`Cargando contador de ${tab.label.toLocaleLowerCase('es-CL')}`}><SkeletonBlock width={22} height={18} borderRadius={10}/></Skeleton>:null}
    </Pressable>;})}
  </View>{showPendingSummary&&pendingCount !== undefined && <Text style={detailUI.helper}>{pendingCount} pendiente{pendingCount === 1 ? '' : 's'} en esta página.</Text>}</View>;
}

export function RequestsPager({ page, hasMore, disabled, onPrevious, onNext, itemLabel = 'Solicitudes' }: {
  page: number; hasMore: boolean; disabled: boolean; onPrevious: () => void; onNext: () => void; itemLabel?: string;
}) {
  if (page === 1 && !hasMore) return null;
  return <View style={requestUI.pager}><RequestButton label="Anterior" accessibilityLabel={`${itemLabel} anteriores`} onPress={onPrevious} disabled={disabled || page === 1} />
    <Text style={detailUI.helper}>Página {page}</Text><RequestButton label="Siguiente" accessibilityLabel={`${itemLabel} siguientes`} onPress={onNext} disabled={disabled || !hasMore} />
  </View>;
}

export function RequestDecisionDialog({ selection, physical = false, disabled, onConfirm, onCancel, embedded = false }: {
  selection: { name: string; title: string; decision: 'ACEPTAR' | 'RECHAZAR' } | null; physical?: boolean;
  disabled: boolean; onConfirm: () => void; onCancel: () => void;embedded?:boolean;
}) {
  const content=<View style={[requestUI.overlay,embedded&&StyleSheet.absoluteFill]}><ScrollView contentContainerStyle={requestUI.dialogScroll} keyboardShouldPersistTaps="handled">
      {selection && <View accessibilityViewIsModal style={requestUI.dialog}>
        <Text accessibilityRole="header" style={ui.sectionTitle}>{selection.decision === 'ACEPTAR' ? 'Aceptar' : 'Rechazar'} solicitud</Text>
        <Text style={detailUI.body}>{selection.name} · {selection.title}</Text>
        <Text style={detailUI.helper}>{selection.decision === 'RECHAZAR' ? 'La solicitud quedará rechazada. Su registro se conservará en el historial.' : physical
          ? 'El recurso quedará reservado para esta persona. Las demás solicitudes seguirán pendientes.'
          : 'Se iniciará un acuerdo con esta persona. El recurso seguirá disponible para otros estudiantes.'}</Text>
        <RequestButton label={selection.decision === 'ACEPTAR' ? 'Confirmar aceptación' : 'Confirmar rechazo'} onPress={onConfirm} primary disabled={disabled} />
        <RequestButton label="Volver sin cambios" onPress={onCancel} disabled={disabled} />
      </View>}
    </ScrollView></View>;
  return embedded?selection?content:null:<Modal visible={Boolean(selection)} transparent animationType="fade" onRequestClose={() => { if (!disabled) onCancel(); }}>{content}</Modal>;
}

export const requestUI = StyleSheet.create({
  list: personalUI.list, cards: { gap: 14 }, highlighted: { borderWidth: 1.5, borderColor: colors.primary },
  price: { fontSize: 20, lineHeight: 27, color: colors.primary, fontWeight: '800' },
  cardActions: { borderTopWidth: 1, borderColor: colors.border, paddingTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  segments: { flexDirection: 'row', borderRadius: 16, padding: 4, backgroundColor: colors.tint }, segment: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, padding: 8, borderRadius: 12 },
  activeSegment: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, badge: { backgroundColor: colors.primary, borderRadius: 12, minWidth: 22, paddingHorizontal: 6, paddingVertical: 2, alignItems: 'center' }, badgeText: { color: colors.surface, fontSize: 11, fontWeight: '700' },
  section: { gap: 14 }, title: { color: colors.ink, fontSize: 22, lineHeight: 28, fontWeight: '800' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 }, inline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: '700' }, resource: { color: colors.primary, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  message: { padding: 12, backgroundColor: colors.background, borderRadius: 10 },
  empty: { alignItems: 'center', borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border, padding: 24, gap: 12 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0, 20, 38, 0.45)' }, dialogScroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  dialog: { width: '100%', maxWidth: 440, alignSelf: 'center', padding: 22, borderRadius: 20, backgroundColor: '#FFFFFF', gap: 16 },
});
