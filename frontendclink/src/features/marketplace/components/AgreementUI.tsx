import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, Check, ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react-native';
import { CATALOG_COLORS as colors, FilterSheet, ui } from './CatalogUI';
import { DetailActionBar, detailUI } from './ResourceDetailUI';
import { transactionDate } from './TransactionUI';
import { agreementCopy as copy, type AgreementPresentation, type AgreementUIState } from '../utils/agreementPresentation';

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

export function AgreementMenu({ visible, onClose, actions }: { visible: boolean; onClose: () => void; actions: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }[] }) {
  return <FilterSheet compact visible={visible} title={copy.menu} confirmLabel={copy.back} onClose={onClose}>
    {actions.map(action => <Pressable key={action.label} accessibilityRole="button" disabled={action.disabled} accessibilityState={{ disabled: Boolean(action.disabled) }}
      onPress={() => { onClose(); action.onPress(); }} style={[styles.menuAction, action.disabled && ui.disabled]}>
      <Text style={[detailUI.body, action.danger && styles.danger]}>{action.label}</Text><ChevronRight size={16} color={action.danger ? '#9D302A' : colors.secondary} />
    </Pressable>)}
  </FilterSheet>;
}

export function AgreementSummary({ view, modality, amount, currency, campus, resourceStatus, startedAt, completedAt, cancelledAt }: {
  view: AgreementPresentation; modality: string; amount: number | null; currency: string; campus: string; resourceStatus: string; startedAt: string; completedAt: string | null; cancelledAt: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const price = modality === 'DONACION' ? copy.donation : `$${amount?.toLocaleString('es-CL')} ${currency}`;
  return <View style={detailUI.card}>
    <View style={styles.summaryHeading}><View style={styles.role}><Text style={styles.roleText}>{view.roleLabel}</Text></View><Text style={styles.amount}>{price}</Text></View>
    <Text style={detailUI.helper}>{copy.resourceState(campus, resourceStatus)}</Text>
    <AgreementStatusChip state={view.state} label={view.label} />
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} aria-expanded={expanded} onPress={() => setExpanded(value => !value)} style={styles.accordion}>
      <Text style={[detailUI.helper, { flex: 1 }]}>{copy.original}</Text><ChevronDown size={17} color={colors.primary} />
    </Pressable>
    {expanded && <View style={{ gap: 6 }}><Text style={detailUI.body}>{price}</Text><Text style={detailUI.helper}>{copy.started(transactionDate(startedAt))}</Text>
      {completedAt && <Text style={detailUI.helper}>{copy.closed(transactionDate(completedAt))}</Text>}
      {cancelledAt && <Text style={detailUI.helper}>{copy.closed(transactionDate(cancelledAt))}</Text>}
    </View>}
  </View>;
}

export type AgreementStep = 'accepted' | 'coordinate' | 'confirm';

export function AgreementStepper({ state, digital = false, selected, onSelect, disabled = false }: {
  state: AgreementUIState; digital?: boolean; selected?: AgreementStep; onSelect?: (step: AgreementStep) => void; disabled?: boolean;
}) {
  if (state === 'CANCELADO' && !onSelect) return null;
  const completed = state === 'FINALIZADO', cancelled = state === 'CANCELADO';
  const steps: { id: AgreementStep; label: string }[] = [{ id: 'accepted', label: copy.acceptedStep }, ...(!digital ? [{ id: 'coordinate' as const, label: copy.coordinateStep }] : []), { id: 'confirm', label: copy.confirmStep }];
  return <View style={styles.stepper}>{steps.map(({ id, label }, index) => {
    const current = !cancelled && !completed && index === (state === 'COORDINANDO' && !digital ? 1 : steps.length - 1);
    const done = index === 0 || completed || (!cancelled && state !== 'COORDINANDO' && index < steps.length - 1);
    const content = <><View style={[styles.step, (done || current) && styles.stepActive]}>
      {done ? <Check size={14} color={colors.surface} /> : <Text style={[styles.stepNumber, current && { color: colors.surface }]}>{index + 1}</Text>}
    </View><Text style={[detailUI.helper, { textAlign: 'center' }, (current || selected === id) && { fontWeight: '700', color: colors.primary }]}>{label}</Text></>;
    return onSelect ? <Pressable key={id} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={copy.openStep(label)}
      accessibilityState={{ selected: selected === id, expanded: selected === id, disabled }} disabled={disabled} onPress={() => onSelect(id)}
      style={[styles.stepBody, styles.stepButton, selected === id && styles.selectedStep, disabled && ui.disabled]}>{content}</Pressable>
      : <View key={id} style={styles.stepBody}>{content}</View>;
  })}</View>;
}

/** Toda la tarjeta abre el mismo acuerdo; el siguiente paso no es otro botón. */
export function AgreementCard({ title, roleLabel, campus, price, state, label, next, requiresAction, dateLabel, onPress }: {
  title: string; roleLabel: string; campus: string; price: string; state?: AgreementUIState; label: string; next?: string; requiresAction: boolean; dateLabel: string; onPress: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${roleLabel}. ${label}`} onPress={onPress} style={styles.card}>
    <View style={styles.cardHeading}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.cardPrice}>{price}</Text></View>
    <Text style={styles.cardHelper}>{roleLabel} · {campus}</Text><AgreementStatusChip state={state} label={label} />
    {next && <View style={requiresAction ? styles.next : undefined}><Text style={requiresAction ? styles.nextText : styles.cardHelper}>{next}</Text>{requiresAction && <ChevronRight size={17} color={colors.surface} />}</View>}
    <Text style={detailUI.helper}>{dateLabel}</Text>
  </Pressable>;
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 }, headerTitle: { flex: 1, minWidth: 0, fontSize: 20, lineHeight: 27, fontWeight: '800', color: colors.ink },
  menuButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  chip: { alignSelf: 'flex-start', maxWidth: '100%', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 }, chipText: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  success: { color: '#17613F', backgroundColor: '#E5F3EB' }, pending: { color: '#805C0A', backgroundColor: '#FFF4D9' },
  info: { color: colors.primary, backgroundColor: colors.tint }, neutral: { color: colors.muted, backgroundColor: colors.background },
  menuAction: { minHeight: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, danger: { color: '#9D302A' },
  summaryHeading: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  role: { backgroundColor: colors.primary, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, maxWidth: '100%' }, roleText: { color: colors.surface, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  amount: { color: colors.primary, fontSize: 20, lineHeight: 27, fontWeight: '800', flexShrink: 1 },
  accordion: { borderTopWidth: 1, borderColor: colors.border, paddingTop: 10, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepper: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 2 }, stepBody: { flex: 1, alignItems: 'center', gap: 7 },
  stepButton: { minHeight: 80, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 18, borderWidth: 1, borderColor: 'transparent' },
  selectedStep: { backgroundColor: colors.tint, borderColor: colors.inputBorder },
  step: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  stepActive: { backgroundColor: colors.primary, borderColor: colors.primary }, stepNumber: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  card: { minHeight: 44, backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 12 },
  cardHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, cardTitle: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 19, lineHeight: 26, fontWeight: '800' },
  cardPrice: { maxWidth: '45%', flexShrink: 1, fontSize: 20, lineHeight: 27, fontWeight: '800', color: colors.primary }, cardHelper: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  next: { backgroundColor: colors.primary, borderRadius: 14, padding: 12, minHeight: 44, flexDirection: 'row', gap: 10, alignItems: 'center' }, nextText: { flex: 1, color: colors.surface, fontSize: 13, lineHeight: 20, fontWeight: '700' },
});
