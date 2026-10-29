import { safeAreaInset } from '@/lib/layout/safeArea';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { BellOff, X, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { APP_COLORS } from '@/types/colors';
import { RefreshScrollView } from '@/components/RefreshScrollView';
import { PhysicalgoodsHistoryDetail } from '@/features/marketplace/physicalgoods/components/PhysicalgoodsHistory';
import { PhysicalgoodsTransaction } from '@/features/marketplace/physicalgoods/components/PhysicalgoodsTransaction';
import type { PhysicalgoodsTransactionTarget } from '@/features/marketplace/physicalgoods/types/publication';
import { useActivityNotifications } from '../hooks/useActivityNotifications';
import { useUnreadNotificationCount } from '../hooks/useUnreadNotificationCount';
import { NotificationItem } from './NotificationItem';
import { NotificationSkeleton } from './NotificationSkeleton';
import { NotificationActivityModal } from './NotificationActivityModal';
import { NotificationResourceModal } from './NotificationResourceModal';
import { groupNotifications } from '../utils/notificationPresentation';
import type { ActivityNotification } from '../types/notification';

/** Ruta modal de bandeja propia; lectura/eliminación esperan confirmación del servidor. */
export function NotificationsScreen() {
  const { identity } = useAuth();
  return <NotificationsContent key={JSON.stringify([identity?.userId, identity?.campusId])} />;
}

function NotificationsContent() {
  const { unreadCount, refreshUnreadCount, loading: unreadLoading } = useUnreadNotificationCount();
  const { items, cursor, busy, loading, loadingMore, error, activityId, setActivityId, publicationId, setPublicationId, resourceNotification, setResourceNotification, load, update } = useActivityNotifications(refreshUnreadCount);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [agreement, setAgreement] = useState<PhysicalgoodsTransactionTarget | null>(null);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [activityNotificationType, setActivityNotificationType] = useState<ActivityNotification['type']>('OFFICIAL_EVENT_PUBLISHED');
  const [activityNotificationId, setActivityNotificationId] = useState<string>();
  const refresh = async () => {
    setPullRefreshing(true);
    try { refreshUnreadCount(); await load(); }
    finally { setPullRefreshing(false); }
  };
  const close = () => { if (router.canGoBack()) router.back(); else router.replace('/profile'); };
  const groups = groupNotifications(items);
  const listLoading = loading || pullRefreshing;
  const showListSkeleton = listLoading && !loadingMore;

  return (
    <View style={[styles.screen, {
      paddingTop: safeAreaInset('top', insets.top, { min: 16 }), paddingBottom: safeAreaInset('bottom', insets.bottom, { min: 16 }),
      paddingLeft: safeAreaInset('left', insets.left, { min: 16 }), paddingRight: safeAreaInset('right', insets.right, { min: 16 }),
    }]}>
      <TouchableOpacity accessible={false} aria-hidden activeOpacity={1} onPress={close} style={StyleSheet.absoluteFill} />
      <View style={styles.panel} accessibilityViewIsModal onAccessibilityEscape={close}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text accessibilityRole="header" accessibilityLabel={unreadCount === null ? 'Notificaciones' : `Notificaciones, ${unreadCount} sin leer`} style={styles.title}>Notificaciones</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar notificaciones" activeOpacity={0.65} style={styles.iconButton} onPress={close}>
            <NotificationIcon icon={X} />
          </TouchableOpacity>
        </View>
        <RefreshScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
          onRefresh={refresh} refreshing={listLoading || busy || unreadLoading}
          refreshEnabled={!listLoading && !busy && !unreadLoading && !activityId && !publicationId && !agreement && !resourceNotification}
          refreshLabel="las notificaciones" indicatorColor={APP_COLORS.ACCENT} refreshIndicatorOffset={8}>
          {showListSkeleton && <NotificationSkeleton label={pullRefreshing ? 'Actualizando notificaciones' : 'Cargando notificaciones'} />}
          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {!listLoading && !busy && !error && !items.length && (
            <View style={styles.empty}>
              <NotificationIcon icon={BellOff} size={32} />
              <Text style={styles.emptyTitle}>No tienes notificaciones</Text>
              <Text style={styles.subtitle}>Aquí aparecerán tus próximos avisos.</Text>
            </View>
          )}
          {!showListSkeleton && groups.map(group => <View key={group.title} style={styles.group}>
            <Text accessibilityRole="header" style={styles.groupTitle}>{group.title.toLocaleUpperCase('es')}</Text>
            <View>{group.items.map(item => <NotificationItem key={item.id} item={item} busy={busy}
              onOpen={() => { if ('activityId' in item) { setActivityNotificationType(item.type); setActivityNotificationId(item.id); } void update(item, false); }} onDelete={() => { void update(item, true); }} />)}</View>
          </View>)}
          {loadingMore && <NotificationSkeleton rows={2} heading={false} label="Cargando más notificaciones" />}
          {cursor && !showListSkeleton && !loadingMore && (
            <TouchableOpacity disabled={busy} accessibilityRole="button" activeOpacity={0.65} style={[styles.moreButton, busy && styles.disabled]} onPress={() => { void load(cursor); }}>
              <Text style={styles.openText}>Cargar más</Text>
            </TouchableOpacity>
          )}
        </RefreshScrollView>
      </View>
      {activityId && <NotificationActivityModal key={activityNotificationId} activityId={activityId} notificationId={activityNotificationId} notificationType={activityNotificationType} onClose={() => setActivityId(null)}
        onExplore={id => { setActivityId(null); router.dismissTo({ pathname: '/map', params: { activityId: id } }); }} />}
      {publicationId && <PhysicalgoodsHistoryDetail key={publicationId} target={{ publicationId }} refreshEnabled={false} onClose={() => setPublicationId(null)}
        onAgreement={(id, transactionId) => { setPublicationId(null); setAgreement({ publicationId: id, transactionId }); }} />}
      {agreement && <PhysicalgoodsTransaction key={agreement.transactionId} target={agreement} refreshEnabled={false} onChanged={() => { void load(); refreshUnreadCount(); }} onClose={() => setAgreement(null)} />}
      {resourceNotification && <NotificationResourceModal key={resourceNotification.id} item={resourceNotification}
        onClose={() => setResourceNotification(null)} onChanged={() => { void load(); refreshUnreadCount(); }} />}
    </View>
  );
}

function NotificationIcon({ icon: Icon, color = '#FFFFFFB8', size = 20 }: { icon: LucideIcon; color?: string; size?: number }) {
  return <View style={{ pointerEvents: 'none' }} accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Icon size={size} color={color} strokeWidth={1.7} />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#00000080', justifyContent: 'center', alignItems: 'center' },
  panel: { width: '100%', maxWidth: 560, height: '86%', maxHeight: '100%', backgroundColor: APP_COLORS.PRIMARY, borderRadius: 20, borderWidth: 1, borderColor: '#FFFFFF1A', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 16, paddingRight: 8, paddingTop: 8, paddingBottom: 4 },
  headerText: { flex: 1, gap: 3 },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', lineHeight: 25 },
  subtitle: { color: '#FFFFFFB8', fontSize: 12, lineHeight: 18 },
  iconButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  scroll: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, gap: 24 },
  group: { gap: 8 },
  groupTitle: { color: '#FFFFFFB8', fontSize: 10, lineHeight: 16, fontWeight: '500', letterSpacing: 1 },
  openText: { color: APP_COLORS.ACCENT, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  moreButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 32 },
  emptyTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  error: { color: '#FFB4AB', fontSize: 13, lineHeight: 20 },
  disabled: { opacity: 0.5 },
});
