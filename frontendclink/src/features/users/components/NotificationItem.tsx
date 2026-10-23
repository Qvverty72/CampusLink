import { useState } from 'react';
import { CalendarClock, CalendarDays, CalendarSync, Ellipsis, Store, Trash2, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { APP_COLORS } from '@/types/colors';
import type { UserNotification } from '../types/notification';
import { formatNotificationDate, NOTIFICATION_LABELS } from '../utils/notificationPresentation';

const ICONS: Record<UserNotification['type'], LucideIcon> = {
  OFFICIAL_EVENT_PUBLISHED: CalendarDays,
  OFFICIAL_EVENT_STARTED: CalendarClock,
  ACTIVITY_CHANGED: CalendarSync,
  PHYSICAL_PUBLICATION_CLOSE_REMINDER: Store,
};

export function NotificationItem({ item, busy, onOpen, onDelete }: {
  item: UserNotification; busy: boolean; onOpen: () => void; onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = ICONS[item.type];
  const label = NOTIFICATION_LABELS[item.type];
  const unread = !item.readAt;
  const fullDate = new Date(item.createdAt).toLocaleString('es-CL');
  return <View>
    <View style={styles.row}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${item.title}. ${label}. ${item.message}. ${fullDate}. ${unread ? 'Sin leer' : 'Leída'}`}
        accessibilityHint="Abre el detalle relacionado con este aviso" accessibilityState={{ disabled: busy }} disabled={busy}
        activeOpacity={0.65} onPress={onOpen} style={[styles.open, busy && styles.disabled]}>
        <View style={styles.iconCircle} accessible={false} aria-hidden>
          <Icon size={19} color={APP_COLORS.ACCENT} strokeWidth={1.7} />
        </View>
        <View style={styles.copy}>
          <Text numberOfLines={2} style={[styles.title, unread && styles.unreadTitle]}>{item.title}</Text>
          <Text style={styles.meta}>{label} · {formatNotificationDate(item.createdAt)}</Text>
        </View>
        {unread && <View style={styles.unreadDot} accessible={false} aria-hidden />}
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Opciones de notificación de ${item.title}`}
        accessibilityState={{ expanded, disabled: busy }} disabled={busy} activeOpacity={0.65}
        onPress={() => setExpanded(value => !value)} style={[styles.options, busy && styles.disabled]}>
        <Ellipsis size={18} color="#FFFFFF99" strokeWidth={1.7} />
      </TouchableOpacity>
    </View>
    {expanded && <View style={styles.details}>
      <Text style={styles.message}>{item.message}</Text>
      <Text style={styles.meta}>{fullDate}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Eliminar notificación de ${item.title}`}
        accessibilityState={{ disabled: busy }} disabled={busy} activeOpacity={0.65} onPress={onDelete} style={[styles.delete, busy && styles.disabled]}>
        <Trash2 size={16} color="#FFB4AB" strokeWidth={1.7} />
        <Text style={styles.deleteText}>Eliminar notificación</Text>
      </TouchableOpacity>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  open: { flex: 1, minWidth: 0, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  iconCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: `${APP_COLORS.SECONDARY}66`, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  title: { color: '#FFFFFF', fontSize: 14, fontWeight: '400', lineHeight: 20 },
  unreadTitle: { fontWeight: '700' },
  meta: { color: '#FFFFFFB8', fontSize: 11, lineHeight: 17 },
  unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: APP_COLORS.ACCENT, marginLeft: 2 },
  options: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  details: { marginLeft: 48, marginBottom: 10, padding: 12, borderRadius: 12, gap: 8, backgroundColor: `${APP_COLORS.SECONDARY}33` },
  message: { color: '#FFFFFFD9', fontSize: 13, lineHeight: 20 },
  delete: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteText: { color: '#FFB4AB', fontSize: 12, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
