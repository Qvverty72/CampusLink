import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { fetchActivitySeries } from '../api/activitiesApi';
import { RECURRENCE_LABELS, type ActivitySeries } from '../types/recurrence';
import { ActivityCard } from './ActivityCard';

/** Series context remains in the current modal. Participation always belongs to the selected activity ID. */
export function ActivitySeriesView({ seriesId, currentActivityId, onBack, onSelect }: {
  seriesId: string; currentActivityId: string; onBack: () => void; onSelect: (activityId: string) => void;
}) {
  const { identity, session, refreshIdentity } = useAuth(); const [revision, setRevision] = useState(0);
  const key = JSON.stringify([identity?.campusId, session?.access_token, seriesId, revision]);
  const [state, setState] = useState<{ key: string; series: ActivitySeries | null; error: string | null }>({ key: '', series: null, error: null });
  useEffect(() => {
    if (!identity?.campusId || !session?.access_token) return;
    const abort = new AbortController(); setState({ key, series: null, error: null });
    void fetchActivitySeries(identity.campusId, seriesId, abort.signal).then(series => {
      if (!abort.signal.aborted) setState({ key, series, error: null });
    }).catch(reason => {
      if (abort.signal.aborted) return;
      setState({ key, series: null, error: reason instanceof AuthApiError && reason.status === 404
        ? 'Esta serie ya no tiene ocurrencias vigentes disponibles.' : 'No se pudo consultar la serie. Reintenta.' });
      if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) refreshIdentity();
    });
    return () => abort.abort();
  }, [key, identity?.campusId, session?.access_token, seriesId, refreshIdentity]);
  const series = state.key === key ? state.series : null; const error = state.key === key ? state.error : null;
  useEffect(() => {
    if (!series?.occurrences.length) return;
    const end = Math.min(...series.occurrences.map(value => Date.parse(value.endAt)));
    const timer = setTimeout(() => setRevision(value => value + 1), Math.min(2_147_483_647, Math.max(1, end - Date.now() + 1)));
    return () => clearTimeout(timer);
  }, [series]);
  return <View style={styles.content}>
    <Pressable accessibilityRole="button" onPress={onBack}><Text style={styles.link}>Volver a esta ocurrencia</Text></Pressable>
    {error ? <Text accessibilityRole="alert" style={styles.text}>{error}</Text> : !series ? <ActivityIndicator /> : <>
      <Text accessibilityRole="header" style={styles.heading}>Serie: {series.title}</Text>
      <Text style={styles.text}>{RECURRENCE_LABELS[series.recurrence.frequency]} cada {series.recurrence.interval} período(s),
        {' '}hasta {series.recurrence.until} · {series.recurrence.timeZone}</Text>
      <Text style={styles.text}>La serie tiene {series.occurrenceCount} ocurrencias. Cada una tiene su inscripción independiente.</Text>
      <Text style={styles.heading}>Ocurrencias vigentes disponibles ({series.occurrences.length})</Text>
      <Text style={styles.text}>Las fechas finalizadas o no disponibles quedan fuera de esta consulta.</Text>
      {series.occurrences.map(activity => <View key={activity.id}>
        {activity.id === currentActivityId ? <Text style={styles.link}>Estás consultando esta ocurrencia</Text> : null}
        <ActivityCard activity={activity} onPress={() => onSelect(activity.id)} />
      </View>)}
    </>}
    <Pressable accessibilityRole="button" onPress={() => setRevision(value => value + 1)}><Text style={styles.link}>Actualizar serie</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({ content: { gap: 12, paddingVertical: 12 }, heading: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  text: { color: '#334155', lineHeight: 21 }, link: { color: '#0B6E75', fontWeight: '700', paddingVertical: 12 } });
