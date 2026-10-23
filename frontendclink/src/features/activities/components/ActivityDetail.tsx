import { APP_COLORS } from '@/types/colors';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Flag, MapPinSearch, Repeat2, SquarePen, Trash, type LucideIcon } from 'lucide-react-native';
import { useActivityDetail } from '../hooks/useActivityDetail';
import { ACTIVITY_COLORS, ACTIVITY_LABELS, type Activity, type ActivityDetail as ActivityDetailData } from '../types/activity';
import { ActivitySeriesView } from './ActivitySeriesView';
import type { ActivityLocationOption } from '../types/creation';
import { EditActivityForm } from './EditActivityForm';
import { ContentReportForm } from '@/features/reports/components/ContentReportForm';
import { ActivityParticipationControls } from './ActivityParticipationControls';
import { ActivityParticipants } from './ActivityParticipants';
import { ActivityDetailSkeleton } from './ActivityDetailSkeleton';
import { ActivityDescription } from './ActivityDescription';
import { ActivityBackButton } from './ActivityBackButton';
import { ActivityWithdrawalButton } from './ActivityWithdrawalButton';
import { ActivityContentTransition } from './ActivityContentTransition';
import { useCompactScrollHeader, useScrollRefresh, useScrollReset } from '@/components/RefreshScrollView';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { recordViewedActivity } from '../api/activitiesApi';
import { activityOperationId } from '../types/interaction';
import { AuthApiError } from '@/lib/api/authenticated-request';

/** El texto nombra la acción; el ícono y su fondo son decorativos. */
function DetailActionButton({ icon: Icon, label, onPress, disabled, danger = false }: {
  icon: LucideIcon; label: string; onPress: () => void; disabled: boolean; danger?: boolean;
}) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled }} disabled={disabled} activeOpacity={0.75} onPress={onPress}
    style={[styles.managementButton, danger && styles.managementButtonDanger, disabled && styles.disabled]}>
    <View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.managementIcon, danger && styles.managementIconDanger]}>
      <Icon size={22} strokeWidth={1.8} color={danger ? '#B91C1C' : APP_COLORS.PRIMARY} />
    </View>
    <Text style={[styles.managementLabel, danger && styles.danger]}>{label}</Text>
  </TouchableOpacity>;
}

/** La denuncia usa su retorno a la ficha y oculta el cierre exterior hasta desmontarse. */
function ActivityReportView({ activityId, title, onBack }: {
  activityId: string; title: string; onBack: () => void;
}) {
  useCompactScrollHeader();
  return <ContentReportForm target={{ type: 'ACTIVIDAD', activityId }} title={title} onBack={onBack} />;
}

/** La ficha completa, edición y denuncia permanecen dentro del modal nativo actual. */
export function ActivityDetail({ activityId, onBack, onExplore, onSelectOccurrence, locations, onEdited, onDeleted, onEditOpen }: {
  activityId: string; onBack: () => void; onExplore?: (activity: Activity) => void; onSelectOccurrence?: (activityId: string) => void;
  locations?: ActivityLocationOption[]; onEdited?: (count: number) => void; onDeleted?: () => void;
  onEditOpen?: () => void;
}) {
  const { identity, refreshIdentity } = useAuth();
  const canViewOccurrences = identity?.capabilities.officialActivities === true;
  const { detail, ownParticipation, isLoading, error, refresh, join, leave, isUpdatingParticipation,
    pendingParticipation, participationError, remove, isDeleting, deletionError } = useActivityDetail(activityId);
  const view = useRef<{ key: string; id: string; confirmed: boolean } | null>(null);
  useEffect(() => {
    if (!identity || !detail || isLoading || error || detail.campusId !== identity.campusId) return;
    const key = JSON.stringify([identity.profile.id, identity.campusId, activityId]);
    if (view.current?.key !== key) view.current = { key, id: activityOperationId(), confirmed: false };
    if (view.current.confirmed) return;
    const intent = view.current; const abort = new AbortController();
    void recordViewedActivity(identity.campusId, activityId, intent.id, abort.signal).then(() => {
      if (!abort.signal.aborted && view.current === intent) intent.confirmed = true;
    }).catch(reason => {
      if (!abort.signal.aborted && reason instanceof AuthApiError && [401, 403].includes(reason.status)) refreshIdentity();
    });
    return () => abort.abort();
  }, [identity?.profile.id, identity?.campusId, activityId, detail?.id, detail?.campusId, isLoading, error, refreshIdentity]);
  const busy = isUpdatingParticipation || isDeleting;
  const participationControls = (status: ActivityDetailData['participation']['status'], canJoin: boolean) =>
    <ActivityParticipationControls status={status} canJoin={canJoin} pending={pendingParticipation}
      disabled={isDeleting} error={participationError} onJoin={join} />;
  const [failedBanner, setFailedBanner] = useState<string | null>(null);
  const [showSeries, setShowSeries] = useState(false);
  useLayoutEffect(() => { if (!canViewOccurrences) setShowSeries(false); }, [canViewOccurrences]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState<ActivityDetailData | null>(null);
  const [reporting, setReporting] = useState<{ id: string; title: string } | null>(null);
  const editingOpen = Boolean(editing && locations);
  useScrollReset(`${activityId}:${canViewOccurrences && showSeries ? 'series' : 'detail'}`);
  useLayoutEffect(() => {
    if (editingOpen) onEditOpen?.();
  }, [editingOpen, onEditOpen]);
  const refreshSheet = useCallback(() => { setConfirmDelete(false); refresh(); }, [refresh]);
  useScrollRefresh(refreshSheet, isLoading,
    !busy && !isLoading && !editingOpen && !reporting && !showSeries, 'la ficha');
  if (reporting?.id === activityId) return <ActivityContentTransition transitionKey="report">
    <ActivityReportView key={activityId} activityId={activityId}
      title={reporting.title} onBack={() => { setReporting(null); refresh(); }} />
  </ActivityContentTransition>;
  if (editing && locations) return <ActivityContentTransition transitionKey="edit">
    <EditActivityForm activity={editing} locations={locations}
      onCancel={() => { setEditing(null); refresh(); }} onSaved={count => { setEditing(null); onEdited?.(count); refresh(); }} />
  </ActivityContentTransition>;
  if (canViewOccurrences && showSeries && detail?.series && onSelectOccurrence) return <ActivityContentTransition transitionKey="series">
    <ActivitySeriesView seriesId={detail.series.id} currentActivityId={activityId} onBack={() => setShowSeries(false)}
      onSelect={id => { setShowSeries(false); onSelectOccurrence(id); }} />
  </ActivityContentTransition>;
  const location = detail && (detail.location.floorName.toLocaleLowerCase().includes(detail.location.buildingName.toLocaleLowerCase())
    ? detail.location.floorName : `${detail.location.buildingName} · ${detail.location.floorName}`);
  return <ActivityContentTransition transitionKey={isLoading ? 'loading' : error ? 'error' : `detail:${activityId}`}>
    <View style={styles.content}>
      <ActivityBackButton label="Volver a las actividades" onBack={onBack} disabled={busy}/>
      {isLoading ? <ActivityDetailSkeleton />
        : error ? <>
          <Text accessibilityRole="alert" style={styles.text}>{error}</Text>
          {ownParticipation ? participationControls(ownParticipation.status, false) : null}
          {ownParticipation?.status === 'JOINED' && ownParticipation.canLeave ? <View style={styles.ownRow}>
            <Text style={styles.text}>Tu inscripción</Text>
            <ActivityWithdrawalButton onLeave={leave} disabled={busy} pending={pendingParticipation === 'LEFT'} />
          </View> : null}
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
          {canViewOccurrences && detail.series ? <View style={styles.series}>
            <Text style={styles.text}>Ocurrencia {detail.series.index} de {detail.series.total} · Serie recurrente</Text>
            {onSelectOccurrence ? <DetailActionButton icon={Repeat2} disabled={busy}
              label="Ver serie y otras ocurrencias" onPress={() => setShowSeries(true)} /> : null}
          </View> : null}
          <ActivityParticipants key={detail.id} activityId={detail.id}
            canLeave={detail.participation.status === 'JOINED' && detail.participation.canLeave}
            onLeave={leave} disabled={busy} leavePending={pendingParticipation === 'LEFT'}
            refreshKey={JSON.stringify([detail.participantCount, detail.participation.status, detail.editing?.revision])} />
          {detail.category ? <Text style={styles.text}>Categoría: {detail.category}</Text> : null}
          {detail.tags?.length ? <Text style={styles.text}>Etiquetas: {detail.tags.join(', ')}</Text> : null}
          {participationControls(detail.participation.status, detail.participation.canJoin)}
          <View style={styles.management}>
            {detail.editing ? <>
              {locations?.length ? <DetailActionButton icon={SquarePen} disabled={busy}
                label={`Editar ${canViewOccurrences && detail.series ? 'esta ocurrencia' : 'actividad'}`}
                onPress={() => setEditing(detail)} /> : null}
              {confirmDelete ? <View style={styles.confirmation}>
                <Text style={styles.heading}>¿Eliminar {canViewOccurrences && detail.series ? 'esta ocurrencia' : 'esta actividad'}?</Text>
                <Text style={styles.text}>Dejará de aparecer en el mapa. Se conservarán las inscripciones y el historial{canViewOccurrences && detail.series ? '; las demás ocurrencias seguirán disponibles' : ''}.</Text>
                <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => { void remove().then(deleted => { if (deleted) (onDeleted ?? onBack)(); }); }}
                  style={[styles.deleteButton, busy && styles.disabled]}>
                  <Text style={styles.deleteText}>{isDeleting ? 'Eliminando…' : 'Confirmar eliminación'}</Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => setConfirmDelete(false)} style={styles.action}>
                  <Text style={styles.link}>Cancelar</Text>
                </TouchableOpacity>
              </View> : <DetailActionButton icon={Trash} disabled={busy} danger
                label={`Eliminar ${canViewOccurrences && detail.series ? 'esta ocurrencia' : 'actividad'}`}
                onPress={() => setConfirmDelete(true)} />}
              {deletionError ? <Text accessibilityRole="alert" style={styles.danger}>{deletionError}</Text> : null}
            </> : <DetailActionButton icon={Flag} disabled={busy} label="Denunciar actividad"
              onPress={() => setReporting({ id: detail.id, title: detail.title })} />}
            {onExplore ? <DetailActionButton icon={MapPinSearch} disabled={busy}
              label="Explorar este piso" onPress={() => onExplore(detail)} /> : null}
          </View>
        </> : null}
    </View>
  </ActivityContentTransition>;
}

const styles = StyleSheet.create({
  content: { gap: 18, paddingVertical: 4 }, header: { alignItems: 'center', gap: 10 },
  title: { width: '100%', fontSize: 23, lineHeight: 30, fontWeight: '700', color: '#0F172A', textAlign: 'center' },
  location: { fontSize: 15, lineHeight: 22, color: '#64748B', textAlign: 'center' },
  type: { fontWeight: '600', textAlign: 'center' }, organizer: { fontSize: 13, color: '#64748B', textAlign: 'center' },
  dates: { flexDirection: 'row', gap: 12 }, date: { flex: 1, minWidth: 0, padding: 12, gap: 5, backgroundColor: '#F8FAFC', borderRadius: 12 },
  dateText: { fontSize: 14, color: '#334155', lineHeight: 22 },
  heading: { fontSize: 16, fontWeight: '600', color: '#0F172A' }, text: { color: '#334155', lineHeight: 22 },
  link: { color: APP_COLORS.PRIMARY, fontWeight: '700' }, action: { minHeight: 44, paddingVertical: 12 },
  banner: { width: '100%', height: 140, borderRadius: 12 }, series: { gap: 4 },
  management: { gap: 10, paddingTop: 16, borderTopWidth: 1, borderColor: '#E2E8F0' },
  ownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  managementButton: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 16,
    shadowColor: APP_COLORS.PRIMARY, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  managementButtonDanger: { backgroundColor: '#FFF7F7', borderColor: '#FECACA' },
  managementIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#EDF3F8', pointerEvents: 'none' },
  managementIconDanger: { backgroundColor: '#FEE2E2' },
  managementLabel: { flex: 1, color: APP_COLORS.PRIMARY, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  danger: { color: '#B91C1C', fontWeight: '600', lineHeight: 22 },
  confirmation: { gap: 12, padding: 14, borderRadius: 12, backgroundColor: '#FFF7ED' },
  deleteButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: '#B91C1C', borderRadius: 10 },
  deleteText: { color: '#FFFFFF', fontWeight: '600', textAlign: 'center' }, disabled: { opacity: 0.4 },
});
