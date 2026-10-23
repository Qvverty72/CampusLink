import { useRouter } from 'expo-router';
import { useState } from 'react';
import { BellOff, ChevronRight, Trash2, X, type LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { APP_COLORS } from '@/types/colors';
import { ActivityDetail } from '@/features/activities/components/ActivityDetail';
import { RefreshScrollView } from '@/components/RefreshScrollView';
import { PhysicalgoodsHistoryDetail } from '@/features/marketplace/physicalgoods/components/PhysicalgoodsHistory';
import { PhysicalgoodsTransaction } from '@/features/marketplace/physicalgoods/components/PhysicalgoodsTransaction';
import type { PhysicalgoodsTransactionTarget } from '@/features/marketplace/physicalgoods/types/publication';
import { useActivityNotifications } from '../hooks/useActivityNotifications';
import { useUnreadNotificationCount } from '../hooks/useUnreadNotificationCount';

/** Ruta modal de bandeja propia; lectura/eliminación esperan confirmación del servidor. */
export function NotificationsScreen() {
  const { identity } = useAuth();
  return <NotificationsContent key={JSON.stringify([identity?.userId, identity?.campusId])} />;
}

function NotificationsContent() {
  const { unreadCount, refreshUnreadCount, loading: unreadLoading } = useUnreadNotificationCount();
  const { items, cursor, busy, error, activityId, setActivityId, publicationId, setPublicationId, load, update } = useActivityNotifications(refreshUnreadCount);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [agreement, setAgreement] = useState<PhysicalgoodsTransactionTarget | null>(null);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const refresh = async () => {
    setPullRefreshing(true);
    try { refreshUnreadCount(); await load(); }
    finally { setPullRefreshing(false); }
  };
  const close = () => { if (router.canGoBack()) router.back(); else router.replace('/profile'); };

  return (
    <View style={[styles.screen, {
      paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16),
      paddingLeft: Math.max(insets.left, 16), paddingRight: Math.max(insets.right, 16),
    }]}>
      <TouchableOpacity accessible={false} aria-hidden activeOpacity={1} onPress={close} style={StyleSheet.absoluteFill} />
      <View style={styles.panel} accessibilityViewIsModal onAccessibilityEscape={close}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text accessibilityRole="header" style={styles.title}>Notificaciones</Text>
            {unreadCount !== null && <Text style={styles.subtitle}>{unreadCount === 0 ? 'Todo al día' : `${unreadCount} sin leer`}</Text>}
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar notificaciones" activeOpacity={0.65} style={styles.iconButton} onPress={close}>
            <NotificationIcon icon={X} />
          </TouchableOpacity>
        </View>
        <RefreshScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
          onRefresh={refresh} refreshing={pullRefreshing || busy || unreadLoading}
          refreshEnabled={!pullRefreshing && !busy && !unreadLoading && !activityId && !publicationId && !agreement}
          refreshLabel="las notificaciones" indicatorColor={APP_COLORS.ACCENT} refreshIndicatorOffset={8}>
          {busy && !pullRefreshing && <ActivityIndicator color={APP_COLORS.ACCENT} accessibilityLabel="Cargando notificaciones" />}
          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {!busy && !error && !items.length && (
            <View style={styles.empty}>
              <NotificationIcon icon={BellOff} size={32} />
              <Text style={styles.emptyTitle}>No tienes notificaciones</Text>
              <Text style={styles.subtitle}>Aquí aparecerán tus próximos avisos.</Text>
            </View>
          )}
          {items.map(item => (
            <View key={item.id} style={[styles.card, !item.readAt && styles.unreadCard]}>
              <Text style={styles.type}>
                {item.type === 'PHYSICAL_PUBLICATION_CLOSE_REMINDER' ? 'Revisar cierre de publicación'
                  : item.type === 'OFFICIAL_EVENT_PUBLISHED' ? 'Evento oficial publicado'
                  : item.type === 'OFFICIAL_EVENT_STARTED' ? 'Evento oficial en curso' : 'Cambios en tu actividad'}
                {item.readAt ? '' : ' · Sin leer'}
              </Text>
              <Text accessibilityRole="header" style={styles.heading}>{item.title}</Text>
              <Text style={styles.message}>{item.message}</Text>
              <Text style={styles.date}>{new Date(item.createdAt).toLocaleString('es-CL')}</Text>
              <View style={styles.actions}>
                <TouchableOpacity disabled={busy} accessibilityRole="button" accessibilityState={{ disabled: busy }}
                  activeOpacity={0.65} style={[styles.openButton, busy && styles.disabled]} onPress={() => { void update(item, false); }}>
                  <Text style={styles.openText}>{item.type === 'PHYSICAL_PUBLICATION_CLOSE_REMINDER' ? 'Revisar publicación' : 'Ver actividad'}</Text>
                  <NotificationIcon icon={ChevronRight} color={APP_COLORS.ACCENT} size={16} />
                </TouchableOpacity>
                <TouchableOpacity disabled={busy} accessibilityRole="button" accessibilityLabel={`Eliminar notificación de ${item.title}`} accessibilityState={{ disabled: busy }}
                  activeOpacity={0.65} style={[styles.iconButton, busy && styles.disabled]} onPress={() => { void update(item, true); }}>
                  <NotificationIcon icon={Trash2} size={18} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {cursor && (
            <TouchableOpacity disabled={busy} accessibilityRole="button" activeOpacity={0.65} style={[styles.moreButton, busy && styles.disabled]} onPress={() => { void load(cursor); }}>
              <Text style={styles.openText}>Cargar más</Text>
            </TouchableOpacity>
          )}
        </RefreshScrollView>
      </View>
      <Modal visible={!!activityId} transparent animationType="slide" onRequestClose={() => setActivityId(null)}>
        <View style={styles.detailOverlay}>
          <RefreshScrollView style={styles.detailModal} contentContainerStyle={{ padding: 20 }} onClose={() => setActivityId(null)}>
            {activityId && <ActivityDetail key={activityId} activityId={activityId} onBack={() => setActivityId(null)} onSelectOccurrence={setActivityId} />}
          </RefreshScrollView>
        </View>
      </Modal>
      {publicationId && <PhysicalgoodsHistoryDetail key={publicationId} target={{ publicationId }} onClose={() => setPublicationId(null)}
        onAgreement={(id, transactionId) => { setPublicationId(null); setAgreement({ publicationId: id, transactionId }); }}
        onOpen={id => { setPublicationId(null); router.push({ pathname: '/physicalgoods', params: { publicationId: id } }); }} />}
      {agreement && <PhysicalgoodsTransaction key={agreement.transactionId} target={agreement} onChanged={() => { void load(); refreshUnreadCount(); }} onClose={() => setAgreement(null)} />}
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 16, paddingRight: 8, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#FFFFFF26' },
  headerText: { flex: 1, gap: 3 },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', lineHeight: 25 },
  subtitle: { color: '#FFFFFFB8', fontSize: 12, lineHeight: 18 },
  iconButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  scroll: { flex: 1 },
  content: { flexGrow: 1, padding: 16, gap: 12 },
  card: { backgroundColor: `${APP_COLORS.SECONDARY}66`, borderRadius: 14, padding: 14, borderLeftWidth: 3, borderLeftColor: 'transparent', gap: 8 },
  unreadCard: { borderLeftColor: APP_COLORS.ACCENT },
  type: { color: '#FFFFFFB8', fontSize: 11, lineHeight: 17 },
  heading: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', lineHeight: 21 },
  message: { color: '#FFFFFFD9', fontSize: 13, lineHeight: 20 },
  date: { color: '#FFFFFF99', fontSize: 11, lineHeight: 17 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  openButton: { flexShrink: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  openText: { color: APP_COLORS.ACCENT, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  moreButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 32 },
  emptyTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  error: { color: '#FFB4AB', fontSize: 13, lineHeight: 20 },
  disabled: { opacity: 0.5 },
  detailOverlay: { flex: 1, backgroundColor: '#00000080', justifyContent: 'center', padding: 20 },
  detailModal: { flexGrow: 0, maxHeight: '90%', backgroundColor: '#FFFFFF', borderRadius: 16 },
});
