import { APP_COLORS } from '@/types/colors';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, ChevronRight, type LucideIcon } from 'lucide-react-native';
import { ActivityDateTimeField } from './ActivityDateTimeField';
import { RECURRENCE_WEEKDAYS, recurrenceDateLabel, recurrenceDescription, recurrenceDraftRule, recurrenceStartWeekday, recurrenceSummary,
  type ActivityRecurrenceDraft, type ActivityRecurrencePreview } from '../types/recurrence';

type PreviewState = { key: string; data: ActivityRecurrencePreview | null; loading: boolean; error: string | null };
function Icon({ icon: Glyph, size = 20, color = APP_COLORS.PRIMARY }: { icon: LucideIcon; size?: number; color?: string }) {
  return <View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ pointerEvents: 'none' }}>
    <Glyph size={size} color={color} strokeWidth={1.8} />
  </View>;
}

/** Stage a simple rule and review authoritative dates before handing its hash to creation. */
export function ActivityRecurrencePicker({ value, onChange, disabled, timeZone, startDate, onPreview, previewContext = '' }: {
  value: ActivityRecurrenceDraft; onChange: (value: ActivityRecurrenceDraft, preview?: ActivityRecurrencePreview) => void;
  disabled: boolean; timeZone: string; startDate: string;
  onPreview?: (value: ActivityRecurrenceDraft, signal: AbortSignal) => Promise<ActivityRecurrencePreview>;
  previewContext?: string;
}) {
  const [open, setOpen] = useState(false);
  const [temporary, setTemporary] = useState(value);
  const [showDates, setShowDates] = useState(false);
  const [previewState, setPreviewState] = useState<PreviewState>({ key: '', data: null, loading: false, error: null });
  const [previewRevision, setPreviewRevision] = useState(0);
  const parsed = recurrenceDraftRule(temporary.frequency, temporary.interval, temporary.until, temporary.excludedDates, timeZone, temporary.weekdays);
  const key = JSON.stringify([temporary.enabled, parsed.rule ?? temporary, timeZone, startDate, previewContext]);
  const current = previewState.key === key ? previewState : { data: null, loading: temporary.enabled && !!parsed.rule && !!onPreview, error: null };
  const cannotConfirm = disabled || (temporary.enabled && (!parsed.rule || (!!onPreview && !current.data)));
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!open || disabled || !temporary.enabled) return;
    if (!parsed.rule || !onPreview) { setPreviewState({ key, data: null, loading: false, error: null }); return; }
    const abort = new AbortController();
    setPreviewState({ key, data: null, loading: true, error: null });
    const timer = setTimeout(() => {
      void onPreview(temporary, abort.signal).then(data => {
        if (!abort.signal.aborted) setPreviewState({ key, data, loading: false, error: null });
      }).catch(reason => {
        if (!abort.signal.aborted) setPreviewState({ key, data: null, loading: false,
          error: reason instanceof Error ? reason.message : 'No se pudieron calcular las fechas. Intenta nuevamente.' });
      });
    }, 350);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [open, disabled, key, onPreview, previewRevision]);
  const change = (patch: Partial<ActivityRecurrenceDraft>) => {
    setTemporary(previous => ({ ...previous, ...patch })); setShowDates(false);
  };
  const close = () => { Keyboard.dismiss(); setOpen(false); };
  const show = () => {
    if (disabled) return;
    Keyboard.dismiss(); const day = recurrenceStartWeekday(startDate);
    setTemporary({ ...value, ...(value.enabled && value.frequency === 'WEEKLY' && value.weekdays === undefined ? { weekdays: day ? [day] : [] } : {}) });
    setShowDates(false); setOpen(true);
  };
  const select = (frequency: ActivityRecurrenceDraft['frequency'] | null) => {
    if (!frequency) { change({ enabled: false }); return; }
    const day = recurrenceStartWeekday(startDate);
    change({ enabled: true, frequency, interval: frequency === temporary.frequency ? temporary.interval : '1',
      weekdays: frequency === 'WEEKLY' ? temporary.weekdays ?? (day ? [day] : []) : undefined });
  };
  const apply = () => {
    if (cannotConfirm) return;
    const confirmed = temporary.enabled && parsed.rule ? { ...temporary, interval: String(parsed.rule.interval), weekdays: parsed.rule.weekdays } : temporary;
    if (JSON.stringify(confirmed) !== JSON.stringify(value) || (temporary.enabled && current.data)) onChange(confirmed, temporary.enabled ? current.data ?? undefined : undefined);
    close();
  };
  const options = [
    { frequency: null, label: 'No, solo una vez' },
    { frequency: 'DAILY', label: temporary.enabled && temporary.frequency === 'DAILY' && temporary.interval !== '1' ? `Sí, cada ${temporary.interval || '…'} días` : 'Sí, todos los días' },
    { frequency: 'WEEKLY', label: 'Sí, algunos días de la semana' },
    { frequency: 'MONTHLY', label: temporary.enabled && temporary.frequency === 'MONTHLY' && temporary.interval !== '1' ? `Sí, cada ${temporary.interval || '…'} meses` : 'Sí, una vez al mes' },
  ] as const;
  return <View style={styles.field}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Repetir" accessibilityValue={{ text: recurrenceSummary(value) }}
      accessibilityState={{ disabled, expanded: open }} aria-expanded={open} disabled={disabled} onPress={show} activeOpacity={0.75}
      style={[styles.trigger, disabled && styles.disabled]}>
      <Text style={styles.triggerLabel}>Repetir</Text><View style={styles.triggerValue}><Text style={styles.value}>{recurrenceSummary(value)}</Text><Icon icon={ChevronRight} color="#64748B" /></View>
    </TouchableOpacity>
    {value.enabled ? <Text style={styles.caption}>Hasta el {recurrenceDateLabel(value.until)}</Text> : null}
    {open && !disabled ? <Modal visible transparent animationType="fade" presentationStyle="overFullScreen" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <View style={styles.panel} accessibilityViewIsModal onAccessibilityEscape={close}>
          <View style={styles.header}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancelar repetición" onPress={close} style={styles.headerAction}><Text style={styles.link}>Cancelar</Text></TouchableOpacity>
            <Text accessibilityRole="header" style={styles.heading}>Repetición</Text><View style={styles.headerSpacer} />
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text accessibilityRole="header" style={styles.question}>¿Esta actividad se repite?</Text>
            <View style={styles.field} accessibilityRole="radiogroup" accessibilityLabel="¿Esta actividad se repite?">
              {options.map(option => {
                const selected = option.frequency === null ? !temporary.enabled : temporary.enabled && temporary.frequency === option.frequency;
                return <View key={option.frequency ?? 'once'} style={styles.field}>
                  <TouchableOpacity accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: selected }} aria-checked={selected}
                    onPress={() => select(option.frequency)} style={[styles.option, selected && styles.selectedOption]}>
                    <View accessible={false} aria-hidden style={[styles.radio, selected && styles.selectedRadio]}>{selected ? <Icon icon={Check} size={13} color="#FFFFFF" /> : null}</View>
                    <Text style={[styles.optionLabel, selected && styles.selectedLabel]}>{option.label}</Text>
                  </TouchableOpacity>
                  {option.frequency === 'WEEKLY' && selected ? <View style={styles.field}>
                    <Text style={styles.caption}>Toca los días que quieras:</Text>
                    <View style={styles.weekdays}>
                      {RECURRENCE_WEEKDAYS.map(day => {
                        const checked = temporary.weekdays?.includes(day.value) ?? false;
                        return <TouchableOpacity key={day.value} accessibilityRole="checkbox" accessibilityLabel={day.name}
                          accessibilityState={{ checked }} aria-checked={checked} onPress={() => change({ weekdays: checked
                            ? temporary.weekdays!.filter(value => value !== day.value) : [...temporary.weekdays ?? [], day.value].sort((a, b) => a - b) })}
                          style={[styles.day, checked && styles.selectedDay]}><Text style={[styles.dayText, checked && styles.selectedDayText]}>{day.short}</Text></TouchableOpacity>;
                      })}
                    </View>
                  </View> : null}
                </View>;
              })}
            </View>
            {temporary.enabled ? <View style={styles.section}>
              <ActivityDateTimeField label="¿Hasta cuándo?" mode="date" value={temporary.until} disabled={disabled}
                displayValue={temporary.until ? `Hasta el ${recurrenceDateLabel(temporary.until)}` : undefined} onChange={until => change({ until })} />
            </View> : null}
            <View style={[styles.summary, (!temporary.enabled || current.data) && styles.readySummary]} accessibilityLiveRegion="polite">
              <Text style={[styles.summaryLabel, (!temporary.enabled || current.data) && styles.readyText]}>Así quedará:</Text>
              <Text style={[styles.summaryText, (!temporary.enabled || current.data) && styles.readyText]}>{recurrenceDescription(temporary, startDate, current.data?.occurrences.length)}</Text>
              {temporary.enabled ? <>
                {current.loading ? <View style={styles.loading}><ActivityIndicator size="small" color={APP_COLORS.PRIMARY} /><Text style={styles.caption}>Calculando las fechas…</Text></View>
                  : current.error ? <><Text accessibilityRole="alert" style={styles.error}>{current.error}</Text>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Reintentar cálculo de fechas" onPress={() => setPreviewRevision(previous => previous + 1)} style={styles.detailsButton}><Text style={styles.link}>Reintentar</Text></TouchableOpacity></>
                    : !parsed.rule ? <Text style={styles.caption}>{!temporary.until ? 'Elige hasta cuándo se repite.' : parsed.error}</Text>
                      : !onPreview ? <Text style={styles.caption}>Completa los datos y las fechas de la actividad para ver el total.</Text> : null}
                {current.data ? <>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ver fechas de la serie" accessibilityState={{ expanded: showDates }} aria-expanded={showDates}
                    onPress={() => setShowDates(previous => !previous)} style={styles.detailsButton}><Text style={styles.link}>{showDates ? 'Ocultar fechas' : 'Ver todas las fechas'}</Text></TouchableOpacity>
                  {showDates ? <View style={styles.field}>
                    {current.data.occurrences.map(occurrence => <Text key={occurrence.index} style={styles.caption}>{occurrence.index}. {new Date(occurrence.startAt).toLocaleString('es-CL', { timeZone })} — {new Date(occurrence.endAt).toLocaleString('es-CL', { timeZone })}</Text>)}
                    {current.data.skipped.map(skipped => <Text key={skipped.date} style={styles.caption}>{skipped.date}: {skipped.reason === 'EXCLUDED' ? 'fecha omitida' : 'día inexistente en ese mes'}.</Text>)}
                  </View> : null}
                </> : null}
              </> : null}
            </View>
          </ScrollView>
          <View style={styles.footer}>
            <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: cannotConfirm }} disabled={cannotConfirm} onPress={apply}
              style={[styles.confirm, cannotConfirm && styles.disabled]}><Text style={styles.confirmText}>Listo</Text></TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal> : null}
  </View>;
}

const styles = StyleSheet.create({
  field: { gap: 8, minWidth: 0 }, trigger: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, padding: 16, backgroundColor: '#FFFFFF' },
  triggerLabel: { fontSize: 15, fontWeight: '600', color: '#0F172A' }, triggerValue: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }, value: { color: '#64748B', fontSize: 14, flexShrink: 1, textAlign: 'right' },
  caption: { color: '#64748B', fontSize: 13, lineHeight: 20 }, link: { color: APP_COLORS.PRIMARY, fontWeight: '600', fontSize: 14 }, disabled: { opacity: 0.4 },
  overlay: { flex: 1, width: '100%', minWidth: 0, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 16 }, panel: { width: '100%', minWidth: 0, maxWidth: 480, maxHeight: '90%', borderRadius: 20, overflow: 'hidden', backgroundColor: '#FFFFFF', flexShrink: 1 },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }, headerAction: { minHeight: 44, width: 80, justifyContent: 'center' }, headerSpacer: { width: 80 }, heading: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#0F172A' },
  scroll: { flexShrink: 1 }, content: { padding: 16, gap: 14 }, question: { fontSize: 15, fontWeight: '600', color: '#0F172A' }, option: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12 }, selectedOption: { borderColor: APP_COLORS.PRIMARY, backgroundColor: '#EDF5FC' },
  optionLabel: { color: '#334155', fontSize: 14, flexShrink: 1 }, selectedLabel: { color: APP_COLORS.PRIMARY, fontWeight: '600' }, radio: { width: 21, height: 21, borderRadius: 11, borderWidth: 1.5, borderColor: '#94A3B8', alignItems: 'center', justifyContent: 'center' }, selectedRadio: { backgroundColor: APP_COLORS.PRIMARY, borderColor: APP_COLORS.PRIMARY },
  weekdays: { flexDirection: 'row', gap: 4 }, day: { flex: 1, minWidth: 0, minHeight: 44, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, selectedDay: { backgroundColor: APP_COLORS.PRIMARY, borderColor: APP_COLORS.PRIMARY }, dayText: { color: '#475569', fontSize: 11, fontWeight: '600' }, selectedDayText: { color: '#FFFFFF' },
  section: { marginTop: 4 }, summary: { backgroundColor: '#F1F5F9', borderRadius: 12, padding: 14, gap: 8 }, readySummary: { backgroundColor: '#EEF8F0' }, summaryLabel: { color: '#475569', fontSize: 12, fontWeight: '600' }, summaryText: { color: '#334155', fontSize: 14, lineHeight: 22, fontWeight: '600' }, readyText: { color: '#166534' }, loading: { flexDirection: 'row', alignItems: 'center', gap: 8 }, detailsButton: { minHeight: 44, justifyContent: 'center' },
  footer: { padding: 16, gap: 8, borderTopWidth: 1, borderTopColor: '#E2E8F0' }, confirm: { minHeight: 48, backgroundColor: APP_COLORS.PRIMARY, borderRadius: 12, padding: 12, alignItems: 'center', justifyContent: 'center' }, confirmText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' }, error: { color: '#B91C1C', fontSize: 13, lineHeight: 19 },
});
