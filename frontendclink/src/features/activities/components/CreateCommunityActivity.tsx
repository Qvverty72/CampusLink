import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { createCommunityActivity } from '../api/activitiesApi';
import type { ActivityDetail, ActivityLocationQuery } from '../types/activity';
import { COMMUNITY_CONTENT_LIMITS, validateCommunityDraft, type ActivityLocationOption, type CommunityActivityDraft } from '../types/creation';

export function CreateCommunityActivity({ locations, initialLocation, onCancel, onCreated }: {
  locations: ActivityLocationOption[]; initialLocation: ActivityLocationQuery;
  onCancel: () => void; onCreated: (activity: ActivityDetail) => void;
}) {
  const { identity, refreshIdentity } = useAuth();
  const [draft, setDraft] = useState<CommunityActivityDraft>({ title: '', description: '', startDate: '', startTime: '',
    endDate: '', endTime: '', buildingKey: initialLocation.buildingKey ?? '', floorKey: initialLocation.floorKey ?? '',
    poiKey: initialLocation.poiKey ?? '', customLabel: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const change = (field: keyof CommunityActivityDraft, value: string) => {
    setDraft(current => ({ ...current, [field]: value,
      ...(field === 'buildingKey' ? { floorKey: '', poiKey: '' } : field === 'floorKey' ? { poiKey: '' } : {}) }));
    setError(null);
  };
  const publish = async () => {
    if (request.current || !identity) return;
    const parsed = validateCommunityDraft(draft, locations);
    if (parsed.error) { setError(parsed.error); return; }
    const abort = new AbortController(); request.current = abort;
    setSubmitting(true); setError(null);
    try {
      const created = await createCommunityActivity(identity.campusId, parsed.input!, abort.signal);
      if (!abort.signal.aborted) onCreated(created);
    } catch (reason) {
      if (abort.signal.aborted) return;
      setError(reason instanceof AuthApiError && reason.status === 400
        ? 'Revisa las fechas y la ubicación: deben seguir vigentes. Si el lugar cambió, vuelve a abrir el mapa.'
        : reason instanceof AuthApiError && [401, 403].includes(reason.status)
          ? 'Necesitas una cuenta institucional verificada y activa para publicar.'
          : 'No se pudo confirmar la publicación. Actualiza el listado antes de reintentar para comprobar si se creó.');
      if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) refreshIdentity();
    } finally {
      if (!abort.signal.aborted) setSubmitting(false);
      if (request.current === abort) request.current = null;
    }
  };
  const field = (key: keyof CommunityActivityDraft, label: string, placeholder: string, maxLength: number, multiline = false) =>
    <View style={styles.field} key={key}><Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholder={placeholder} value={draft[key]} onChangeText={value => change(key, value)}
        editable={!submitting} maxLength={maxLength} multiline={multiline} style={[styles.input, multiline && styles.description]} />
    </View>;
  const choices = (key: 'buildingKey' | 'floorKey' | 'poiKey', values: { id: string; name: string }[]) =>
    <View style={styles.choices}>{values.map(value => <Pressable key={value.id} accessibilityRole="radio"
      accessibilityState={{ selected: draft[key] === value.id, disabled: submitting }} disabled={submitting}
      onPress={() => change(key, value.id)} style={[styles.choice, draft[key] === value.id && styles.selected]}>
      <Text style={draft[key] === value.id ? styles.selectedText : styles.text}>{value.name}</Text>
    </Pressable>)}</View>;
  const building = locations.find(value => value.id === draft.buildingKey);
  const floor = building?.floors.find(value => value.id === draft.floorKey);
  return <View style={styles.form}>
    <Text accessibilityRole="header" style={styles.heading}>Crear actividad comunitaria</Text>
    <Text style={styles.text}>Se publicará en tu campus. Serás organizador y primer participante.</Text>
    {field('title', 'Nombre', 'Nombre de la actividad', COMMUNITY_CONTENT_LIMITS.title)}
    {field('description', 'Descripción', 'Describe la actividad presencial', COMMUNITY_CONTENT_LIMITS.description, true)}
    <Text style={styles.text}>Fechas y horas locales de tu dispositivo, en formato de 24 horas.</Text>
    {field('startDate', 'Fecha de inicio', 'DD/MM/AAAA', 10)}
    {field('startTime', 'Hora de inicio', 'HH:mm', 5)}
    {field('endDate', 'Fecha de término', 'DD/MM/AAAA', 10)}
    {field('endTime', 'Hora de término', 'HH:mm', 5)}
    <Text style={styles.label}>Edificio</Text>{choices('buildingKey', locations)}
    <Text style={styles.label}>Piso</Text>
    {building ? choices('floorKey', building.floors) : <Text style={styles.text}>Selecciona un edificio.</Text>}
    <Text style={styles.label}>Punto de interés (opcional)</Text>
    {floor ? choices('poiKey', [{ id: '', name: 'En el piso, sin punto de interés' }, ...floor.pois])
      : <Text style={styles.text}>Selecciona un piso.</Text>}
    {field('customLabel', 'Referencia del lugar (opcional)', 'Ejemplo: junto a la sala de estudio', COMMUNITY_CONTENT_LIMITS.customLabel)}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: submitting }} disabled={submitting} onPress={publish} style={styles.publish}>
      {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.selectedText}>Publicar actividad</Text>}
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
