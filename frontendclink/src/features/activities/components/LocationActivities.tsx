import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ActivitiesState } from '../hooks/useLocationActivities';
import { ACTIVITY_COLORS, filterLocationActivities, type Activity, type ActivityLocationQuery } from '../types/activity';
import { ActivityCard } from './ActivityCard';

export function LocationActivities({ state, query = {}, onExplore }: {
  state: ActivitiesState; query?: ActivityLocationQuery; onExplore?: (activity: Activity) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (state.isLoading) return <View style={styles.section}><ActivityIndicator /><Text style={styles.text}>Cargando actividades…</Text></View>;
  if (state.error) return <View style={styles.section}>
    <Text accessibilityRole="alert" style={styles.text}>{state.error}</Text>
    <Pressable accessibilityRole="button" onPress={state.refresh}><Text style={styles.retry}>Reintentar</Text></Pressable>
  </View>;
  const activities = filterLocationActivities(state.activities, query);
  return <View style={styles.section}>
    <Pressable accessibilityRole="button" onPress={state.refresh}><Text style={styles.retry}>Actualizar actividades</Text></Pressable>
    {(['OFFICIAL_EVENT', 'COMMUNITY_ACTIVITY'] as const).map(type => {
      const entries = activities.filter(activity => activity.type === type);
      return <View key={type} style={styles.section}>
        <Text accessibilityRole="header" style={[styles.heading, { color: ACTIVITY_COLORS[type] }]}>
          {type === 'OFFICIAL_EVENT' ? 'Eventos oficiales' : 'Actividades comunitarias'} ({entries.length})
        </Text>
        {entries.length ? entries.map(activity => <ActivityCard key={activity.id} activity={activity}
          expanded={selectedId === activity.id} onPress={() => setSelectedId(selectedId === activity.id ? null : activity.id)}
          onExplore={onExplore ? () => onExplore(activity) : undefined} />)
          : <Text style={styles.text}>{type === 'OFFICIAL_EVENT' ? 'No hay eventos oficiales vigentes en este lugar.' : 'No hay actividades comunitarias vigentes en este lugar.'}</Text>}
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 12, marginTop: 12 }, heading: { fontSize: 16, fontWeight: '700' },
  text: { color: '#475569', lineHeight: 21 }, retry: { color: '#0B6E75', fontWeight: '700', paddingVertical: 12 },
});
