import { APP_COLORS } from '@/types/colors';
import { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useActivityDetail } from '../hooks/useActivityDetail';
import { ACTIVITY_COLORS, ACTIVITY_LABELS, type Activity, type ActivityDetail as ActivityDetailData } from '../types/activity';
import { ActivitySeriesView } from './ActivitySeriesView';
import type { ActivityLocationOption } from '../types/creation';
import { EditActivityForm } from './EditActivityForm';
import { ReportActivityForm } from '@/features/reports/components/ReportActivityForm';
import { ActivityParticipationControls } from './ActivityParticipationControls';
import { ActivityParticipants } from './ActivityParticipants';
import { ActivityContentTransition } from './ActivityContentTransition';
import { useActivityRefresh } from './ActivityRefreshScrollView';

const DESCRIPTION_PREVIEW_LENGTH = 240;

/** Keep expansion scoped to the current description through the caller's key. */
function ActivityDescription({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false);
  const characters = Array.from(description);
  const canExpand = characters.length > DESCRIPTION_PREVIEW_LENGTH;
  const collapsed = canExpand && !expanded;
  return <View style={styles.descriptionBlock}>
    <Text style={styles.description} numberOfLines={collapsed ? 4 : undefined} ellipsizeMode="tail">
      {collapsed ? `${characters.slice(0, DESCRIPTION_PREVIEW_LENGTH).join('').trimEnd()}…` : description}
    </Text>
    {canExpand ? <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded }}
      aria-expanded={expanded} onPress={() => setExpanded(value => !value)} style={styles.descriptionToggle}>
      <Text style={styles.link}>{expanded ? 'Ver menos' : 'Ver más'}</Text>
    </TouchableOpacity> : null}
  </View>;
}

/** The full sheet, edit and report stay inside the current native modal. */
export function ActivityDetail({ activityId, onBack, onExplore, onSelectOccurrence, locations, onEdited, onDeleted, onEditOpen }: {
  activityId: string; onBack: () => void; onExplore?: (activity: Activity) => void; onSelectOccurrence?: (activityId: string) => void;
  locations?: ActivityLocationOption[]; onEdited?: (count: number) => void; onDeleted?: () => void;
  onEditOpen?: () => void;
}) {
  const { detail, ownParticipation, isLoading, error, refresh, join, leave, isUpdatingParticipation,
    pendingParticipation, participationError, remove, isDeleting, deletionError } = useActivityDetail(activityId);
  const busy = isUpdatingParticipation || isDeleting;
  const participationControls = (status: ActivityDetailData['participation']['status'], canJoin: boolean) =>
    <ActivityParticipationControls status={status} canJoin={canJoin} pending={pendingParticipation}
      disabled={isDeleting} error={participationError} onJoin={join} onLeave={leave} />;
  const [failedBanner, setFailedBanner] = useState<string | null>(null);
  const [showSeries, setShowSeries] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState<ActivityDetailData | null>(null);
  const [reporting, setReporting] = useState<{ id: string; title: string } | null>(null);
  const editingOpen = Boolean(editing && locations);
  useLayoutEffect(() => {
    if (editingOpen) onEditOpen?.();
  }, [editingOpen, onEditOpen]);
  const refreshSheet = useCallback(() => { setConfirmDelete(false); refresh(); }, [refresh]);
  useActivityRefresh(refreshSheet, isLoading,
    !busy && !isLoading && !editingOpen && !reporting && !showSeries);
  if (reporting?.id === activityId) return <ActivityContentTransition transitionKey="report">
    <ReportActivityForm key={activityId} activityId={activityId}
      title={reporting.title} onBack={() => { setReporting(null); refresh(); }} />
  </ActivityContentTransition>;
  if (editing && locations) return <ActivityContentTransition transitionKey="edit">
    <EditActivityForm activity={editing} locations={locations}
      onCancel={() => { setEditing(null); refresh(); }} onSaved={count => { setEditing(null); onEdited?.(count); refresh(); }} />
  </ActivityContentTransition>;
  if (showSeries && detail?.series && onSelectOccurrence) return <ActivityContentTransition transitionKey="series">
    <ActivitySeriesView seriesId={detail.series.id} currentActivityId={activityId} onBack={() => setShowSeries(false)}
      onSelect={id => { setShowSeries(false); onSelectOccurrence(id); }} />
  </ActivityContentTransition>;
  const location = detail && (detail.location.floorName.toLocaleLowerCase().includes(detail.location.buildingName.toLocaleLowerCase())
    ? detail.location.floorName : `${detail.location.buildingName} · ${detail.location.floorName}`);
  return <ActivityContentTransition transitionKey={isLoading ? 'loading' : error ? 'error' : `detail:${activityId}`}>
    <View style={styles.content}>
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={onBack} style={styles.action}>
        <Text style={styles.link}>‹ Volver a las actividades</Text>
      </TouchableOpacity>
      {isLoading ? <View style={styles.loading}><ActivityIndicator color={APP_COLORS.PRIMARY} /><Text style={styles.text}>Cargando ficha…</Text></View>
        : error ? <>
          <Text accessibilityRole="alert" style={styles.text}>{error}</Text>
          {ownParticipation ? participationControls(ownParticipation.status, false) : null}
          <Text style={styles.text}>Desliza hacia abajo desde el inicio para reintentar.</Text>
        </> : detail ? <>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>{detail.title}</Text>
            <Text style={styles.location}>{[location, detail.location.poiName, detail.location.customLabel].filter(Boolean).join(' · ')}</Text>
            <ActivityDescription key={`${detail.id}:${detail.description}`} description={detail.description} />
            <Text style={[styles.type, { color: ACTIVITY_COLORS[detail.type] }]}>{ACTIVITY_LABELS[detail.type]} · Activa</Text>
            <Text style={styles.organizer}>Organizador: {detail.organizer?.name ?? 'No disponible'}</Text>
          </View>
          {detail.bannerUrl && failedBanner !== detail.bannerUrl ? <Image source={{ uri: detail.bannerUrl }}
            accessibilityLabel={`Imagen de ${detail.title}`} style={styles.banner} resizeMode="cover"
            onError={() => setFailedBanner(detail.bannerUrl ?? null)} /> : null}
          <View style={styles.dates}>
            {([['Inicio', detail.startAt], ['Término', detail.endAt]] as const).map(([label, value]) => <View key={label} style={styles.date}>
              <Text style={styles.heading}>{label}</Text>
              <Text style={styles.dateText}>{new Date(value).toLocaleDateString('es-CL')}</Text>
              <Text style={styles.dateText}>{new Date(value).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>)}
          </View>
          {detail.series ? <View style={styles.series}>
            <Text style={styles.text}>Ocurrencia {detail.series.index} de {detail.series.total} · Serie recurrente</Text>
            {onSelectOccurrence ? <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => setShowSeries(true)} style={styles.action}>
              <Text style={styles.link}>Ver serie y otras ocurrencias</Text>
            </TouchableOpacity> : null}
          </View> : null}
          <ActivityParticipants key={detail.id} activityId={detail.id}
            refreshKey={JSON.stringify([detail.participantCount, detail.participation.status, detail.editing?.revision])} />
          {detail.category ? <Text style={styles.text}>Categoría: {detail.category}</Text> : null}
          {detail.tags?.length ? <Text style={styles.text}>Etiquetas: {detail.tags.join(', ')}</Text> : null}
          {participationControls(detail.participation.status, detail.participation.canJoin)}
          <View style={styles.management}>
            {detail.editing ? <>
              {locations?.length ? <TouchableOpacity disabled={busy} accessibilityRole="button" onPress={() => setEditing(detail)} style={styles.action}>
                <Text style={styles.link}>Editar {detail.series ? 'ocurrencia o próximas' : 'actividad'}</Text>
              </TouchableOpacity> : null}
              {confirmDelete ? <View style={styles.confirmation}>
                <Text style={styles.heading}>¿Eliminar {detail.series ? 'esta ocurrencia' : 'esta actividad'}?</Text>
                <Text style={styles.text}>Dejará de aparecer en el mapa. Se conservarán las inscripciones y el historial{detail.series ? '; las demás ocurrencias seguirán disponibles' : ''}.</Text>
                <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => { void remove().then(deleted => { if (deleted) (onDeleted ?? onBack)(); }); }}
                  style={[styles.deleteButton, busy && styles.disabled]}>
                  <Text style={styles.deleteText}>{isDeleting ? 'Eliminando…' : 'Confirmar eliminación'}</Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => setConfirmDelete(false)} style={styles.action}>
                  <Text style={styles.link}>Cancelar</Text>
                </TouchableOpacity>
              </View> : <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => setConfirmDelete(true)} style={styles.action}>
                <Text style={styles.danger}>Eliminar {detail.series ? 'esta ocurrencia' : 'actividad'}</Text>
              </TouchableOpacity>}
              {deletionError ? <Text accessibilityRole="alert" style={styles.danger}>{deletionError}</Text> : null}
            </> : <TouchableOpacity accessibilityRole="button" disabled={busy}
              onPress={() => setReporting({ id: detail.id, title: detail.title })} style={styles.action}>
              <Text style={styles.link}>Denunciar actividad</Text>
            </TouchableOpacity>}
            {onExplore ? <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => onExplore(detail)} style={styles.action}>
              <Text style={styles.link}>Explorar este piso</Text>
            </TouchableOpacity> : null}
          </View>
        </> : null}
    </View>
  </ActivityContentTransition>;
}

const styles = StyleSheet.create({
  content: { gap: 18, paddingVertical: 4 }, header: { alignItems: 'center', gap: 10 },
  title: { width: '100%', fontSize: 23, lineHeight: 30, fontWeight: '700', color: '#0F172A', textAlign: 'center' },
  location: { fontSize: 15, lineHeight: 22, color: '#64748B', textAlign: 'center' },
  descriptionBlock: { width: '100%', gap: 4 },
  description: { fontSize: 15, color: '#334155', lineHeight: 23, textAlign: 'center' },
  descriptionToggle: { minHeight: 44, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  type: { fontWeight: '600', textAlign: 'center' }, organizer: { fontSize: 13, color: '#64748B', textAlign: 'center' },
  dates: { flexDirection: 'row', gap: 12 }, date: { flex: 1, minWidth: 0, padding: 12, gap: 5, backgroundColor: '#F8FAFC', borderRadius: 12 },
  dateText: { fontSize: 14, color: '#334155', lineHeight: 22 },
  heading: { fontSize: 16, fontWeight: '600', color: '#0F172A' }, text: { color: '#334155', lineHeight: 22 },
  link: { color: APP_COLORS.PRIMARY, fontWeight: '700' }, action: { minHeight: 44, paddingVertical: 12 },
  banner: { width: '100%', height: 140, borderRadius: 12 }, series: { gap: 4 },
  management: { gap: 4, paddingTop: 12, borderTopWidth: 1, borderColor: '#E2E8F0' },
  danger: { color: '#B91C1C', fontWeight: '600', lineHeight: 22 },
  confirmation: { gap: 12, padding: 14, borderRadius: 12, backgroundColor: '#FFF7ED' },
  deleteButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: '#B91C1C', borderRadius: 10 },
  deleteText: { color: '#FFFFFF', fontWeight: '600', textAlign: 'center' }, disabled: { opacity: 0.4 },
  loading: { minHeight: 360, justifyContent: 'center', alignItems: 'center', gap: 12 },
});
