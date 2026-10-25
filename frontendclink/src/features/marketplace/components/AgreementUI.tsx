import { ActivityIndicator, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, Check, CircleX, Flag, MoreHorizontal } from 'lucide-react-native';
import { CATALOG_COLORS as colors, FilterSheet, ui } from './CatalogUI';
import { DetailActionBar, detailUI } from './ResourceDetailUI';
import { agreementCopy as copy, type AgreementPresentation, type AgreementUIState } from '../utils/agreementPresentation';
import { AgreementParticipants } from './AgreementProductUI';
import type { TransactionParticipant } from '../types/transaction';
import { Skeleton, SkeletonBlock } from '@/components/Skeleton';
import { TransactionRating } from './TransactionRating';
import type { ReactNode } from 'react';

const agreedPrice = (modality: string, amount: number | null, currency: string) => modality === 'DONACION' ? copy.donation : amount === null ? 'Precio no disponible' : `$${amount.toLocaleString('es-CL')} ${currency}`;

function AgreementAmount({ modality, amount, currency,content }: { modality: string; amount: number | null; currency: string;content?:ReactNode }) {
  return <View style={styles.amountRow}>{content??<Text style={detailUI.helper}>{copy.agreedAmount} <Text style={styles.amount}>{agreedPrice(modality, amount, currency)}</Text></Text>}</View>;
}

export function AgreementStatusChip({ state, label }: { state?: AgreementUIState; label: string }) {
  const tone = state === 'FINALIZADO' ? styles.success : state === 'CANCELADO' || !state ? styles.neutral : state === 'ESPERANDO_OTRO' ? styles.info : styles.pending;
  return <View style={[styles.chip, { backgroundColor: tone.backgroundColor }]}><Text style={[styles.chipText, { color: tone.color }]}>{label}</Text></View>;
}

export function AgreementHeader({ title, onBack, onMenu, disabled, menuDisabled = false }: { title: string; onBack: () => void; onMenu: () => void; disabled: boolean; menuDisabled?: boolean }) {
  return <View style={styles.header}>
    <Pressable accessibilityRole="button" accessibilityLabel={copy.back} disabled={disabled} onPress={onBack} style={detailUI.backButton}><ArrowLeft size={20} color={colors.primary} /></Pressable>
    <Text accessibilityRole="header" style={styles.headerTitle}>{title}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={copy.menu} disabled={disabled || menuDisabled} onPress={onMenu} style={styles.menuButton}><MoreHorizontal size={22} color={colors.primary} /></Pressable>
  </View>;
}

export function AgreementMenu({ visible, onClose, onDismiss = onClose, actions, embedded = false }: { visible: boolean; onClose: () => void; onDismiss?: () => void; embedded?: boolean; actions: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }[] }) {
  const content = <View style={styles.menuActions}>
    {actions.map(action => <TouchableOpacity key={action.label} accessibilityRole="button" accessibilityLabel={action.label} disabled={action.disabled} accessibilityState={{ disabled: Boolean(action.disabled) }} activeOpacity={0.75}
      onPress={() => { if (!embedded) onClose(); action.onPress(); }} style={[styles.menuAction, action.danger && styles.menuActionDanger, action.disabled && ui.disabled]}>
      <View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.menuIcon, action.danger && styles.menuIconDanger]}>
        {action.danger ? <CircleX size={22} strokeWidth={1.8} color="#B91C1C" /> : <Flag size={22} strokeWidth={1.8} color={colors.primary} />}
      </View>
      <Text style={[styles.menuLabel, action.danger && styles.danger]}>{action.label}</Text>
    </TouchableOpacity>)}
  </View>;
  return embedded ? visible ? content : null : <FilterSheet compact visible={visible} title={copy.menu} confirmLabel={null} onClose={onDismiss}>{content}</FilterSheet>;
}

export function AgreementSummary({ participants, modality, amount, currency, currentUserId, embedded = false,amountContent }: {
  participants: TransactionParticipant[]; modality: string; amount: number | null; currency: string; currentUserId?: string; embedded?: boolean;amountContent?:ReactNode;
}) {
  return <AgreementParticipants participants={participants} donation={modality === 'DONACION'} currentUserId={currentUserId} embedded={embedded}>
    <AgreementAmount modality={modality} amount={amount} currency={currency} content={amountContent}/>
  </AgreementParticipants>;
}

export type AgreementStep = 'accepted' | 'coordinate' | 'confirm';

export function AgreementTabs({ selected, onSelect, counts, showCounts = true, disabled = false }: {
  selected: 'active' | 'finished'; onSelect: (tab: 'active' | 'finished') => void;
  counts?: { active: number; finished: number }; showCounts?: boolean; disabled?: boolean;
}) {
  return <View accessibilityRole="tablist" accessibilityLabel="Estado de las transacciones" style={styles.listTabs}>{([{ id: 'active', label: copy.active }, { id: 'finished', label: copy.finished }] as const).map(tab =>
    <Pressable key={tab.id} accessibilityRole="tab" aria-selected={selected === tab.id} accessibilityState={{ selected: selected === tab.id, disabled }}
      disabled={disabled} onPress={() => onSelect(tab.id)} style={[styles.listTab, selected === tab.id && styles.listTabSelected]}>
      <Text style={[detailUI.body, selected === tab.id && { fontWeight: '700' }]}>{tab.label}{showCounts && counts ? ` · ${Math.max(0, counts[tab.id])}` : ''}</Text>
    </Pressable>)}
  </View>;
}

export function AgreementListSection({ label, children }: { label?: string; children: ReactNode }) {
  return <View style={styles.listSection}>{Boolean(label) && <Text accessibilityRole="header" style={styles.listGroupTitle}>{label?.toLocaleUpperCase('es-CL')}</Text>}{children}</View>;
}

export function AgreementStepper({ state, digital = false, selected, onSelect, disabled = false, showCancelled = false }: {
  state: AgreementUIState; digital?: boolean; selected?: AgreementStep; onSelect?: (step: AgreementStep) => void; disabled?: boolean; showCancelled?: boolean;
}) {
  if (state === 'CANCELADO' && !onSelect && !showCancelled) return null;
  const completed = state === 'FINALIZADO', cancelled = state === 'CANCELADO';
  const steps: { id: AgreementStep; label: string }[] = [{ id: 'accepted', label: copy.acceptedStep }, ...(!digital ? [{ id: 'coordinate' as const, label: copy.coordinateStep }] : []), { id: 'confirm', label: copy.confirmStep }];
  const currentIndex = state === 'COORDINANDO' && !digital ? 1 : steps.length - 1;
  return <View style={styles.stepper}>{steps.map(({ id, label }, index) => {
    const current = !cancelled && !completed && index === currentIndex;
    const done = index === 0 || completed || (!cancelled && state !== 'COORDINANDO' && index < steps.length - 1);
    const phase = done ? copy.stepReady : current ? copy.stepInProgress : cancelled ? copy.cancelled : copy.pending;
    const content = <>
      {index > 0 && <View pointerEvents="none" accessible={false} style={[styles.stepLine, styles.stepLineLeft, !cancelled && (completed || index <= currentIndex) && styles.stepLineDone]} />}
      {index < steps.length - 1 && <View pointerEvents="none" accessible={false} style={[styles.stepLine, styles.stepLineRight, !cancelled && (completed || index < currentIndex) && styles.stepLineDone]} />}
      <View style={[styles.step, done && styles.stepDone, current && styles.stepCurrent, selected === id && styles.stepChosen]}>
        {done ? <Check size={18} color={colors.surface} /> : <Text style={[styles.stepNumber, current && { color: colors.surface }]}>{index + 1}</Text>}
      </View>
      <Text style={[styles.stepLabel, (current || selected === id) && styles.stepLabelCurrent]}>{label}</Text>
      <View style={[styles.stepPhase, current && { backgroundColor: styles.pending.backgroundColor }]}>
        <Text style={[styles.stepPhaseText, current && { color: styles.pending.color, fontWeight: '700' }]}>{phase}</Text>
      </View>
    </>;
    return onSelect ? <Pressable key={id} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={`${copy.openStep(label)}. ${phase}`} accessibilityValue={{ text: phase }}
      accessibilityState={{ selected: selected === id, expanded: selected === id, disabled }} disabled={disabled} onPress={() => onSelect(id)}
      style={[styles.stepBody, disabled && ui.disabled]}>{content}</Pressable>
      : <View key={id} style={styles.stepBody}>{content}</View>;
  })}</View>;
}

/** Pasos y menú son destinos hermanos; el contenedor no intercepta sus toques. */
export function AgreementCard({ title, roleLabel, participants, currentUserId, modality, amount, currency, state, label, dateLabel, ratingScore, onSelect, onMenu, disabled = false, digital = false,amountNote,amountContent }: {
  title: string; roleLabel: string; participants?: TransactionParticipant[]; currentUserId?: string; modality: string; amount: number | null; currency: string;
  state?: AgreementUIState; label: string; dateLabel: string; ratingScore?: number | null; onSelect: (step: AgreementStep) => void; onMenu: () => void; disabled?: boolean; digital?:boolean;amountNote?:string;amountContent?:ReactNode;
}) {
  return <View style={styles.card}>
    <View style={styles.cardHeading}><Text accessibilityRole="header" style={styles.cardTitle}>{title}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${copy.menu}: ${title}`} disabled={disabled} accessibilityState={{ disabled }} onPress={onMenu} style={styles.menuButton}><MoreHorizontal size={22} color={colors.primary} /></Pressable>
    </View>
    {participants ? <AgreementSummary embedded participants={participants} currentUserId={currentUserId} modality={modality} amount={amount} currency={currency} amountContent={amountContent}/>
      : <><Text style={styles.cardHelper}>{roleLabel}</Text><Text style={detailUI.helper}>{copy.participantsUnavailable}</Text><AgreementAmount modality={modality} amount={amount} currency={currency} content={amountContent}/>
        <Pressable accessibilityRole="button" disabled={disabled} onPress={() => onSelect('accepted')} style={ui.outlined}><Text style={ui.link}>{copy.retryTransaction}</Text></Pressable></>}
    {amountNote&&<Text style={detailUI.helper}>{amountNote}</Text>}
    {state && <AgreementStepper state={state} digital={digital} showCancelled disabled={disabled} onSelect={onSelect} />}
    {state === 'FINALIZADO' && <TransactionRating score={ratingScore} />}
    <View style={styles.cardFooter}><Text style={styles.cardHelper}>{label}</Text><Text style={detailUI.helper}>{dateLabel}</Text></View>
  </View>;
}

export function AgreementCardsSkeleton({digital=false}:{digital?:boolean}={}) {
  return <Skeleton label={copy.loading} contentStyle={{ gap: 14 }}>{[0, 1].map(index => <View key={index} style={styles.card}>
    <SkeletonBlock width="70%" height={24} /><SkeletonBlock width={96} height={16} />
    <View style={styles.skeletonPeople}>{[0, 1].map(person => <View key={person} style={styles.skeletonPerson}><SkeletonBlock width={36} height={36} borderRadius={18} /><View style={{ flex: 1, gap: 6 }}><SkeletonBlock height={16} /><SkeletonBlock width="70%" height={12} /></View></View>)}</View>
    <View style={styles.amountRow}><SkeletonBlock width="75%" height={20} /></View>
    <View style={styles.skeletonPeople}>{(digital?[0,1]:[0,1,2]).map(step => <View key={step} style={styles.skeletonStep}><SkeletonBlock width={38} height={38} borderRadius={19} /><SkeletonBlock width="70%" height={14} /><SkeletonBlock width="55%" height={12} /></View>)}</View>
    <SkeletonBlock width="55%" height={14} />
  </View>)}</Skeleton>;
}

/** Mantiene la anatomía de cada panel mientras se resuelven sus primeras consultas. */
export function AgreementPanelSkeleton({ panel, digital=false }: { panel: AgreementStep | 'menu'; digital?:boolean }) {
  return <Skeleton label={copy.loadingTransaction} contentStyle={{ gap: panel === 'menu' ? 10 : 18 }}>
    {panel === 'accepted' ? digital?<><SkeletonBlock height={80}/><SkeletonBlock width="80%" height={24}/><SkeletonBlock height={100}/><SkeletonBlock height={76}/></>:<><SkeletonBlock height="auto" style={{ aspectRatio: 4 / 3 }} borderRadius={14} /><SkeletonBlock width="70%" height={22} /><SkeletonBlock height={28} /><SkeletonBlock width="80%" height={18} /><SkeletonBlock height={80} /></>
      : panel === 'menu' ? <>{[0, 1].map(index => <View key={index} style={styles.menuAction}><SkeletonBlock width={40} height={40} borderRadius={12} /><View style={{ flex: 1 }}><SkeletonBlock width={index === 0 ? '82%' : '76%'} height={18} /></View></View>)}</>
        : <><SkeletonBlock width="70%" height={24} /><SkeletonBlock height={panel === 'coordinate' ? 48 : 70} /><SkeletonBlock height={panel === 'coordinate' ? 48 : 70} /><SkeletonBlock height={52} borderRadius={16} />{panel === 'coordinate' && <><SkeletonBlock width="80%" height={24} /><SkeletonBlock height={88} borderRadius={16} /></>}</>}
  </Skeleton>;
}

export function AgreementActionBar({ view, canConfirm, readOnly, busy, disabled, onConfirm, inline = false }: {
  view: AgreementPresentation; canConfirm: boolean; readOnly: boolean; busy: boolean; disabled: boolean; onConfirm: () => void; inline?: boolean;
}) {
  if (view.terminal || readOnly) return null;
  if (inline) {
    const blocked = disabled || busy || !canConfirm || view.mineConfirmed;
    return <View style={{ gap: 12, marginTop: 4 }}><Text style={detailUI.helper}>{copy.confirmHelp}</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: blocked, busy }} disabled={blocked} onPress={onConfirm}
        style={[ui.primary, { flexDirection: 'row', gap: 8 }, blocked && { backgroundColor: colors.tint }]}>
        {busy && <ActivityIndicator size="small" color={colors.primary} />}
        <Text style={[ui.primaryText, { flexShrink: 1, textAlign: 'center' }, blocked && { color: colors.primary }]}>{view.mineConfirmed ? `${copy.waiting(view.otherName)}…` : copy.confirm}</Text>
      </Pressable>
    </View>;
  }
  return <DetailActionBar flow neutralDisabled busy={busy} label={view.mineConfirmed ? `${copy.waiting(view.otherName)}…` : copy.confirm}
    helper={copy.confirmHelp} disabled={disabled || busy || !canConfirm || view.mineConfirmed} onPress={onConfirm} />;
}

const styles = StyleSheet.create({
  listSection: { gap: 14 }, listGroupTitle: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  listTabs: { flexDirection: 'row', backgroundColor: colors.tint, borderRadius: 16, padding: 4 },
  listTab: { minHeight: 44, flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8, borderRadius: 12 },
  listTabSelected: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 }, headerTitle: { flex: 1, minWidth: 0, fontSize: 20, lineHeight: 27, fontWeight: '800', color: colors.ink },
  menuButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  chip: { alignSelf: 'flex-start', maxWidth: '100%', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 }, chipText: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  success: { color: '#17613F', backgroundColor: '#E5F3EB' }, pending: { color: '#805C0A', backgroundColor: '#FFF4D9' },
  info: { color: colors.primary, backgroundColor: colors.tint }, neutral: { color: colors.muted, backgroundColor: colors.background },
  menuActions: { gap: 10 },
  menuAction: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 16, shadowColor: colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  menuActionDanger: { backgroundColor: '#FFF7F7', borderColor: '#FECACA' },
  menuIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EDF3F8', pointerEvents: 'none' },
  menuIconDanger: { backgroundColor: '#FEE2E2' }, menuLabel: { flex: 1, minWidth: 0, color: colors.primary, fontSize: 14, lineHeight: 20, fontWeight: '600' }, danger: { color: '#B91C1C' },
  amountRow: { borderTopWidth: 1, borderColor: colors.border, paddingTop: 12 },
  amount: { color: colors.primary, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  stepper: { flexDirection: 'row', paddingVertical: 2 },
  stepBody: { flex: 1, minWidth: 0, minHeight: 104, alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 4, position: 'relative' },
  stepLine: { position: 'absolute', top: 26, height: 2, backgroundColor: colors.inputBorder },
  stepLineLeft: { left: 0, right: '50%' }, stepLineRight: { left: '50%', right: 0 }, stepLineDone: { backgroundColor: colors.primary },
  step: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, zIndex: 1 },
  stepDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepCurrent: { backgroundColor: colors.primary, borderColor: colors.secondary, borderWidth: 3 }, stepChosen: { borderColor: colors.secondary, borderWidth: 3 },
  stepNumber: { color: colors.muted, fontSize: 15, fontWeight: '700' },
  stepLabel: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' }, stepLabelCurrent: { fontWeight: '700', color: colors.primary },
  stepPhase: { minHeight: 20, maxWidth: '100%', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 1, alignItems: 'center' },
  stepPhaseText: { color: colors.muted, fontSize: 11, lineHeight: 18, textAlign: 'center' },
  card: { minHeight: 44, backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 12 },
  cardHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, cardTitle: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 19, lineHeight: 26, fontWeight: '800' },
  cardHelper: { color: colors.muted, fontSize: 13, lineHeight: 20 }, cardFooter: { gap: 4, borderTopWidth: 1, borderColor: colors.border, paddingTop: 10 },
  skeletonPeople: { flexDirection: 'row', gap: 12 }, skeletonPerson: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }, skeletonStep: { flex: 1, alignItems: 'center', gap: 8, paddingVertical: 10 },
});
