import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ActivitiesState } from '../hooks/useLocationActivities';
import { ACTIVITY_COLORS, filterLocationActivities, type Activity, type ActivityLocationQuery } from '../types/activity';
import { ActivityCard } from './ActivityCard';
import { ActivityDetail } from './ActivityDetail';
import { useAuth } from '@/features/auth/AuthProvider';
import { CreateActivityForm } from './CreateActivityForm';
import type { ActivityLocationOption } from '../types/creation';
import { ActivityContentTransition } from './ActivityContentTransition';

export function LocationActivities(props: {
  state: ActivitiesState; query?: ActivityLocationQuery; onExplore?: (activity: Activity) => void;
  locations?: ActivityLocationOption[];
  activityType?: Activity['type'];
  onBackToFloorInfo?: () => void;
}) {
  const { identity, session } = useAuth();
  // Remount the browser/form on campus or session change, clearing drafts and obsolete responses.
  return <LocationActivitiesContent key={JSON.stringify([identity?.campusId, session?.access_token])} {...props}
    canCreate={!!identity?.capabilities.general && !!identity?.profile.verificado_en}
    canPublishOfficial={!!identity?.capabilities.officialActivities} />;
}

function LocationActivitiesContent({ state, query = {}, onExplore, locations, canCreate, canPublishOfficial, activityType, onBackToFloorInfo }: {
  state: ActivitiesState; query?: ActivityLocationQuery; onExplore?: (activity: Activity) => void;
  locations?: ActivityLocationOption[]; canCreate: boolean; canPublishOfficial: boolean;
  activityType?: Activity['type'];
  onBackToFloorInfo?: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState<'COMMUNITY_ACTIVITY' | 'OFFICIAL_EVENT' | null>(null);
  const [published, setPublished] = useState<string | null>(null);
  const transition = (key: string, content: ReactNode) =>
    <ActivityContentTransition transitionKey={key}>{content}</ActivityContentTransition>;
  const floorBack = onBackToFloorInfo ? <Pressable accessibilityRole="button" onPress={onBackToFloorInfo} style={styles.backButton}>
    <Text style={styles.backText}>‹ Volver a la información del piso</Text>
  </Pressable> : null;
  if (creating && (creating === 'OFFICIAL_EVENT' ? canPublishOfficial : canCreate) && locations) {
    return transition(`create:${creating}`, <View>
      <Pressable accessibilityRole="button" onPress={() => { setCreating(null); state.refresh(); }} style={styles.backButton}>
        <Text style={styles.backText}>‹ Volver al listado de actividades / eventos</Text>
      </Pressable>
      <CreateActivityForm key={JSON.stringify([creating, query.buildingKey, query.floorKey, query.poiKey])} official={creating === 'OFFICIAL_EVENT'} locations={locations} initialLocation={query}
      onCreated={activity => { setCreating(null); setPublished(activity.series ? `Serie publicada: ${activity.series.total} ocurrencias. Ya estás inscrito en cada una.` : activity.type === 'OFFICIAL_EVENT'
        ? 'Evento oficial publicado. Ya estás inscrito como organizador.' : 'Actividad publicada. Ya estás inscrito como organizador.');
        setSelectedId(activity.id); state.refresh(); }} />
    </View>);
  }
  if (selectedId) return transition(`detail:${selectedId}`, <View>
    {floorBack}
    {published ? <Text accessibilityRole="alert" style={styles.text}>{published}</Text> : null}
    <ActivityDetail key={selectedId} activityId={selectedId}
      locations={locations} onEdited={count => { setPublished(count ? `Cambios guardados en ${count} actividad(es). Tus inscripciones se conservan.` : 'La actividad ya tenía esos datos.'); state.refresh(); }}
      onSelectOccurrence={id => { setPublished(null); setSelectedId(id); }}
      onBack={() => { setSelectedId(null); setPublished(null); state.refresh(); }} onExplore={onExplore} />
  </View>);
  if (state.isLoading) return transition('loading', <View style={styles.section}>{floorBack}<ActivityIndicator /><Text style={styles.text}>Cargando actividades…</Text></View>);
  if (state.error) return transition('error', <View style={styles.section}>
    {floorBack}
    <Text accessibilityRole="alert" style={styles.text}>{state.error}</Text>
    <Pressable accessibilityRole="button" onPress={state.refresh}><Text style={styles.retry}>Reintentar</Text></Pressable>
  </View>);
  const activities = filterLocationActivities(state.activities, query);
  return transition(`list:${activityType ?? 'all'}`, <View style={styles.section}>
    {floorBack}
    {published ? <Text accessibilityRole="alert" style={styles.text}>{published}</Text> : null}
    {(activityType ? [activityType] : ['OFFICIAL_EVENT', 'COMMUNITY_ACTIVITY'] as const).map(type => {
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
    <View style={styles.creationActions}>
      {canCreate && locations?.length && (!activityType || activityType === 'COMMUNITY_ACTIVITY') ?
        <TouchableOpacity accessibilityRole="button" activeOpacity={0.75} onPress={() => setCreating('COMMUNITY_ACTIVITY')} style={styles.createButton}>
          <Text style={styles.createText}>Crear actividad comunitaria</Text>
        </TouchableOpacity> : null}
      {canPublishOfficial && locations?.length && (!activityType || activityType === 'OFFICIAL_EVENT') ?
        <TouchableOpacity accessibilityRole="button" activeOpacity={0.75} onPress={() => setCreating('OFFICIAL_EVENT')}
          style={[styles.createButton, { borderColor: ACTIVITY_COLORS.OFFICIAL_EVENT }]}>
          <Text style={[styles.createText, { color: ACTIVITY_COLORS.OFFICIAL_EVENT }]}>Publicar evento oficial</Text>
        </TouchableOpacity> : null}
    </View>
  </View>);
}

const styles = StyleSheet.create({
  section: { gap: 12, marginTop: 12 }, heading: { fontSize: 16, fontWeight: '700' },
  text: { color: '#475569', lineHeight: 21 }, retry: { color: '#0B6E75', fontWeight: '700', paddingVertical: 12 },
  backButton: { paddingVertical: 10 }, backText: { fontSize: 14, color: '#0B6E75', fontWeight: '600' },
  creationActions: { gap: 12, marginTop: 20 },
  createButton: { borderWidth: 1, borderColor: '#0B6E75', borderRadius: 16, padding: 18, alignItems: 'center', backgroundColor: '#F8FAFC' },
  createText: { color: '#0B6E75', fontSize: 16, fontWeight: '600', textAlign: 'center' },
});
