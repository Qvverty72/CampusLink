import { APP_COLORS } from '@/types/colors';
import { Pagination } from '@/components/Pagination';
import { Skeleton, SkeletonBlock } from '@/components/Skeleton';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useActivityParticipants } from '../hooks/useActivityParticipants';
import { ACTIVITY_PARTICIPANTS_PAGE_SIZE } from '../types/activity';
import { ActivityWithdrawalButton } from './ActivityWithdrawalButton';

export function ActivityParticipants({ activityId, refreshKey, canLeave = false, onLeave, leavePending = false, disabled = false }: {
  activityId: string; refreshKey: string; canLeave?: boolean; onLeave?: () => Promise<void>; leavePending?: boolean; disabled?: boolean;
}) {
  const { data, isLoading, error, refresh, goToPage } = useActivityParticipants(activityId, refreshKey);
  return <View style={styles.section}>
    <Text accessibilityRole="header" style={styles.heading}>Personas inscritas{data ? ` (${data.total})` : ''}</Text>
    <View style={styles.rows}>
      {isLoading ? <Skeleton label="Cargando inscritos">
        {Array.from({ length: ACTIVITY_PARTICIPANTS_PAGE_SIZE }, (_, index) => <View key={index} style={styles.row}>
          <SkeletonBlock width={index % 2 === 0 ? '65%' : '45%'} height={16} />
        </View>)}
      </Skeleton>
        : error ? <><Text accessibilityRole="alert" style={styles.error}>{error}</Text>
          <TouchableOpacity accessibilityRole="button" onPress={refresh} style={styles.button}><Text style={styles.link}>Reintentar</Text></TouchableOpacity>
          {canLeave && onLeave ? <View style={styles.row}>
            <Text style={styles.name}>Tu inscripción</Text>
            <ActivityWithdrawalButton onLeave={onLeave} disabled={disabled} pending={leavePending} />
          </View> : null}</>
        : data?.total === 0 ? <Text style={styles.muted}>Todavía no hay personas inscritas.</Text>
        : data?.participants.map(person => <View key={person.key} style={styles.row}>
          <Text style={styles.name}>{person.name ?? 'Nombre no disponible'}{person.isCurrentUser ? ' (tú)' : ''}</Text>
          {person.isCurrentUser && canLeave && onLeave ? <ActivityWithdrawalButton
            onLeave={onLeave} disabled={disabled} pending={leavePending} /> : null}
        </View>)}
    </View>
    {data && data.total > ACTIVITY_PARTICIPANTS_PAGE_SIZE ? <Pagination
      page={data.page} totalPages={Math.ceil(data.total / data.pageSize)}
      onPageChange={goToPage} label="Paginación de personas inscritas" /> : null}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 12, marginVertical: 12 }, heading: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  rows: { minHeight: ACTIVITY_PARTICIPANTS_PAGE_SIZE * 48 }, row: { minHeight: 48, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 12, paddingVertical: 2, borderBottomWidth: 1, borderColor: '#E2E8F0' },
  name: { flex: 1, fontSize: 15, color: '#334155', lineHeight: 22 }, muted: { color: '#64748B', lineHeight: 22 },
  error: { color: '#9A3412', lineHeight: 22 },
  button: { minHeight: 44, paddingVertical: 12, paddingHorizontal: 4 },
  link: { color: APP_COLORS.PRIMARY, fontWeight: '600' },
});
