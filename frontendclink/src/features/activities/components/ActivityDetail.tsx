import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useActivityDetail } from '../hooks/useActivityDetail';
import { ACTIVITY_COLORS, ACTIVITY_LABELS, type Activity, type ActivityDetail as ActivityDetailData } from '../types/activity';
import { ActivitySeriesView } from './ActivitySeriesView';
import type { ActivityLocationOption } from '../types/creation';
import { EditActivityForm } from './EditActivityForm';
import { ReportActivityForm } from '@/features/reports/components/ReportActivityForm';
import { ActivityParticipationControls } from './ActivityParticipationControls';
import { ActivityParticipantCount } from './ActivityParticipantCount';
import { ActivityContentTransition } from './ActivityContentTransition';

/** Renders inside the current native modal; returning never changes map selection. */
export function ActivityDetail({ activityId, onBack, onExplore, onSelectOccurrence, locations, onEdited }: {
  activityId: string; onBack: () => void; onExplore?: (activity: Activity) => void; onSelectOccurrence?: (activityId: string) => void;
  locations?: ActivityLocationOption[]; onEdited?: (count: number) => void;
}) {
  const { detail, ownParticipation, isLoading, error, refresh, join, leave, isUpdatingParticipation,
    pendingParticipation, participationError } = useActivityDetail(activityId);
  const participationControls = (status: ActivityDetailData['participation']['status'], canJoin: boolean) =>
    <ActivityParticipationControls status={status} canJoin={canJoin} pending={pendingParticipation}
      error={participationError} onJoin={join} onLeave={leave} />;
  const [failedBanner, setFailedBanner] = useState<string | null>(null);
  const [showSeries, setShowSeries] = useState(false);
  const [editing, setEditing] = useState<ActivityDetailData | null>(null);
  const [reporting, setReporting] = useState<{ id: string; title: string } | null>(null);
  if (reporting?.id === activityId) return <ActivityContentTransition transitionKey="report">
    <ReportActivityForm key={activityId} activityId={activityId}
      title={reporting.title} onBack={() => { setReporting(null); refresh(); }} />
  </ActivityContentTransition>;
  if (editing && locations) return <ActivityContentTransition transitionKey="edit">
    <EditActivityForm activity={editing} locations={locations}
      onCancel={() => { setEditing(null); refresh(); }} onSaved={count => { setEditing(null); onEdited?.(count); refresh(); }} />
  </ActivityContentTransition>;
  if (showSeries && detail?.series && onSelectOccurrence) return <ActivityContentTransition transitionKey="series">
    <ActivitySeriesView seriesId={detail.series.id}
    currentActivityId={activityId} onBack={() => setShowSeries(false)}
    onSelect={id => { setShowSeries(false); onSelectOccurrence(id); }} />
  </ActivityContentTransition>;
  return <ActivityContentTransition transitionKey={isLoading ? 'loading' : error ? 'error' : `detail:${activityId}`}>
    <View style={styles.content}>
    <Pressable accessibilityRole="button" onPress={onBack} style={styles.action}>
      <Text style={styles.link}>Volver a las actividades</Text>
    </Pressable>
    {isLoading ? <><ActivityIndicator /><Text>Cargando ficha…</Text></>
      : error ? <>
        <Text accessibilityRole="alert" style={styles.text}>{error}</Text>
        {ownParticipation ? participationControls(ownParticipation.status, false) : null}
        <Pressable accessibilityRole="button" disabled={isUpdatingParticipation} onPress={refresh} style={styles.action}><Text style={styles.link}>Actualizar ficha</Text></Pressable>
      </> : detail ? <>
        <Text style={[styles.type, { color: ACTIVITY_COLORS[detail.type] }]}>{ACTIVITY_LABELS[detail.type]}</Text>
        <Text accessibilityRole="header" style={styles.title}>{detail.title}</Text>
        <ActivityParticipantCount count={detail.participantCount} loading={isUpdatingParticipation} />
        {detail.series ? <>
          <Text style={styles.heading}>Ocurrencia {detail.series.index} de {detail.series.total} · Serie recurrente</Text>
          <Text style={styles.text}>Las fechas y tu inscripción de esta ficha corresponden a esta ocurrencia.</Text>
          {onSelectOccurrence ? <Pressable accessibilityRole="button" onPress={() => setShowSeries(true)} style={styles.action}>
            <Text style={styles.link}>Ver serie y otras ocurrencias</Text>
          </Pressable> : null}
        </> : null}
        {detail.bannerUrl && failedBanner !== detail.bannerUrl ? <Image source={{ uri: detail.bannerUrl }}
          accessibilityLabel={`Imagen de ${detail.title}`} style={styles.banner} resizeMode="cover"
          onError={() => setFailedBanner(detail.bannerUrl ?? null)} /> : null}
        <Text style={styles.text}>{detail.description}</Text>
        <Text style={styles.text}>Organizador: {detail.organizer?.name ?? 'No disponible'}</Text>
        <Text style={styles.text}>Inicio: {new Date(detail.startAt).toLocaleString('es-CL')}</Text>
        <Text style={styles.text}>Término: {new Date(detail.endAt).toLocaleString('es-CL')}</Text>
        <Text style={styles.text}>Estado: Activa</Text>
        <Text accessibilityRole="header" style={styles.heading}>Ubicación</Text>
        <Text style={styles.text}>Edificio: {detail.location.buildingName}</Text>
        <Text style={styles.text}>Piso: {detail.location.floorName}</Text>
        {detail.location.poiName ? <Text style={styles.text}>Punto de interés: {detail.location.poiName}</Text> : null}
        {detail.location.customLabel ? <Text style={styles.text}>{detail.location.customLabel}</Text> : null}
        {detail.category ? <Text style={styles.text}>Categoría: {detail.category}</Text> : null}
        {detail.tags?.length ? <Text style={styles.text}>Etiquetas: {detail.tags.join(', ')}</Text> : null}
        {participationControls(detail.participation.status, detail.participation.canJoin)}
        {onExplore ? <Pressable accessibilityRole="button" onPress={() => onExplore(detail)} style={styles.action}>
          <Text style={styles.link}>Explorar este piso</Text>
        </Pressable> : null}
        {detail.editing && locations?.length ? <Pressable disabled={isUpdatingParticipation} accessibilityRole="button" onPress={() => setEditing(detail)} style={styles.action}>
          <Text style={styles.link}>Editar {detail.series ? 'ocurrencia o próximas' : 'actividad'}</Text>
        </Pressable> : null}
        <Pressable accessibilityRole="button" disabled={isUpdatingParticipation}
          onPress={() => setReporting({ id: detail.id, title: detail.title })} style={styles.action}>
          <Text style={styles.link}>Denunciar actividad</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={refresh} disabled={isUpdatingParticipation} style={styles.action}>
          <Text style={styles.link}>Actualizar ficha</Text>
        </Pressable>
      </> : null}
    </View>
  </ActivityContentTransition>;
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingVertical: 12 }, title: { fontSize: 21, fontWeight: '700', color: '#0F172A' },
  heading: { fontSize: 16, fontWeight: '600', color: '#0F172A' }, type: { fontWeight: '700' },
  text: { color: '#334155', lineHeight: 22 }, link: { color: '#0B6E75', fontWeight: '700' },
  action: { paddingVertical: 12 }, banner: { width: '100%', height: 160, borderRadius: 10 },
});
