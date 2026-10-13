import { APP_COLORS } from '@/types/colors';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { previewActivityEdit, saveActivityEdit } from '../api/activitiesApi';
import type { ActivityDetail } from '../types/activity';
import { isActivityDescriptionAllowed, type ActivityDraft, type ActivityLocationOption } from '../types/creation';
import { activityEditDraft, validateActivityEditDraft } from '../types/editing';
import { ActivityFields } from './ActivityFields';

export function EditActivityForm({ activity, locations, onCancel, onSaved }: {
  activity: ActivityDetail; locations: ActivityLocationOption[]; onCancel: () => void; onSaved: (count: number) => void;
}) {
  const { identity, refreshIdentity } = useAuth(); const [draft, setDraft] = useState(() => activityEditDraft(activity));
  const allowCustomDescription = identity?.capabilities.officialActivities === true;
  const canViewOccurrences = identity?.capabilities.officialActivities === true;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const change = (field: keyof ActivityDraft, value: string) => {
    setDraft(current => ({ ...current, [field]: value, ...(field === 'buildingKey' ? { floorKey: '', poiKey: '' } : field === 'floorKey' ? { poiKey: '' } : {}) }));
    setError(null);
  };
  const submit = async () => {
    if (request.current || !identity) return;
    if (!isActivityDescriptionAllowed(draft.description, allowCustomDescription, activity.description)) {
      setError('Selecciona una descripción para la actividad.'); return;
    }
    const parsed = validateActivityEditDraft(draft, activity, locations);
    if (!parsed.input) { setError(parsed.error); return; }
    const abort = new AbortController(); request.current = abort; setBusy(true); setError(null);
    let saving = false;
    try {
      // Obtain the server's concurrency token without a separate user action.
      const preview = await previewActivityEdit(identity.campusId, activity.id, parsed.input, abort.signal);
      if (abort.signal.aborted) return;
      saving = true;
      const result = await saveActivityEdit(identity.campusId, activity.id, { ...parsed.input, previewHash: preview.previewHash }, abort.signal);
      if (!abort.signal.aborted) onSaved(result.updatedCount);
    } catch (reason) {
      if (abort.signal.aborted) return;
      setError(reason instanceof AuthApiError && reason.status === 409 ? 'La actividad cambió mientras la editabas. Vuelve a la ficha y abre la edición nuevamente.'
        : reason instanceof AuthApiError && reason.status === 400 ? reason.serverMessage ?? 'Comprueba los campos e intenta guardar nuevamente.'
        : reason instanceof AuthApiError && reason.status === 403 ? 'Solo el creador con acceso a este campus puede editar.'
        : reason instanceof AuthApiError && reason.status === 404 ? 'La publicación ya no está disponible para editar.'
        : saving ? 'No se pudo confirmar la edición. Actualiza la ficha antes de reintentar.' : 'No se pudieron guardar los cambios. Reintenta.');
      if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) refreshIdentity();
    } finally { if (!abort.signal.aborted) setBusy(false); if (request.current === abort) request.current = null; }
  };
  return <View style={styles.form}>
    <TouchableOpacity disabled={busy} accessibilityRole="button" onPress={onCancel} style={styles.back}>
      <Text style={styles.link}>‹ Volver a la ficha</Text>
    </TouchableOpacity>
    <Text accessibilityRole="header" style={styles.heading}>Editar {canViewOccurrences && activity.series ? 'ocurrencia' : 'actividad'}</Text>
    <Text style={styles.text}>Conserva sus inscripciones y su tipo {activity.type === 'OFFICIAL_EVENT' ? 'oficial' : 'comunitario'}. Los cambios quedan en su historial.</Text>
    <ActivityFields draft={draft} change={change} disabled={busy} locations={locations} organizer={activity.organizer?.name} locationDropdowns
      existingContent={{ description: activity.description, customLabel: activity.location.customLabel ?? '' }}
      allowCustomDescription={allowCustomDescription} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable disabled={busy} accessibilityRole="button" accessibilityState={{ disabled: busy }}
      onPress={() => { void submit(); }} style={[styles.save, busy && styles.disabled]}>
      {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Guardar cambios</Text>}
    </Pressable>
  </View>;
}
const styles = StyleSheet.create({ form: { gap: 12, paddingVertical: 12 }, heading: { fontWeight: '700', fontSize: 18, color: '#0F172A' },
  text: { color: '#475569', lineHeight: 21 }, link: { color: APP_COLORS.PRIMARY, fontWeight: '700' }, disabled: { opacity: 0.5 },
  back: { minHeight: 44, paddingVertical: 12 },
  save: { backgroundColor: APP_COLORS.PRIMARY, padding: 14, alignItems: 'center', borderRadius: 8 }, saveText: { color: '#FFFFFF', fontWeight: '700' }, error: { color: '#B91C1C' } });
