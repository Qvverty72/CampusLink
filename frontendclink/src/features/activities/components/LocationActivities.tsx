import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ActivitiesState } from '../hooks/useLocationActivities';
import { ACTIVITY_COLORS, filterLocationActivities, type Activity, type ActivityLocationQuery } from '../types/activity';
import { ActivityCard } from './ActivityCard';
import { ActivityDetail } from './ActivityDetail';
import { useAuth } from '@/features/auth/AuthProvider';
import { CreateCommunityActivity } from './CreateCommunityActivity';
import type { ActivityLocationOption } from '../types/creation';

export function LocationActivities(props: {
  state: ActivitiesState; query?: ActivityLocationQuery; onExplore?: (activity: Activity) => void;
  locations?: ActivityLocationOption[];
}) {
  const { identity, session } = useAuth();
  // Remount the browser/form on campus or session change, clearing drafts and obsolete responses.
  return <LocationActivitiesContent key={JSON.stringify([identity?.campusId, session?.access_token])} {...props}
    canCreate={!!identity?.capabilities.general && !!identity?.profile.verificado_en} />;
}

function LocationActivitiesContent({ state, query = {}, onExplore, locations, canCreate }: {
  state: ActivitiesState; query?: ActivityLocationQuery; onExplore?: (activity: Activity) => void;
  locations?: ActivityLocationOption[]; canCreate: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [published, setPublished] = useState(false);
  if (creating && canCreate && locations) return <CreateCommunityActivity locations={locations} initialLocation={query}
    onCancel={() => { setCreating(false); state.refresh(); }}
    onCreated={activity => { setCreating(false); setPublished(true); setSelectedId(activity.id); state.refresh(); }} />;
  if (selectedId) return <View>
    {published ? <Text accessibilityRole="alert" style={styles.text}>Actividad publicada. Ya estás inscrito como organizador.</Text> : null}
    <ActivityDetail key={selectedId} activityId={selectedId}
      onBack={() => { setSelectedId(null); setPublished(false); state.refresh(); }} onExplore={onExplore} />
  </View>;
  if (state.isLoading) return <View style={styles.section}><ActivityIndicator /><Text style={styles.text}>Cargando actividades…</Text></View>;
  if (state.error) return <View style={styles.section}>
    <Text accessibilityRole="alert" style={styles.text}>{state.error}</Text>
    <Pressable accessibilityRole="button" onPress={state.refresh}><Text style={styles.retry}>Reintentar</Text></Pressable>
  </View>;
  const activities = filterLocationActivities(state.activities, query);
  return <View style={styles.section}>
    {published ? <Text accessibilityRole="alert" style={styles.text}>Actividad publicada. Ya estás inscrito como organizador.</Text> : null}
    {canCreate && locations?.length ? <Pressable accessibilityRole="button" onPress={() => setCreating(true)}>
      <Text style={styles.retry}>Crear actividad comunitaria</Text>
    </Pressable> : null}
    <Pressable accessibilityRole="button" onPress={state.refresh}><Text style={styles.retry}>Actualizar actividades</Text></Pressable>
    {(['OFFICIAL_EVENT', 'COMMUNITY_ACTIVITY'] as const).map(type => {
      const entries = activities.filter(activity => activity.type === type);
      return <View key={type} style={styles.section}>
        <Text accessibilityRole="header" style={[styles.heading, { color: ACTIVITY_COLORS[type] }]}>
          {type === 'OFFICIAL_EVENT' ? 'Eventos oficiales' : 'Actividades comunitarias'} ({entries.length})
        </Text>
        {entries.length ? entries.map(activity => <ActivityCard key={activity.id} activity={activity}
          onPress={() => setSelectedId(activity.id)} />)
          : <Text style={styles.text}>{type === 'OFFICIAL_EVENT' ? 'No hay eventos oficiales vigentes en este lugar.' : 'No hay actividades comunitarias vigentes en este lugar.'}</Text>}
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 12, marginTop: 12 }, heading: { fontSize: 16, fontWeight: '700' },
  text: { color: '#475569', lineHeight: 21 }, retry: { color: '#0B6E75', fontWeight: '700', paddingVertical: 12 },
});
