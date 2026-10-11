import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ACTIVITY_COLORS, ACTIVITY_LABELS, type Activity } from '../types/activity';
import { useActivityDetail } from '../hooks/useActivityDetail';
import { ActivityParticipantCount } from './ActivityParticipantCount';
import { ActivityParticipationControls } from './ActivityParticipationControls';

export function ActivityCard({ activity, onPress }: {
  activity: Activity; onPress: () => void;
}) {
  const { detail, ownParticipation, isLoading, error, refresh, join, leave, pendingParticipation,
    participationError, isUpdatingParticipation } = useActivityDetail(activity.id);
  // Once a detail is unavailable, do not keep displaying the old list's public content.
  if (error) return <View style={styles.unavailable}>
    <Text accessibilityRole="alert" style={styles.text}>{error}</Text>
    {ownParticipation ? <ActivityParticipationControls status={ownParticipation.status} canJoin={false}
      pending={pendingParticipation} error={participationError} onJoin={join} onLeave={leave} /> : null}
    <TouchableOpacity accessibilityRole="button" disabled={isUpdatingParticipation} onPress={refresh} style={styles.linkButton}>
      <Text style={styles.link}>Reintentar consulta</Text>
    </TouchableOpacity>
  </View>;
  const value = detail ?? activity;
  return <View style={styles.row}>
    <View style={styles.identityColumn}>
      <TouchableOpacity accessibilityRole="button" activeOpacity={0.75}
        accessibilityLabel={`Abrir ficha completa: ${value.title}`} onPress={onPress}
        style={[styles.summary, { borderColor: ACTIVITY_COLORS[value.type] }]}>
        <Text accessibilityRole="header" style={styles.title}>{value.title}</Text>
        <Text style={[styles.type, { color: ACTIVITY_COLORS[value.type] }]}>{ACTIVITY_LABELS[value.type]}</Text>
        <Text style={styles.date}>Inicio: {new Date(value.startAt).toLocaleString('es-CL')}</Text>
        <Text style={styles.date}>Término: {new Date(value.endAt).toLocaleString('es-CL')}</Text>
        {value.series ? <Text style={styles.date}>Ocurrencia {value.series.index} de {value.series.total}</Text> : null}
        <Text style={styles.link}>Ver ficha completa</Text>
      </TouchableOpacity>
      <ActivityParticipantCount count={detail?.participantCount} loading={isLoading || pendingParticipation !== null} />
    </View>
    <View style={styles.actionsColumn}>
      {isLoading ? <View style={styles.loading}><ActivityIndicator /><Text style={styles.metadata}>Consultando tu participación…</Text></View>
        : detail ? <ActivityParticipationControls activityTitle={detail.title}
          status={detail.participation.status} canJoin={detail.participation.canJoin}
          pending={pendingParticipation} error={participationError} onJoin={join} onLeave={leave} /> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', alignItems: 'flex-start' },
  identityColumn: { flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 0 },
  actionsColumn: { flexGrow: 1, flexShrink: 1, flexBasis: 170, minWidth: 0 },
  summary: { borderWidth: 1, borderRadius: 18, backgroundColor: '#F8FAFC', padding: 16, gap: 8, alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A', textAlign: 'center' },
  type: { fontSize: 14, fontWeight: '600', textAlign: 'center' }, date: { color: '#475569', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  text: { color: '#334155', lineHeight: 22 },
  metadata: { color: '#64748B', fontSize: 13, lineHeight: 20 }, link: { color: '#0B6E75', fontSize: 13, fontWeight: '600' },
  loading: { gap: 10 }, unavailable: { padding: 16, gap: 12, borderRadius: 16, backgroundColor: '#F8FAFC' },
  linkButton: { paddingVertical: 12 },
});
