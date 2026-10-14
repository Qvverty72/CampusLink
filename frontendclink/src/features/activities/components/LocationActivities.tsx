import { APP_COLORS } from '@/types/colors';
import { Pagination } from '@/components/Pagination';
import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ActivitiesState } from '../hooks/useLocationActivities';
import { ACTIVITY_COLORS, filterLocationActivities, type Activity, type ActivityLocationQuery } from '../types/activity';
import { ActivityCard } from './ActivityCard';
import { ActivityListSkeleton } from './ActivityListSkeleton';
import { ActivityDetail } from './ActivityDetail';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { CreateActivityForm } from './CreateActivityForm';
import { ACTIVITY_DESCRIPTION_OPTIONS, type ActivityLocationOption } from '../types/creation';
import { ActivityContentTransition } from './ActivityContentTransition';
import { ActivityRefreshRegistration } from './ActivityRefreshScrollView';

const PAGE_SIZE = 5;
const ACTIVITY_TYPES = ['OFFICIAL_EVENT', 'COMMUNITY_ACTIVITY'] as const;

/** Navega actividades por ubicación y limita las acciones según capacidades de la identidad. */
export function LocationActivities(props: {
  state: ActivitiesState; query?: ActivityLocationQuery; onExplore?: (activity: Activity) => void;
  locations?: ActivityLocationOption[];
  activityType?: Activity['type'];
  onBackToFloorInfo?: () => void;
  onDetailVisibilityChange?: (visible: boolean) => void;
  onEditOpen?: () => void;
  onPageChange?: () => void;
}) {
  const { identity, session } = useAuth();
  // Reinicia navegador y formulario ante cambio de campus o sesión, y descarta borradores/respuestas obsoletos.
  return <LocationActivitiesContent key={JSON.stringify([identity?.campusId, session?.access_token])} {...props}
    canCreate={!!identity?.capabilities.general && !!identity?.profile.verificado_en}
    canPublishOfficial={!!identity?.capabilities.officialActivities} />;
}

function LocationActivitiesContent({ state, query = {}, onExplore, locations, canCreate, canPublishOfficial, activityType, onBackToFloorInfo, onDetailVisibilityChange, onEditOpen, onPageChange }: {
  state: ActivitiesState; query?: ActivityLocationQuery; onExplore?: (activity: Activity) => void;
  locations?: ActivityLocationOption[]; canCreate: boolean; canPublishOfficial: boolean;
  activityType?: Activity['type'];
  onBackToFloorInfo?: () => void;
  onDetailVisibilityChange?: (visible: boolean) => void;
  onEditOpen?: () => void;
  onPageChange?: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState<'COMMUNITY_ACTIVITY' | 'OFFICIAL_EVENT' | null>(null);
  const [published, setPublished] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [descriptionFilter, setDescriptionFilter] = useState<string | null>(null);
  const [descriptionMenuOpen, setDescriptionMenuOpen] = useState(false);
  const communityDescription = activityType === 'COMMUNITY_ACTIVITY' ? descriptionFilter : null;
  const activities = filterLocationActivities(state.activities, query);
  const types = activityType ? [activityType] : ACTIVITY_TYPES;
  // Conserva los grupos oficial/comunitario y aplica un único límite de cinco elementos.
  const filtered = types.flatMap(type => activities.filter(activity => activity.type === type
    && (communityDescription === null || activity.description === communityDescription)));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageEntries = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const refreshList = useCallback(() => { setPage(1); state.refresh(); }, [state.refresh]);
  useLayoutEffect(() => {
    setPage(1);
    setDescriptionFilter(null);
    setDescriptionMenuOpen(false);
  }, [query.buildingKey, query.floorKey, query.poiKey, activityType]);
  useEffect(() => {
    if (selectedId || creating || state.isLoading || state.error) setDescriptionMenuOpen(false);
  }, [selectedId, creating, state.isLoading, state.error]);
  useEffect(() => {
    // La carga vacía temporalmente la colección compartida; conserva la página hasta recibir resultados.
    if (!state.isLoading && !state.error) setPage(previous => Math.min(previous, totalPages));
  }, [state.isLoading, state.error, totalPages]);
  useLayoutEffect(() => {
    if (!selectedId && !creating && !state.isLoading && !state.error) onPageChange?.();
  }, [currentPage, communityDescription, selectedId, creating, state.isLoading, state.error, onPageChange]);
  useLayoutEffect(() => {
    onDetailVisibilityChange?.(selectedId !== null);
    return () => onDetailVisibilityChange?.(false);
  }, [selectedId, onDetailVisibilityChange]);
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
        setPage(1); setSelectedId(activity.id); state.refresh(); }} />
    </View>);
  }
  if (selectedId) return transition(`detail:${selectedId}`, <View>
    {published ? <Text accessibilityRole="alert" style={styles.text}>{published}</Text> : null}
    <ActivityDetail key={selectedId} activityId={selectedId}
      locations={locations} onEditOpen={onEditOpen} onEdited={count => { setPublished(count ? `Cambios guardados en ${count} actividad(es). Tus inscripciones se conservan.` : 'La actividad ya tenía esos datos.'); state.refresh(); }}
      onSelectOccurrence={id => { setPublished(null); setSelectedId(id); }}
      onDeleted={() => { setSelectedId(null); setPublished('Actividad eliminada.'); state.refresh(); }}
      onBack={() => { setSelectedId(null); setPublished(null); state.refresh(); }} onExplore={onExplore} />
  </View>);
  const listRefresh = <ActivityRefreshRegistration onRefresh={refreshList} refreshing={state.isLoading}
    enabled={!state.isLoading} label="las actividades" />;
  if (state.isLoading) return transition('loading', <View style={styles.section}>
    {listRefresh}
    {floorBack}
    <ActivityListSkeleton activityType={activityType} />
  </View>);
  if (state.error) return transition('error', <View style={styles.section}>
    {listRefresh}
    {floorBack}
    <Text accessibilityRole="alert" style={styles.text}>{state.error}</Text>
    <Pressable accessibilityRole="button" onPress={refreshList}><Text style={styles.retry}>Reintentar</Text></Pressable>
  </View>);
  return transition(`list:${activityType ?? 'all'}:${communityDescription ?? 'all'}:${currentPage}`, <View style={styles.section}>
    {listRefresh}
    {floorBack}
    {published ? <Text accessibilityRole="alert" style={styles.text}>{published}</Text> : null}
    {activityType === 'COMMUNITY_ACTIVITY' ? <View style={styles.descriptionFilter} onAccessibilityEscape={() => setDescriptionMenuOpen(false)}>
      <Text style={styles.filterLabel}>Filtrar por descripción</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Filtrar por descripción"
        accessibilityValue={{ text: descriptionFilter ?? 'Todas las descripciones' }}
        accessibilityState={{ expanded: descriptionMenuOpen }} aria-expanded={descriptionMenuOpen}
        activeOpacity={0.75} onPress={() => setDescriptionMenuOpen(value => !value)}
        style={[styles.filterTrigger, descriptionMenuOpen && styles.filterActive]}>
        <Text style={styles.filterValue}>{descriptionFilter ?? 'Todas las descripciones'}</Text>
        <Text aria-hidden accessibilityElementsHidden importantForAccessibility="no" style={styles.text}>{descriptionMenuOpen ? '▴' : '▾'}</Text>
      </TouchableOpacity>
      {descriptionMenuOpen ? <View accessibilityRole="radiogroup" accessibilityLabel="Descripción de actividades comunitarias" style={styles.filterMenu}>
        {[null, ...ACTIVITY_DESCRIPTION_OPTIONS].map(description => {
          const selected = descriptionFilter === description;
          const label = description ?? 'Todas las descripciones';
          return <TouchableOpacity key={label} accessibilityRole="radio" accessibilityLabel={label}
            accessibilityState={{ checked: selected }} aria-checked={selected}
            onPress={() => { setDescriptionFilter(description); setPage(1); setDescriptionMenuOpen(false); }}
            style={[styles.filterOption, selected && styles.filterSelected]}>
            <Text style={[styles.filterValue, selected && styles.filterSelectedText]}>{label}</Text>
            {selected ? <Text aria-hidden accessibilityElementsHidden importantForAccessibility="no" style={styles.filterSelectedText}>✓</Text> : null}
          </TouchableOpacity>;
        })}
      </View> : null}
    </View> : null}
    {types.map(type => {
      const total = filtered.filter(activity => activity.type === type).length;
      const entries = pageEntries.filter(activity => activity.type === type);
      if (total > 0 && entries.length === 0) return null;
      return <View key={type} style={styles.section}>
        <Text accessibilityRole="header" style={[styles.heading, { color: ACTIVITY_COLORS[type] }]}>
          {type === 'OFFICIAL_EVENT' ? 'Eventos oficiales' : 'Actividades comunitarias'} ({total})
        </Text>
        {entries.length ? entries.map(activity => <ActivityCard key={activity.id} activity={activity}
          onPress={() => setSelectedId(activity.id)} />)
          : <Text style={styles.text}>{type === 'OFFICIAL_EVENT' ? 'No hay eventos oficiales vigentes en este lugar.'
            : communityDescription !== null ? 'No hay actividades comunitarias con esta descripción en este lugar.'
            : 'No hay actividades comunitarias vigentes en este lugar.'}</Text>}
      </View>;
    })}
    {filtered.length > PAGE_SIZE ? <Pagination page={currentPage} totalPages={totalPages}
      onPageChange={setPage} label="Paginación de actividades y eventos" /> : null}
    <View style={styles.creationActions}>
      {canCreate && locations?.length && (!activityType || activityType === 'COMMUNITY_ACTIVITY') ?
        <TouchableOpacity accessibilityRole="button" activeOpacity={0.75} onPress={() => setCreating('COMMUNITY_ACTIVITY')}
          style={[styles.createButton, { borderColor: ACTIVITY_COLORS.COMMUNITY_ACTIVITY }]}>
          <Text style={[styles.createText, { color: ACTIVITY_COLORS.COMMUNITY_ACTIVITY }]}>Crear actividad comunitaria</Text>
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
  text: { color: '#475569', lineHeight: 21 }, retry: { color: APP_COLORS.PRIMARY, fontWeight: '700', paddingVertical: 12 },
  backButton: { paddingVertical: 10 }, backText: { fontSize: 14, color: APP_COLORS.PRIMARY, fontWeight: '600' },
  descriptionFilter: { gap: 4, marginTop: 12 }, filterLabel: { color: '#0F172A', fontWeight: '600' },
  filterTrigger: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: '#94A3B8', borderRadius: 8, padding: 12 },
  filterActive: { borderColor: APP_COLORS.PRIMARY }, filterValue: { flex: 1, color: '#0F172A', lineHeight: 21 },
  filterMenu: { borderWidth: 1, borderColor: '#94A3B8', borderRadius: 8, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  filterOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  filterSelected: { backgroundColor: '#E6F3F3' }, filterSelectedText: { color: APP_COLORS.PRIMARY, fontWeight: '600' },
  creationActions: { gap: 12, marginTop: 20 },
  createButton: { borderWidth: 1, borderRadius: 16, padding: 18, alignItems: 'center', backgroundColor: '#F8FAFC' },
  createText: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
});
