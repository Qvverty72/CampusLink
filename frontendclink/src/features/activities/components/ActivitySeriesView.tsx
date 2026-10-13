import { APP_COLORS } from '@/types/colors';
import { Pagination } from '@/components/Pagination';
import { Skeleton, SkeletonBlock } from '@/components/Skeleton';
import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronRight, Clock3, MapPin, RefreshCw, X, type LucideIcon } from 'lucide-react-native';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { fetchActivitySeries } from '../api/activitiesApi';
import { recurrenceSummary, type ActivitySeries } from '../types/recurrence';
import type { Activity } from '../types/activity';
import { useActivityCompactHeader, useActivityRefresh, useActivityScrollReset } from './ActivityRefreshScrollView';

const OCCURRENCES_PER_PAGE = 5;

/** Placeholder slots match one page; they never claim a real occurrence count. */
function ActivitySeriesSkeleton({ closeAction }: { closeAction: ReactNode }) {
  return <View style={styles.content}>
    <Skeleton label="Cargando serie y ocurrencias">
      <View style={styles.skeletonHeader}>
        <View style={styles.titleRow}>
          <SkeletonBlock width="65%" height={26} />
          <SkeletonBlock width={48} height={21} borderRadius={20} />
        </View>
        <SkeletonBlock width="90%" height={19} />
      </View>
      <View style={styles.metadata}>
        {[0, 1].map(index => <View key={index} style={styles.detailRow}>
          <SkeletonBlock width={14} height={14} borderRadius={7} />
          <View style={styles.occurrenceDetails}><SkeletonBlock width={index === 0 ? '45%' : '80%'} height={19} /></View>
        </View>)}
      </View>
      <View style={styles.skeletonSection}><SkeletonBlock width={144} height={17} /></View>
      {Array.from({ length: OCCURRENCES_PER_PAGE }, (_, index) => <View key={index} style={styles.occurrence}>
        <SkeletonBlock width={44} height={44} borderRadius={12} />
        <View style={styles.occurrenceDetails}><SkeletonBlock width={index % 2 === 0 ? '55%' : '40%'} height={18} /></View>
        {index === 0 ? <SkeletonBlock width={38} height={21} borderRadius={20} /> : null}
        <SkeletonBlock width={8} height={14} />
      </View>)}
    </Skeleton>
    <View style={styles.skeletonClose}>{closeAction}</View>
  </View>;
}

function DecorativeIcon({ icon: Icon, color = APP_COLORS.SECONDARY, size = 14 }: {
  icon: LucideIcon; color?: string; size?: number;
}) {
  return <View pointerEvents="none" accessible={false} aria-hidden accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"><Icon size={size} color={color} strokeWidth={1.8} /></View>;
}

function locationLabel(activity: Activity): string {
  const floor = activity.location.floorName.toLocaleLowerCase().includes(activity.location.buildingName.toLocaleLowerCase())
    ? activity.location.floorName : `${activity.location.buildingName} · ${activity.location.floorName}`;
  return [floor, activity.location.poiName, activity.location.customLabel].filter(Boolean).join(' · ');
}

function scheduleLabel(activity: Activity, timeZone: string): string {
  const start = new Date(activity.startAt); const end = new Date(activity.endAt);
  const dateOptions = { timeZone, day: 'numeric', month: 'short', year: 'numeric' } as const;
  const timeOptions = { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const;
  const sameDay = start.toLocaleDateString('es-CL', dateOptions) === end.toLocaleDateString('es-CL', dateOptions);
  return `${start.toLocaleTimeString('es-CL', timeOptions)} – ${sameDay ? '' : `${end.toLocaleDateString('es-CL', dateOptions)}, `}${end.toLocaleTimeString('es-CL', timeOptions)}`;
}

/** Keep the reference's simple rows; reveal metadata only when an occurrence differs. */
function OccurrenceRow({ activity, reference, timeZone, current, now, onPress }: {
  activity: Activity; reference: Activity; timeZone: string; current: boolean; now: number; onPress: () => void;
}) {
  const start = new Date(activity.startAt);
  const dateOptions = { timeZone, day: 'numeric', month: 'short', year: 'numeric' } as const;
  const date = start.toLocaleDateString('es-CL', { ...dateOptions, weekday: 'long' });
  const today = start.toLocaleDateString('es-CL', dateOptions) === new Date(now).toLocaleDateString('es-CL', dateOptions);
  const schedule = scheduleLabel(activity, timeZone); const location = locationLabel(activity);
  const differentTitle = activity.title !== reference.title;
  const differentSchedule = schedule !== scheduleLabel(reference, timeZone);
  const differentLocation = location !== locationLabel(reference);
  const occurrence = activity.series ? `Ocurrencia ${activity.series.index} de ${activity.series.total}. ` : '';
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: current }} activeOpacity={0.7}
    accessibilityLabel={`${occurrence}${today ? 'Hoy. ' : ''}${current ? 'Ocurrencia actual. ' : ''}${activity.title}. ${date}. ${schedule}. ${location}. Horarios en ${timeZone}.`}
    accessibilityHint={current ? 'Vuelve a la ficha de esta ocurrencia.' : 'Abre los detalles y la inscripción de esta fecha.'}
    onPress={onPress} style={styles.occurrence}>
    <View style={[styles.dateTile, current && styles.currentDateTile]}>
      <Text style={[styles.day, current && styles.currentDateText]}>{start.toLocaleDateString('es-CL', { timeZone, day: 'numeric' })}</Text>
      <Text style={[styles.month, current && styles.currentDateText]}>{start.toLocaleDateString('es-CL', { timeZone, month: 'short' }).replace('.', '')}</Text>
    </View>
    <View style={styles.occurrenceDetails}>
      <Text style={styles.weekday}>{start.toLocaleDateString('es-CL', { timeZone, weekday: 'long' })}</Text>
      {start.toLocaleDateString('es-CL', { timeZone, year: 'numeric' }) !== new Date(now).toLocaleDateString('es-CL', { timeZone, year: 'numeric' })
        ? <Text style={styles.rowDetail}>{start.toLocaleDateString('es-CL', { timeZone, year: 'numeric' })}</Text> : null}
      {differentTitle ? <Text style={styles.rowDetail}>{activity.title}</Text> : null}
      {differentSchedule ? <Text style={styles.rowDetail}>{schedule}</Text> : null}
      {differentLocation ? <Text style={styles.rowDetail}>{location}</Text> : null}
    </View>
    {today || current ? <View style={styles.dateBadge}><Text style={styles.badgeText}>{today ? 'Hoy' : 'Actual'}</Text></View> : null}
    <DecorativeIcon icon={ChevronRight} color="#94A3B8" size={16} />
  </TouchableOpacity>;
}

/** Series stays in the current modal. Participation always belongs to the selected activity ID. */
export function ActivitySeriesView({ seriesId, currentActivityId, onBack, onSelect }: {
  seriesId: string; currentActivityId: string; onBack: () => void; onSelect: (activityId: string) => void;
}) {
  const { identity, session, refreshIdentity } = useAuth(); const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [page, setPage] = useState(1);
  const closeModal = useActivityCompactHeader();
  const canViewOccurrences = identity?.capabilities.officialActivities === true;
  const key = JSON.stringify([identity?.campusId, session?.access_token, canViewOccurrences, seriesId, revision]);
  const [state, setState] = useState<{ key: string; series: ActivitySeries | null; error: string | null }>({ key: '', series: null, error: null });
  useEffect(() => {
    if (!canViewOccurrences || !identity?.campusId || !session?.access_token) return;
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
  }, [key, canViewOccurrences, identity?.campusId, session?.access_token, seriesId, refreshIdentity]);
  const series = canViewOccurrences && state.key === key ? state.series : null; const error = state.key === key ? state.error : null;
  const totalPages = Math.max(1, Math.ceil((series?.occurrences.length ?? 0) / OCCURRENCES_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageOccurrences = series?.occurrences.slice((currentPage - 1) * OCCURRENCES_PER_PAGE, currentPage * OCCURRENCES_PER_PAGE) ?? [];
  useLayoutEffect(() => { setPage(1); }, [seriesId, identity?.campusId]);
  useLayoutEffect(() => {
    if (series) setPage(value => Math.min(value, totalPages));
  }, [series, totalPages]);
  useActivityScrollReset(`series:${seriesId}:page:${page}`);
  useEffect(() => {
    if (!series?.occurrences.length) return;
    const end = Math.min(...series.occurrences.map(value => Date.parse(value.endAt)));
    const timer = setTimeout(() => setRevision(value => value + 1), Math.min(2_147_483_647, Math.max(1, end - Date.now() + 1)));
    return () => clearTimeout(timer);
  }, [series]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const loading = canViewOccurrences && !series && !error;
  const refresh = useCallback(() => { setNow(Date.now()); setRevision(value => value + 1); }, []);
  useActivityRefresh(refresh, loading, canViewOccurrences && !loading, 'la serie');
  const reference = series?.occurrences.find(activity => activity.id === currentActivityId) ?? series?.occurrences[0];
  const timeZone = series?.recurrence.timeZone;
  const pattern = series ? recurrenceSummary({ enabled: true, ...series.recurrence,
    interval: String(series.recurrence.interval), excludedDates: '' }).replace(/^Los /, '') : '';
  const until = series ? new Date(`${series.recurrence.until}T12:00:00Z`).toLocaleDateString('es-CL', {
    timeZone: 'UTC', day: 'numeric', month: 'short',
    ...(series.recurrence.until.slice(0, 4) !== new Date(now).toLocaleDateString('es-CL', { timeZone, year: 'numeric' }) ? { year: 'numeric' } : {}),
  }).replace('.', '') : '';
  const type = reference?.type ?? series?.type;
  const closeAction = <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar serie de actividades" hitSlop={4} activeOpacity={0.7}
    onPress={closeModal ?? onBack} style={styles.closeButton}>
    <DecorativeIcon icon={X} color={APP_COLORS.PRIMARY} size={16} />
  </TouchableOpacity>;
  if (loading) return <ActivitySeriesSkeleton closeAction={closeAction} />;
  return <View style={styles.content}>
    <View style={styles.header}>
      <View style={styles.headerText}>
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={styles.title}>{reference?.title ?? series?.title ?? 'Próximas fechas'}</Text>
          {type ? <View style={[styles.typeBadge, type === 'COMMUNITY_ACTIVITY' && styles.communityBadge]}>
            <Text style={[styles.typeText, type === 'COMMUNITY_ACTIVITY' && styles.communityText]}>{type === 'OFFICIAL_EVENT' ? 'Oficial' : 'Comunitaria'}</Text>
          </View> : null}
        </View>
        {series ? <Text style={styles.pattern} accessibilityLabel={`Programación original: ${pattern}. Hasta el ${until}.`}>
          {pattern.charAt(0).toLocaleUpperCase() + pattern.slice(1)} · hasta el {until}
        </Text> : null}
      </View>
      {closeAction}
    </View>
    {!canViewOccurrences ? <View style={styles.feedback}><Text accessibilityRole="alert" style={styles.text}>
      Necesitas permiso para publicar eventos oficiales en tu campus para consultar las ocurrencias.
    </Text></View> : error ? <View style={styles.feedback}>
      <Text accessibilityRole="alert" style={styles.text}>{error}</Text>
      <TouchableOpacity accessibilityRole="button" onPress={refresh} activeOpacity={0.7} style={styles.retry}>
        <DecorativeIcon icon={RefreshCw} color={APP_COLORS.PRIMARY} /><Text style={styles.link}>Reintentar</Text>
      </TouchableOpacity>
    </View> : series && timeZone ? <>
      {reference ? <View style={styles.metadata}>
        <View style={styles.detailRow}><DecorativeIcon icon={Clock3} /><Text style={styles.metadataText}
          accessibilityLabel={`${scheduleLabel(reference, timeZone)}. Horarios en ${timeZone}.`}>{scheduleLabel(reference, timeZone)}</Text></View>
        <View style={styles.detailRow}><DecorativeIcon icon={MapPin} /><Text style={styles.metadataText}>{locationLabel(reference)}</Text></View>
      </View> : null}
      <Text accessibilityRole="header" style={styles.sectionTitle}>Próximas fechas</Text>
      <View>
        {pageOccurrences.length && reference ? pageOccurrences.map(activity => <OccurrenceRow key={activity.id}
          activity={activity} reference={reference} timeZone={timeZone} current={activity.id === currentActivityId} now={now}
          onPress={() => activity.id === currentActivityId ? onBack() : onSelect(activity.id)} />)
          : <Text style={styles.text}>No quedan ocurrencias vigentes disponibles.</Text>}
      </View>
      {series.occurrences.length >= OCCURRENCES_PER_PAGE ? <View style={styles.pagination}>
        <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage}
          label="Paginación de ocurrencias" showSinglePage />
      </View> : null}
    </> : null}
  </View>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 8 },
  skeletonHeader: { paddingRight: 48, gap: 4 },
  skeletonSection: { marginTop: 22, marginBottom: 4 },
  skeletonClose: { position: 'absolute', top: 0, right: 0 },
  pagination: { marginTop: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerText: { flex: 1, minWidth: 0, gap: 4 },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  title: { flexShrink: 1, fontSize: 20, lineHeight: 26, fontWeight: '700', color: APP_COLORS.PRIMARY },
  typeBadge: { borderRadius: 20, backgroundColor: '#E7F0FF', paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'center' },
  typeText: { fontSize: 11, lineHeight: 15, color: '#2563EB' },
  communityBadge: { backgroundColor: '#FFF4D6' }, communityText: { color: '#785600' },
  pattern: { color: APP_COLORS.SECONDARY, fontSize: 13, lineHeight: 19 },
  closeButton: { width: 36, height: 36, flexShrink: 0, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
  metadata: { gap: 8, marginTop: 18 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  metadataText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 19, color: APP_COLORS.PRIMARY },
  sectionTitle: { marginTop: 22, marginBottom: 4, fontSize: 11, lineHeight: 17, letterSpacing: 0.7,
    textTransform: 'uppercase', color: APP_COLORS.SECONDARY },
  occurrence: { minHeight: 68, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12,
    borderBottomWidth: 1, borderBottomColor: '#EDF2F7' },
  dateTile: { width: 44, minHeight: 44, flexShrink: 0, paddingVertical: 6, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center' },
  currentDateTile: { backgroundColor: APP_COLORS.PRIMARY }, currentDateText: { color: '#FFFFFF' },
  day: { fontSize: 18, lineHeight: 21, fontWeight: '700', color: APP_COLORS.PRIMARY },
  month: { fontSize: 9, lineHeight: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: APP_COLORS.SECONDARY },
  occurrenceDetails: { flex: 1, minWidth: 0, gap: 3 },
  weekday: { fontSize: 15, lineHeight: 22, fontWeight: '500', textTransform: 'capitalize', color: APP_COLORS.PRIMARY },
  rowDetail: { fontSize: 12, lineHeight: 17, color: APP_COLORS.SECONDARY },
  dateBadge: { flexShrink: 0, alignSelf: 'center', borderRadius: 20, backgroundColor: '#E7F0FF', paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { fontSize: 11, lineHeight: 15, color: '#2563EB' },
  feedback: { paddingVertical: 24, gap: 12 },
  text: { fontSize: 13, lineHeight: 20, color: APP_COLORS.SECONDARY },
  retry: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  link: { fontSize: 13, lineHeight: 19, fontWeight: '600', color: APP_COLORS.PRIMARY },
});
