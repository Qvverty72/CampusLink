import { APP_COLORS } from '@/types/colors';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { createCommunityActivity, createOfficialEvent, previewActivitySeries, createActivitySeries, fetchCommunityActivityCreationAvailability } from '../api/activitiesApi';
import type { ActivityDetail, ActivityLocationQuery } from '../types/activity';
import { isActivityDescriptionAllowed, validateActivityDraft, type ActivityLocationOption, type ActivityDraft, type CommunityActivityCreationAvailability } from '../types/creation';
import { ActivityFields } from './ActivityFields';
import { ActivityRecurrencePicker } from './ActivityRecurrencePicker';
import { recurrenceDraftRule, type ActivityRecurrenceDraft, type ActivityRecurrencePreview } from '../types/recurrence';

export function CreateActivityForm({ locations, initialLocation, onCreated, official = false }: {
  locations: ActivityLocationOption[]; initialLocation: ActivityLocationQuery;
  onCreated: (activity: ActivityDetail) => void; official?: boolean;
}) {
  const { identity, refreshIdentity } = useAuth();
  const allowCustomDescription = identity?.capabilities.officialActivities === true;
  const canCreateRecurring = identity?.capabilities.officialActivities === true;
  const requiresAvailability = !official && !canCreateRecurring;
  const [availabilityRevision, setAvailabilityRevision] = useState(0);
  const availabilityKey = JSON.stringify([identity?.profile.id, identity?.campusId, requiresAvailability, availabilityRevision]);
  const [availabilityState, setAvailabilityState] = useState<{ key: string; data: CommunityActivityCreationAvailability | null; error: string | null }>({ key: '', data: null, error: null });
  const availability = availabilityState.key === availabilityKey ? availabilityState.data : null;
  const availabilityError = availabilityState.key === availabilityKey ? availabilityState.error : null;
  useEffect(() => {
    if (!requiresAvailability || !identity?.campusId) return;
    const abort = new AbortController();
    setAvailabilityState({ key: availabilityKey, data: null, error: null });
    void fetchCommunityActivityCreationAvailability(identity.campusId, abort.signal).then(data => {
      if (!abort.signal.aborted) setAvailabilityState({ key: availabilityKey, data, error: null });
    }).catch(reason => {
      if (abort.signal.aborted) return;
      if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) refreshIdentity();
      setAvailabilityState({ key: availabilityKey, data: null, error: 'No se pudo comprobar si puedes crear una actividad. Intenta nuevamente.' });
    });
    return () => abort.abort();
  }, [availabilityKey, requiresAvailability, identity?.campusId, refreshIdentity]);
  const [draft, setDraft] = useState<ActivityDraft>({ title: '', description: '', startDate: '', startTime: '',
    endDate: '', endTime: '', buildingKey: initialLocation.buildingKey ?? '', floorKey: initialLocation.floorKey ?? '',
    poiKey: initialLocation.poiKey ?? '', customLabel: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [recurrenceDraft, setRecurrenceDraft] = useState<ActivityRecurrenceDraft>({
    enabled: false, frequency: 'WEEKLY', interval: '1', until: '', excludedDates: '',
  });
  const { enabled: recurring, frequency, interval, until, excludedDates, weekdays } = recurrenceDraft;
  const [timeZone] = useState(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } });
  const [preview, setPreview] = useState<ActivityRecurrencePreview | null>(null);
  const [showPreviewDates, setShowPreviewDates] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (canCreateRecurring) return;
    setRecurrenceDraft(current => current.enabled ? { ...current, enabled: false } : current);
    setPreview(null); setShowPreviewDates(false);
  }, [canCreateRecurring]);
  const change = (field: keyof ActivityDraft, value: string) => {
    setDraft(current => ({ ...current, [field]: value,
      ...(field === 'buildingKey' ? { floorKey: '', poiKey: '' } : field === 'floorKey' ? { poiKey: '' } : {}) }));
    setError(null);
    setPreview(null);
    setShowPreviewDates(false);
  };
  const publish = async (previewOnly = false) => {
    if (request.current || !identity) return;
    if (requiresAvailability && !availability?.canCreate) return;
    if (recurring && !canCreateRecurring) { setError('Necesitas permiso para publicar eventos oficiales en tu campus para crear una serie.'); return; }
    if (!isActivityDescriptionAllowed(draft.description, allowCustomDescription)) { setError('Selecciona una descripción para la actividad.'); return; }
    const parsed = validateActivityDraft(draft, locations);
    if (parsed.error) { setError(parsed.error); return; }
    const recurrence = recurring ? recurrenceDraftRule(frequency, interval, until, excludedDates, timeZone, weekdays) : null;
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
          ? official || recurring ? 'Necesitas una cuenta activa y permiso para publicar eventos oficiales en tu campus.'
            : 'Necesitas una cuenta institucional verificada y activa para publicar.'
          : previewOnly ? 'No se pudo generar la vista previa. Reintenta.'
            : 'No se pudo confirmar la publicación. Actualiza el listado antes de reintentar para comprobar si se creó.');
      if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) refreshIdentity();
      if (reason instanceof AuthApiError && reason.status === 409 && !official && !recurring) {
        setAvailabilityRevision(previous => previous + 1); refreshIdentity();
      }
    } finally {
      if (!abort.signal.aborted) setSubmitting(false);
      if (request.current === abort) request.current = null;
    }
  };
  const preparePreview = useCallback(async (value: ActivityRecurrenceDraft, signal: AbortSignal) => {
    if (!identity) throw new Error('Vuelve a iniciar sesión para calcular las fechas.');
    if (!identity.capabilities.officialActivities) throw new Error('Necesitas permiso para publicar eventos oficiales en tu campus para crear una serie.');
    const base = validateActivityDraft(draft, locations);
    const recurrence = recurrenceDraftRule(value.frequency, value.interval, value.until, value.excludedDates, timeZone, value.weekdays);
    if (!base.input || !recurrence.rule) throw new Error(base.error ?? recurrence.error ?? 'Completa los datos de la actividad.');
    if (!isActivityDescriptionAllowed(draft.description, allowCustomDescription)) throw new Error('Selecciona una descripción válida.');
    try { return await previewActivitySeries(identity.campusId, { ...base.input, recurrence: recurrence.rule }, official, signal); }
    catch (reason) {
      if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) refreshIdentity();
      throw new Error(reason instanceof AuthApiError && [400, 409].includes(reason.status)
        ? reason.serverMessage ?? 'Revisa las fechas de la repetición.'
        : reason instanceof AuthApiError && [401, 403].includes(reason.status)
          ? 'Necesitas una cuenta activa y permiso para publicar eventos oficiales en tu campus.' : 'No se pudieron calcular las fechas. Reintenta.');
    }
  }, [draft, locations, identity, timeZone, official, allowCustomDescription, refreshIdentity]);
  const canPreview = !!identity && !!validateActivityDraft(draft, locations).input && isActivityDescriptionAllowed(draft.description, allowCustomDescription);
  if (requiresAvailability && !availability?.canCreate) return <View style={styles.form}>
    <Text accessibilityRole="header" style={styles.heading}>Crear actividad comunitaria</Text>
    {availability ? <>
      <Text accessibilityRole="alert" style={styles.text}>{availability.message}</Text>
      <Text style={styles.text}>Espera a que termine o elimina la actividad que ya publicaste para crear otra.</Text>
    </> : availabilityError ? <Text accessibilityRole="alert" style={styles.error}>{availabilityError}</Text>
      : <><ActivityIndicator color={APP_COLORS.PRIMARY} /><Text style={styles.text}>Comprobando tus actividades…</Text></>}
    {availability || availabilityError ? <Pressable accessibilityRole="button" onPress={() => setAvailabilityRevision(previous => previous + 1)} style={styles.cancel}>
      <Text style={styles.label}>{availability ? 'Comprobar de nuevo' : 'Reintentar'}</Text>
    </Pressable> : null}
  </View>;
  return <View style={styles.form}>
    <Text accessibilityRole="header" style={styles.heading}>{official ? 'Publicar evento oficial' : 'Crear actividad comunitaria'}</Text>
    <Text style={styles.text}>{official ? 'Se publicará como evento oficial de tu campus. Serás el primer participante.'
      : 'Se publicará en tu campus. Serás organizador y primer participante.'}</Text>
    <ActivityFields draft={draft} change={change} disabled={submitting} locations={locations}
      organizer={identity?.profile.nombre_completo} firstOccurrence={recurring} creationLocation={initialLocation}
      allowCustomDescription={allowCustomDescription} />
    {canCreateRecurring ? <ActivityRecurrencePicker value={recurrenceDraft} disabled={submitting} timeZone={timeZone}
      startDate={draft.startDate} onPreview={canPreview ? preparePreview : undefined}
      previewContext={JSON.stringify([draft, locations, identity?.campusId, official, allowCustomDescription])}
      onChange={(value, reviewed) => { setRecurrenceDraft(value); setPreview(reviewed ?? null); setShowPreviewDates(false); setError(null); }} /> : null}
    {recurring && !preview ? <Pressable accessibilityRole="button" disabled={submitting} onPress={() => { void publish(true); }} style={styles.cancel}>
      <Text style={styles.label}>{submitting ? 'Procesando…' : 'Ver fechas antes de publicar'}</Text>
    </Pressable> : null}
    {recurring && preview ? <View style={styles.form}>
      <Text style={styles.text}>{preview.occurrences.length === 1 ? 'Se creará 1 actividad.' : `Se crearán ${preview.occurrences.length} actividades.`} Serás participante en cada una.</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showPreviewDates }} aria-expanded={showPreviewDates}
        onPress={() => setShowPreviewDates(value => !value)} style={styles.cancel}><Text style={styles.label}>{showPreviewDates ? 'Ocultar fechas' : 'Ver fechas de la serie'}</Text></Pressable>
      {showPreviewDates ? <>{preview.occurrences.map(value => <Text key={value.index} style={styles.text}>{value.index}. {new Date(value.startAt).toLocaleString('es-CL', { timeZone })}
        {' — '}{new Date(value.endAt).toLocaleString('es-CL', { timeZone })}</Text>)}
      {preview.skipped.map(value => <Text key={value.date} style={styles.text}>{value.date}: {value.reason === 'EXCLUDED' ? 'fecha excluida' : 'día inexistente omitido'}.</Text>)}</> : null}
    </View> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: submitting || (recurring && !preview) }}
      disabled={submitting || (recurring && !preview)} onPress={() => { void publish(); }} style={[styles.publish, (submitting || (recurring && !preview)) && { opacity: 0.5 }]}>
      {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.selectedText}>{recurring ? `Publicar serie${preview ? ` (${preview.occurrences.length})` : ''}`
        : official ? 'Publicar evento oficial' : 'Publicar actividad'}</Text>}
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  form: { gap: 12, paddingVertical: 12 }, heading: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  label: { fontWeight: '600', color: '#0F172A' }, text: { color: '#475569', lineHeight: 21 },
  selectedText: { color: '#FFFFFF', fontWeight: '600' },
  error: { color: '#B91C1C', lineHeight: 21 }, publish: { backgroundColor: APP_COLORS.PRIMARY, padding: 14, borderRadius: 8, alignItems: 'center' },
  cancel: { paddingVertical: 12, alignItems: 'center' },
});
