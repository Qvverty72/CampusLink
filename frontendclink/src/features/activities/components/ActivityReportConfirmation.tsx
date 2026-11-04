import { APP_COLORS } from '@/types/colors';
import { BadgeCheck, CalendarDays, Check, Flag, MessageSquare, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { ACTIVITY_REPORT_REASONS, type ActivityReportReceipt } from '../types/activityReport';
import { ActivityBackButton } from './ActivityBackButton';

const REPORT_STATUS = {
  PENDIENTE: { label: 'Pendiente de revisión', color: '#92400E', backgroundColor: '#FFFAEB' },
  EN_REVISION: { label: 'En revisión', color: '#1D4ED8', backgroundColor: '#EFF6FF' },
  RESUELTO: { label: 'Resuelta', color: '#166534', backgroundColor: '#ECFDF3' },
  DESESTIMADO: { label: 'Desestimada', color: '#475569', backgroundColor: '#F1F5F9' },
} as const;

function DecorativeIcon({ icon: Icon, color = '#64748B', size = 16 }: {
  icon: LucideIcon; color?: string; size?: number;
}) {
  return <View accessible={false} aria-hidden accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants" pointerEvents="none">
    <Icon size={size} color={color} strokeWidth={1.8}/>
  </View>;
}

/** Confirmación propia de actividad compartida por el primer envío y su consulta posterior. */
export function ActivityReportConfirmation({ title, receipt, onBack }: {
  title: string; receipt: ActivityReportReceipt; onBack: () => void;
}) {
  const reportedAt = new Date(receipt.reportedAt);
  const date = reportedAt.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = reportedAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
  const timestamp = `${date} · ${time}`;
  const reason = ACTIVITY_REPORT_REASONS.find(option => option.code === receipt.reason)?.label ?? receipt.reason;
  const status = REPORT_STATUS[receipt.status];
  const comment = receipt.description?.trim();

  return <View style={styles.content}>
    <ActivityBackButton label="Volver a la ficha" onBack={onBack}/>
    <View style={styles.header}>
      <View style={styles.successIcon}>
        <DecorativeIcon icon={Check} size={20} color="#15803D"/>
      </View>
      <View style={styles.headerText}>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.title}>Denuncia enviada</Text>
        <Text style={styles.subtitle}>Actividad: {title}</Text>
      </View>
    </View>

    <View style={styles.metadata}>
      <View style={styles.metadataRow}>
        <View style={styles.metadataLabel}>
          <DecorativeIcon icon={CalendarDays}/><Text style={styles.label}>Fecha y hora de la denuncia:</Text>
        </View>
        <Text style={styles.date}>{timestamp}</Text>
      </View>
      <View style={[styles.metadataRow, styles.divider]}>
        <View style={styles.metadataLabel}>
          <DecorativeIcon icon={Flag}/><Text style={styles.label}>Motivo</Text>
        </View>
        <View style={[styles.badge, styles.reasonBadge]}>
          <Text style={styles.reasonText}>{reason}</Text>
        </View>
      </View>
      <View style={[styles.metadataRow, styles.divider]}>
        <View style={styles.metadataLabel}>
          <DecorativeIcon icon={BadgeCheck}/><Text style={styles.label}>Estado</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: status.backgroundColor }]}>
          <Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>
    </View>

    <View style={styles.comments}>
      <View style={styles.commentsHeader}>
        <View style={styles.commentsHeading}>
          <DecorativeIcon icon={MessageSquare} color={APP_COLORS.PRIMARY}/>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Comentarios</Text>
        </View>
        <Text style={styles.commentCount}>{comment ? '1 comentario' : '0 comentarios'}</Text>
      </View>
      {comment ? <View style={styles.commentRow}>
        <View style={styles.avatar} accessible={false} aria-hidden accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"><Text style={styles.avatarText}>TÚ</Text></View>
        <View style={styles.commentBubble}>
          <Text style={styles.commentAuthor}>Tú <Text style={styles.commentDate}>· {timestamp}</Text></Text>
          <Text style={styles.commentText}>{comment}</Text>
        </View>
      </View> : <Text style={styles.emptyComments}>No agregaste una descripción a esta denuncia.</Text>}
    </View>

    <Text style={styles.notice}>Enviar la denuncia no oculta la actividad ni cambia las inscripciones.</Text>
  </View>;
}

const styles = StyleSheet.create({
  content: { gap: 20, paddingVertical: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  successIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#ECFDF3', alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 18, fontWeight: '700', lineHeight: 24, color: '#0F172A' },
  subtitle: { fontSize: 13, lineHeight: 19, color: '#475569' },
  metadata: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, overflow: 'hidden' },
  metadataRow: { minHeight: 48, paddingVertical: 11, paddingHorizontal: 12, flexDirection: 'row', flexWrap: 'wrap',
    alignItems: 'center', justifyContent: 'space-between', columnGap: 12, rowGap: 8 },
  metadataLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 108, flexShrink: 1 },
  divider: { borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  label: { fontSize: 13, lineHeight: 19, color: '#475569', flexShrink: 1 },
  date: { fontSize: 12, lineHeight: 18, color: '#0F172A', fontWeight: '600', flexShrink: 1, marginLeft: 'auto' },
  badge: { maxWidth: '100%', flexShrink: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, lineHeight: 18, fontWeight: '600', textAlign: 'center' },
  reasonBadge: { backgroundColor: '#FEF2F2' },
  reasonText: { fontSize: 12, lineHeight: 18, fontWeight: '600', color: '#B42318', textAlign: 'center' },
  comments: { gap: 12 },
  commentsHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  commentsHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: '#0F172A' },
  commentCount: { fontSize: 12, lineHeight: 18, color: '#64748B' },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F0F8' },
  avatarText: { color: APP_COLORS.PRIMARY, fontSize: 10, fontWeight: '700' },
  commentBubble: { flex: 1, minWidth: 0, padding: 12, borderRadius: 12, backgroundColor: '#F8FAFC', gap: 5 },
  commentAuthor: { fontSize: 12, lineHeight: 18, fontWeight: '700', color: APP_COLORS.PRIMARY },
  commentDate: { fontWeight: '400', color: '#64748B' },
  commentText: { fontSize: 13, lineHeight: 20, color: '#334155' },
  emptyComments: { color: '#64748B', fontSize: 13, lineHeight: 20 },
  notice: { fontSize: 12, lineHeight: 19, color: '#64748B' },
});
