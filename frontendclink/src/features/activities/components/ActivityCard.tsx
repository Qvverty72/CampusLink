import { APP_COLORS } from '@/types/colors';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Repeat2 } from 'lucide-react-native';
import { ACTIVITY_COLORS, type Activity } from '../types/activity';
import { useActivityDetail } from '../hooks/useActivityDetail';
import { ActivityParticipantCount } from './ActivityParticipantCount';
import { ActivityDescription } from './ActivityDescription';
import { useAuth } from '@/features/auth/AuthProvider';

export function ActivityCard({ activity, onPress }: {
  activity: Activity; onPress: () => void;
}) {
  const { identity } = useAuth();
  const canViewOccurrences = identity?.capabilities.officialActivities === true;
  const { detail, ownParticipation, isLoading, error, refresh } = useActivityDetail(activity.id);
  const isJoined = detail?.participation.status === 'JOINED';
  const detailLinkLabel = (detail?.participation.status ?? ownParticipation?.status) === 'JOINED'
    ? 'Ver detalles e inscritos' : 'Ver detalles y ubicación';
  // Once a detail is unavailable, do not keep displaying the old list's public content.
  if (error) return <View style={styles.unavailable}>
    <Text accessibilityRole="alert" style={styles.text}>{error}</Text>
    {ownParticipation?.status === 'JOINED' ? <>
      <Text style={styles.text}>Estás inscrito.</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={detailLinkLabel} onPress={onPress} style={styles.linkButton}>
        <Text style={styles.link}>{detailLinkLabel}</Text>
      </TouchableOpacity>
    </> : null}
    <TouchableOpacity accessibilityRole="button" onPress={refresh} style={styles.linkButton}>
      <Text style={styles.link}>Reintentar consulta</Text>
    </TouchableOpacity>
  </View>;
  const value = detail ?? activity;
  return <View style={styles.row}>
    <View style={styles.identityColumn}>
      <View style={[styles.summary, { borderColor: ACTIVITY_COLORS[value.type] }]}>
        <TouchableOpacity accessibilityRole="button" activeOpacity={0.75}
          accessibilityLabel={`${detailLinkLabel}: ${value.title}`} onPress={onPress} style={styles.summaryContent}>
          <Text accessibilityRole="header" style={styles.title}>{value.title}</Text>
        </TouchableOpacity>
        <ActivityDescription key={`${value.id}:${value.description}`} description={value.description}
          previewLength={160} previewLines={3} onReadMore={onPress} />
        <TouchableOpacity accessibilityRole="button" activeOpacity={0.75}
          accessibilityLabel={`${detailLinkLabel}: ${value.title}`} onPress={onPress} style={styles.summaryContent}>
          <Text style={styles.date}>Inicio: {new Date(value.startAt).toLocaleString('es-CL')}</Text>
          <Text style={styles.date}>Término: {new Date(value.endAt).toLocaleString('es-CL')}</Text>
          {canViewOccurrences && value.series ? <View style={[styles.seriesBadge, { borderColor: ACTIVITY_COLORS[value.type] }]}>
            <View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Repeat2 size={15} color={ACTIVITY_COLORS[value.type]} strokeWidth={1.8} />
            </View>
            <Text style={[styles.seriesText, { color: ACTIVITY_COLORS[value.type] }]}>Ocurrencia {value.series.index} de {value.series.total}</Text>
          </View> : null}
          <Text style={styles.link}>{detailLinkLabel}</Text>
        </TouchableOpacity>
      </View>
      <ActivityParticipantCount count={detail?.participantCount} loading={isLoading}
        isJoined={isJoined} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', alignItems: 'flex-start' },
  identityColumn: { flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 0 },
  summary: { borderWidth: 1, borderRadius: 18, backgroundColor: '#F8FAFC', padding: 16, gap: 8, alignItems: 'center' },
  summaryContent: { width: '100%', gap: 8, alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A', textAlign: 'center' },
  date: { color: '#475569', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  seriesBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 6,
    borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, maxWidth: '100%' },
  seriesText: { fontSize: 12, lineHeight: 18, fontWeight: '600', flexShrink: 1, textAlign: 'center' },
  text: { color: '#334155', lineHeight: 22 },
  link: { color: APP_COLORS.PRIMARY, fontSize: 13, fontWeight: '600' },
  unavailable: { padding: 16, gap: 12, borderRadius: 16, backgroundColor: '#F8FAFC' },
  linkButton: { paddingVertical: 12 },
});
