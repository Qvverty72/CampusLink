import { safeAreaInset } from '@/lib/layout/safeArea';
import { ArrowRight, CalendarDays, MapPin, X } from 'lucide-react-native';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActivityPreview } from '@/features/activities/hooks/useActivityPreview';
import { Skeleton, SkeletonBlock } from '@/components/Skeleton';
import { APP_COLORS } from '@/types/colors';
import type { ActivityNotification } from '../types/notification';
import type { NotificationActivitySnapshot } from '../types/notification';
import { useNotificationActivityChange } from '../hooks/useNotificationActivityChange';

const TITLES: Record<ActivityNotification['type'], string> = {
  OFFICIAL_EVENT_PUBLISHED: 'Publicación de evento oficial',
  OFFICIAL_EVENT_STARTED: 'Inicio de evento oficial',
  ACTIVITY_CHANGED: 'Actividad modificada',
};

/** Vista previa informativa; las acciones de la actividad se realizan en el mapa. */
export function NotificationActivityModal({ activityId, notificationId, notificationType, onClose, onExplore }: {
  activityId: string; notificationId?: string; notificationType: ActivityNotification['type']; onClose: () => void; onExplore: (id: string) => void;
}) {
  const modified = notificationType === 'ACTIVITY_CHANGED';
  const preview = useActivityPreview(activityId, !modified);
  const comparison = useNotificationActivityChange(notificationId, activityId, modified);
  const { isLoading, error, refresh } = modified ? comparison : preview;
  const detail = preview.detail, change = comparison.change;
  const targetId = modified ? change?.activityId : detail?.id;
  const insets = useSafeAreaInsets();
  const date = (value: string) => new Date(value).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={[styles.overlay, { paddingTop: safeAreaInset('top', insets.top, { min: 16 }), paddingBottom: safeAreaInset('bottom', insets.bottom, { min: 16 }),
      paddingLeft: safeAreaInset('left', insets.left, { min: 16 }), paddingRight: safeAreaInset('right', insets.right, { min: 16 }) }]}>
      <TouchableOpacity accessible={false} aria-hidden activeOpacity={1} onPress={onClose} style={StyleSheet.absoluteFill} />
      <View style={styles.panel} accessibilityViewIsModal onAccessibilityEscape={onClose}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.headerTitle}>{TITLES[notificationType]}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Volver a notificaciones" activeOpacity={0.65} onPress={onClose} style={styles.close}>
            <X size={20} color="#FFFFFF" strokeWidth={1.7} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {isLoading ? <Skeleton label="Cargando aviso de actividad" contentStyle={styles.skeleton}>
            {modified ? <>
              <SkeletonBlock width="80%" height={24} style={{ alignSelf: 'center' }} />
              <View style={styles.comparison}><SkeletonBlock style={{ flex: 1 }} height={180} borderRadius={14} /><SkeletonBlock style={{ flex: 1 }} height={180} borderRadius={14} /></View>
            </> : <>
              <SkeletonBlock width="85%" height={24} /><SkeletonBlock width="65%" height={12} />
              <SkeletonBlock height={64} borderRadius={14} />
            </>}
            <SkeletonBlock height={46} borderRadius={12} />
          </Skeleton> : error ? <>
            <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
            <TouchableOpacity accessibilityRole="button" onPress={refresh} style={styles.retry}><Text style={styles.retryText}>Reintentar</Text></TouchableOpacity>
          </> : change && modified ? <>
            <Text accessibilityRole="header" style={styles.changeTitle}>{change.title}</Text>
            <View style={styles.comparison}>
              {(['before', 'after'] as const).map((side, index) => <View key={side} style={styles.comparisonSide}>
                {index === 1 && <View accessible={false} aria-hidden style={styles.arrow}><ArrowRight size={14} color="#FFFFFF" /></View>}
                <View style={[styles.column, side === 'after' && styles.after]}>
                  <Text accessibilityRole="header" style={[styles.columnHeading, side === 'after' && styles.afterHeading]}>{side === 'before' ? 'ANTES' : 'AHORA'}</Text>
                  {comparisonFields(change.before, change.after).map(field => <View key={field.label} style={styles.field}>
                    <Text style={styles.fieldLabel}>{field.label}</Text>
                    <Text style={[styles.fieldValue, field.before !== field.after && (side === 'before' ? styles.oldValue : styles.newValue)]}>{field[side]}</Text>
                  </View>)}
                </View>
              </View>)}
            </View>
          </> : detail && <>
            <View style={styles.copy}>
              <Text accessibilityRole="header" style={styles.title}>{detail.title}</Text>
              <Text numberOfLines={2} style={styles.description}>{detail.description}</Text>
            </View>
            <View style={styles.metadata}>
              <View style={styles.info}><CalendarDays size={16} color={APP_COLORS.SECONDARY} /><Text style={styles.infoText}>{date(detail.startAt)} — {date(detail.endAt)}</Text></View>
              <View style={styles.info}><MapPin size={16} color={APP_COLORS.SECONDARY} /><Text style={styles.infoText}>{detail.location.buildingName}</Text></View>
            </View>
          </>}
          {!isLoading && !error && targetId && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Explorar actividad en el mapa" activeOpacity={0.65}
              onPress={() => onExplore(targetId)} style={styles.explore}>
              <MapPin size={17} color="#FFFFFF" /><Text style={styles.exploreText}>Explorar actividad en el mapa</Text>
            </TouchableOpacity>}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

function comparisonFields(before: NotificationActivitySnapshot, after: NotificationActivitySnapshot) {
  const date = (value: string) => new Date(value).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = (value: string) => new Date(value).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dates = (value: NotificationActivitySnapshot) => date(value.startAt) === date(value.endAt) ? date(value.startAt) : `${date(value.startAt)} – ${date(value.endAt)}`;
  const times = (value: NotificationActivitySnapshot) => `${time(value.startAt)} – ${time(value.endAt)}`;
  const place = (value: NotificationActivitySnapshot) => value.location
    ? [value.location.buildingName, value.location.floorName, value.location.poiName, value.location.customLabel].filter(Boolean).join(' · ')
    : 'Ubicación no disponible';
  return [
    { label: 'Fecha', before: dates(before), after: dates(after) },
    { label: 'Hora', before: times(before), after: times(after) },
    { label: 'Lugar', before: place(before), after: place(after) },
    ...(before.title !== after.title ? [{ label: 'Título', before: before.title, after: after.title }] : []),
    ...(before.description !== after.description ? [{ label: 'Descripción', before: before.description, after: after.description }] : []),
  ];
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#00000080', justifyContent: 'center', alignItems: 'center' },
  panel: { width: '100%', maxWidth: 420, maxHeight: '90%', flexShrink: 1, borderRadius: 20, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 52, paddingLeft: 16, paddingRight: 6, backgroundColor: APP_COLORS.PRIMARY },
  headerTitle: { flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '700', lineHeight: 20 },
  close: { width: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  scroll: { flexGrow: 0, flexShrink: 1 }, content: { padding: 16, gap: 16 },
  copy: { gap: 6 }, title: { color: APP_COLORS.PRIMARY, fontSize: 22, fontWeight: '700', lineHeight: 28 },
  description: { color: APP_COLORS.SECONDARY, fontSize: 13, lineHeight: 20 },
  metadata: { backgroundColor: '#F1F5F9', borderRadius: 14, padding: 12, gap: 8 },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, infoText: { flex: 1, color: APP_COLORS.PRIMARY, fontSize: 12, lineHeight: 18 },
  explore: { minHeight: 46, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, borderRadius: 12, backgroundColor: '#1768D7', padding: 12 },
  exploreText: { flexShrink: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '600', lineHeight: 19 },
  skeleton: { gap: 16 }, error: { color: '#A93226', fontSize: 13, lineHeight: 20 },
  changeTitle: { color: APP_COLORS.PRIMARY, fontSize: 19, lineHeight: 25, fontWeight: '700', textAlign: 'center' },
  comparison: { flexDirection: 'row', gap: 30, alignItems: 'stretch' },
  comparisonSide: { flex: 1, minWidth: 0 },
  column: { flex: 1, gap: 10, padding: 12, borderRadius: 14, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#F1F5F9' },
  after: { backgroundColor: '#EAF3FF', borderColor: '#1768D7' },
  columnHeading: { color: APP_COLORS.SECONDARY, fontSize: 10, lineHeight: 15, fontWeight: '700', letterSpacing: 0.4 },
  afterHeading: { color: '#1768D7' },
  field: { gap: 2 }, fieldLabel: { color: APP_COLORS.SECONDARY, fontSize: 10, lineHeight: 15 },
  fieldValue: { color: APP_COLORS.PRIMARY, fontSize: 12, lineHeight: 18, flexShrink: 1 },
  oldValue: { textDecorationLine: 'line-through', color: '#61788D' }, newValue: { fontWeight: '700' },
  arrow: { position: 'absolute', left: -26, top: '45%', width: 22, height: 22, borderRadius: 11, backgroundColor: '#1768D7', alignItems: 'center', justifyContent: 'center' },
  retry: { minHeight: 44, justifyContent: 'center', alignItems: 'center' }, retryText: { color: APP_COLORS.PRIMARY, fontWeight: '600' },
});
