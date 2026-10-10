import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { previewActivityEdit, saveActivityEdit } from '../api/activitiesApi';
import type { ActivityDetail } from '../types/activity';
import type { ActivityDraft, ActivityLocationOption } from '../types/creation';
import { activityEditDraft, validateActivityEditDraft, type ActivityEditPreview, type EditActivityInput } from '../types/editing';
import { ActivityFields } from './ActivityFields';

export function EditActivityForm({ activity, locations, onCancel, onSaved }: {
  activity: ActivityDetail; locations: ActivityLocationOption[]; onCancel: () => void; onSaved: (count: number) => void;
}) {
  const { identity, refreshIdentity } = useAuth(); const [draft, setDraft] = useState(() => activityEditDraft(activity));
  const [scope, setScope] = useState<EditActivityInput['scope']>('ONE');
  const [preview, setPreview] = useState<ActivityEditPreview | null>(null); const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const change = (field: keyof ActivityDraft, value: string) => {
    setDraft(current => ({ ...current, [field]: value, ...(field === 'buildingKey' ? { floorKey: '', poiKey: '' } : field === 'floorKey' ? { poiKey: '' } : {}) }));
    setPreview(null); setError(null);
  };
  const submit = async (save = false) => {
    if (request.current || !identity) return;
    const parsed = validateActivityEditDraft(draft, activity, locations, scope);
    if (!parsed.input) { setError(parsed.error); return; }
    if (save && !preview) return;
    const abort = new AbortController(); request.current = abort; setBusy(true); setError(null);
    try {
      if (save) {
        const result = await saveActivityEdit(identity.campusId, activity.id, { ...parsed.input, previewHash: preview!.previewHash }, abort.signal);
        if (!abort.signal.aborted) onSaved(result.updatedCount);
      } else {
        const result = await previewActivityEdit(identity.campusId, activity.id, parsed.input, abort.signal);
        if (!abort.signal.aborted) setPreview(result);
      }
    } catch (reason) {
      if (abort.signal.aborted) return;
      setPreview(null);
      setError(reason instanceof AuthApiError && [400, 409].includes(reason.status) ? reason.serverMessage ?? 'Recarga la ficha y revisa los cambios.'
        : reason instanceof AuthApiError && reason.status === 403 ? 'Solo el creador con acceso a este campus puede editar.'
        : reason instanceof AuthApiError && reason.status === 404 ? 'La publicación ya no está disponible para editar.'
        : save ? 'No se pudo confirmar la edición. Actualiza la ficha antes de reintentar.' : 'No se pudo revisar la edición. Reintenta.');
      if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) refreshIdentity();
    } finally { if (!abort.signal.aborted) setBusy(false); if (request.current === abort) request.current = null; }
  };
  const locationLabel = (location: ActivityEditPreview['changes'][number]['before']['location']) => {
    const building = locations.find(value => value.id === location.buildingKey); const floor = building?.floors.find(value => value.id === location.floorKey);
    const poi = floor?.pois.find(value => value.id === location.poiKey);
    return floor ? `${building!.name} · ${floor.name}${poi ? ` · ${poi.name}` : ''}${location.customLabel ? ` · ${location.customLabel}` : ''}` : 'Lugar anterior no disponible';
  };
  return <View style={styles.form}>
    <Text accessibilityRole="header" style={styles.heading}>Editar {activity.series ? 'ocurrencia' : 'actividad'}</Text>
    <Text style={styles.text}>Conserva sus inscripciones y su tipo {activity.type === 'OFFICIAL_EVENT' ? 'oficial' : 'comunitario'}. Los cambios quedan en su historial.</Text>
    {activity.series ? <View style={styles.form}>
      {(['ONE', ...(activity.editing?.canEditUpcoming ? ['UPCOMING'] : [])] as EditActivityInput['scope'][]).map(value =>
        <Pressable key={value} disabled={busy} accessibilityRole="radio" accessibilityState={{ selected: scope === value, disabled: busy }}
          onPress={() => { setScope(value); setPreview(null); setError(null); }} style={styles.action}>
          <Text style={styles.link}>{scope === value ? '✓ ' : ''}{value === 'ONE' ? 'Solo esta ocurrencia' : 'Esta y las próximas sin comenzar'}</Text>
        </Pressable>)}
      {scope === 'UPCOMING' ? <Text style={styles.text}>Aplica el contenido y lugar a las próximas desde esta ocurrencia. Las nuevas fechas desplazan las ya programadas en la zona de la serie. Las pasadas y en curso se conservan.</Text> : null}
    </View> : null}
    <ActivityFields draft={draft} change={change} disabled={busy} locations={locations} organizer={activity.organizer?.name} />
    <Pressable disabled={busy} accessibilityRole="button" onPress={() => { void submit(); }} style={styles.action}>
      <Text style={styles.link}>Revisar cambios antes de guardar</Text>
    </Pressable>
    {preview ? <View style={styles.form}>
      <Text style={styles.heading}>Vista previa: {preview.changes.filter(value => value.changedFields.length).length} actividades cambiarán</Text>
      {preview.timeZone ? <Text style={styles.text}>Zona de la serie: {preview.timeZone}</Text> : null}
      {preview.changes.map(value => <View key={value.activityId} style={styles.form}>
        <Text style={styles.heading}>{value.index ? `Ocurrencia ${value.index}` : value.before.title}</Text>
        <Text style={styles.text}>Antes: {new Date(value.before.startAt).toLocaleString('es-CL')} — {new Date(value.before.endAt).toLocaleString('es-CL')}</Text>
        <Text style={styles.text}>Después: {new Date(value.after.startAt).toLocaleString('es-CL')} — {new Date(value.after.endAt).toLocaleString('es-CL')}</Text>
        <Text style={styles.text}>{locationLabel(value.before.location)} → {locationLabel(value.after.location)}</Text>
        {!value.changedFields.length ? <Text style={styles.text}>Sin cambios en esta ocurrencia.</Text> : null}
      </View>)}
    </View> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable disabled={busy || !preview} accessibilityRole="button" accessibilityState={{ disabled: busy || !preview }}
      onPress={() => { void submit(true); }} style={[styles.save, (busy || !preview) && { opacity: 0.5 }]}>
      {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Guardar cambios</Text>}
    </Pressable>
    <Pressable disabled={busy} accessibilityRole="button" onPress={onCancel} style={styles.action}><Text style={styles.link}>Volver a la ficha</Text></Pressable>
  </View>;
}
const styles = StyleSheet.create({ form: { gap: 12, paddingVertical: 12 }, heading: { fontWeight: '700', fontSize: 17, color: '#0F172A' },
  text: { color: '#475569', lineHeight: 21 }, action: { paddingVertical: 12 }, link: { color: '#0B6E75', fontWeight: '700' },
  save: { backgroundColor: '#0B6E75', padding: 14, alignItems: 'center', borderRadius: 8 }, saveText: { color: '#FFFFFF', fontWeight: '700' }, error: { color: '#B91C1C' } });
