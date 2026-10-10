import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { createCommunityActivity, createOfficialEvent, previewActivitySeries, createActivitySeries } from '../api/activitiesApi';
import type { ActivityDetail, ActivityLocationQuery } from '../types/activity';
import { validateActivityDraft, type ActivityLocationOption, type ActivityDraft } from '../types/creation';
import { ActivityFields } from './ActivityFields';
import { RECURRENCE_LABELS, recurrenceDraftRule, type ActivityRecurrenceRule, type ActivityRecurrencePreview } from '../types/recurrence';

export function CreateActivityForm({ locations, initialLocation, onCancel, onCreated, official = false }: {
  locations: ActivityLocationOption[]; initialLocation: ActivityLocationQuery;
  onCancel: () => void; onCreated: (activity: ActivityDetail) => void; official?: boolean;
}) {
  const { identity, refreshIdentity } = useAuth();
  const [draft, setDraft] = useState<ActivityDraft>({ title: '', description: '', startDate: '', startTime: '',
    endDate: '', endTime: '', buildingKey: initialLocation.buildingKey ?? '', floorKey: initialLocation.floorKey ?? '',
    poiKey: initialLocation.poiKey ?? '', customLabel: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<ActivityRecurrenceRule['frequency']>('WEEKLY');
  const [interval, setInterval] = useState('1'); const [until, setUntil] = useState(''); const [excludedDates, setExcludedDates] = useState('');
  const [timeZone] = useState(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } });
  const [preview, setPreview] = useState<ActivityRecurrencePreview | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const change = (field: keyof ActivityDraft, value: string) => {
    setDraft(current => ({ ...current, [field]: value,
      ...(field === 'buildingKey' ? { floorKey: '', poiKey: '' } : field === 'floorKey' ? { poiKey: '' } : {}) }));
    setError(null);
    setPreview(null);
  };
  const publish = async (previewOnly = false) => {
    if (request.current || !identity) return;
    const parsed = validateActivityDraft(draft, locations);
    if (parsed.error) { setError(parsed.error); return; }
    const recurrence = recurring ? recurrenceDraftRule(frequency, interval, until, excludedDates, timeZone) : null;
    if (recurrence?.error) { setError(recurrence.error); return; }
    if (recurring && !previewOnly && !preview) { setError('Revisa las fechas de la vista previa antes de publicar.'); return; }
    const abort = new AbortController(); request.current = abort;
    setSubmitting(true); setError(null);
    try {
      if (recurrence?.rule) {
        const input = { ...parsed.input!, recurrence: recurrence.rule };
        if (previewOnly) {
          const result = await previewActivitySeries(identity.campusId, input, official, abort.signal);
          if (!abort.signal.aborted) setPreview(result);
        } else {
          const result = await createActivitySeries(identity.campusId, { ...input, previewHash: preview!.previewHash }, official, abort.signal);
          if (!abort.signal.aborted) onCreated(result.firstOccurrence);
        }
      } else {
        const created = await (official ? createOfficialEvent : createCommunityActivity)(identity.campusId, parsed.input!, abort.signal);
        if (!abort.signal.aborted) onCreated(created);
      }
    } catch (reason) {
      if (abort.signal.aborted) return;
      if (reason instanceof AuthApiError && [400, 409].includes(reason.status)) setPreview(null);
      setError(reason instanceof AuthApiError && [400, 409].includes(reason.status)
        ? reason.serverMessage ?? 'Revisa las fechas y la ubicación: deben seguir vigentes. Si el lugar cambió, vuelve a abrir el mapa.'
        : reason instanceof AuthApiError && [401, 403].includes(reason.status)
          ? official ? 'Necesitas una cuenta activa y permiso para publicar eventos oficiales en tu campus.'
            : 'Necesitas una cuenta institucional verificada y activa para publicar.'
          : previewOnly ? 'No se pudo generar la vista previa. Reintenta.'
            : 'No se pudo confirmar la publicación. Actualiza el listado antes de reintentar para comprobar si se creó.');
      if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) refreshIdentity();
    } finally {
      if (!abort.signal.aborted) setSubmitting(false);
      if (request.current === abort) request.current = null;
    }
  };
  const units = { DAILY: { plural: 'días', single: 'día', label: 'Repetir cada cuántos días' },
    WEEKLY: { plural: 'semanas', single: 'semana', label: 'Repetir cada cuántas semanas' },
    MONTHLY: { plural: 'meses', single: 'mes', label: 'Repetir cada cuántos meses' } }[frequency];
  const recurrenceChange = (action: () => void) => { action(); setPreview(null); setError(null); };
  return <View style={styles.form}>
    <Text accessibilityRole="header" style={styles.heading}>{official ? 'Publicar evento oficial' : 'Crear actividad comunitaria'}</Text>
    <Text style={styles.text}>{official ? 'Se publicará como evento oficial de tu campus. Serás el primer participante.'
      : 'Se publicará en tu campus. Serás organizador y primer participante.'}</Text>
    <ActivityFields draft={draft} change={change} disabled={submitting} locations={locations}
      organizer={identity?.profile.nombre_completo} firstOccurrence={recurring} />
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: recurring, disabled: submitting }} disabled={submitting}
      onPress={() => recurrenceChange(() => setRecurring(value => !value))} style={styles.choice}>
      <Text style={styles.label}>{recurring ? '✓ ' : ''}Repetir como serie</Text>
    </Pressable>
    {recurring ? <View style={styles.form}>
      <Text style={styles.label}>Frecuencia</Text><View style={styles.choices}>
        {(['DAILY', 'WEEKLY', 'MONTHLY'] as const).map(value => <Pressable key={value} accessibilityRole="radio"
          accessibilityState={{ selected: frequency === value, disabled: submitting }} disabled={submitting}
          onPress={() => recurrenceChange(() => setFrequency(value))} style={[styles.choice, frequency === value && styles.selected]}>
          <Text style={frequency === value ? styles.selectedText : styles.text}>{RECURRENCE_LABELS[value]}</Text>
        </Pressable>)}
      </View>
      <Text style={styles.label}>{units.label} (1–52)</Text>
      <TextInput accessibilityLabel={units.label} keyboardType="number-pad" value={interval} maxLength={2} editable={!submitting}
        onChangeText={value => recurrenceChange(() => setInterval(value))} style={styles.input} />
      <Text style={styles.text}>1 = cada {units.single}; 2 = cada dos {units.plural}.</Text>
      <Text style={styles.label}>Repetir hasta el</Text>
      <TextInput accessibilityLabel="Repetir hasta el" placeholder="DD/MM/AAAA" value={until} maxLength={10} editable={!submitting}
        onChangeText={value => recurrenceChange(() => setUntil(value))} style={styles.input} />
      <Text style={styles.text}>No se crearán actividades que comiencen después de esta fecha. Ese día se incluye si coincide con la repetición.</Text>
      <Text style={styles.label}>Fechas que no se realizarán (opcional)</Text>
      <Text style={styles.text}>Permite saltar una actividad, por ejemplo, por un feriado. Déjalo vacío si se realizarán todas. Separa las fechas por comas.</Text>
      <TextInput accessibilityLabel="Fechas que no se realizarán" placeholder="DD/MM/AAAA, DD/MM/AAAA" value={excludedDates} multiline maxLength={2400} editable={!submitting}
        onChangeText={value => recurrenceChange(() => setExcludedDates(value))} style={styles.input} />
      <Text style={styles.text}>Zona horaria: {timeZone || 'No disponible'}. Mantiene la hora local. Máximo 200 ocurrencias y dos años.
        Los días mensuales inexistentes se omiten; las horas ambiguas o inexistentes por cambio horario requieren ajustar la regla.</Text>
    </View> : null}
    {recurring ? <Pressable accessibilityRole="button" disabled={submitting} onPress={() => { void publish(true); }} style={styles.cancel}>
      <Text style={styles.label}>{submitting ? 'Procesando…' : 'Ver fechas antes de publicar'}</Text>
    </Pressable> : null}
    {recurring && preview ? <View style={styles.form}>
      <Text accessibilityRole="header" style={styles.heading}>Vista previa: {preview.occurrences.length} ocurrencias</Text>
      <Text style={styles.text}>Revisa todas las fechas. Te inscribirás como organizador en cada ocurrencia.</Text>
      {preview.occurrences.map(value => <Text key={value.index} style={styles.text}>{value.index}. {new Date(value.startAt).toLocaleString('es-CL', { timeZone })}
        {' — '}{new Date(value.endAt).toLocaleString('es-CL', { timeZone })}</Text>)}
      {preview.skipped.map(value => <Text key={value.date} style={styles.text}>{value.date}: {value.reason === 'EXCLUDED' ? 'fecha excluida' : 'día inexistente omitido'}.</Text>)}
    </View> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: submitting || (recurring && !preview) }}
      disabled={submitting || (recurring && !preview)} onPress={() => { void publish(); }} style={[styles.publish, (submitting || (recurring && !preview)) && { opacity: 0.5 }]}>
      {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.selectedText}>{recurring ? `Publicar serie${preview ? ` (${preview.occurrences.length})` : ''}`
        : official ? 'Publicar evento oficial' : 'Publicar actividad'}</Text>}
    </Pressable>
    <Pressable accessibilityRole="button" disabled={submitting} onPress={onCancel} style={styles.cancel}><Text style={styles.text}>Volver a las actividades</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  form: { gap: 12, paddingVertical: 12 }, heading: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  field: { gap: 6 }, label: { fontWeight: '600', color: '#0F172A' }, text: { color: '#475569', lineHeight: 21 },
  input: { borderWidth: 1, borderColor: '#94A3B8', borderRadius: 8, padding: 12, color: '#0F172A' },
  description: { minHeight: 100, textAlignVertical: 'top' }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderColor: '#94A3B8', borderRadius: 8, padding: 10 },
  selected: { backgroundColor: '#0B6E75', borderColor: '#0B6E75' }, selectedText: { color: '#FFFFFF', fontWeight: '600' },
  error: { color: '#B91C1C', lineHeight: 21 }, publish: { backgroundColor: '#0B6E75', padding: 14, borderRadius: 8, alignItems: 'center' },
  cancel: { paddingVertical: 12, alignItems: 'center' },
});
