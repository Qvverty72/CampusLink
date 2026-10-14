import { StyleSheet, View } from 'react-native';
import { Skeleton, SkeletonBlock } from '@/components/Skeleton';
import { ACTIVITY_PARTICIPANTS_PAGE_SIZE } from '../types/activity';

/** Estructura de carga de ficha completa, compuesta con los marcadores compartidos. */
export function ActivityDetailSkeleton() {
  return <Skeleton label="Cargando ficha" contentStyle={styles.content}>
    <View style={styles.header}>
      <SkeletonBlock width="65%" height={26} />
      <SkeletonBlock width="85%" height={14} />
      <SkeletonBlock height={14} />
      <SkeletonBlock width="90%" height={14} />
      <SkeletonBlock width="45%" height={16} />
      <SkeletonBlock width="55%" height={14} />
    </View>
    <View style={styles.dates}>
      {[0, 1].map(index => <View key={index} style={styles.date}>
        <SkeletonBlock width="55%" height={18} />
        <SkeletonBlock width="85%" height={14} />
        <SkeletonBlock width="65%" height={14} />
      </View>)}
    </View>
    <View>
      <SkeletonBlock width="60%" height={20} style={styles.heading} />
      {Array.from({ length: ACTIVITY_PARTICIPANTS_PAGE_SIZE }, (_, index) => <View key={index} style={styles.person}>
        <SkeletonBlock width={index % 2 === 0 ? '65%' : '45%'} height={16} />
      </View>)}
    </View>
    <SkeletonBlock height={44} borderRadius={12} />
  </Skeleton>;
}

const styles = StyleSheet.create({
  content: { gap: 18 },
  header: { alignItems: 'center', gap: 12 },
  dates: { flexDirection: 'row', gap: 12 },
  date: { flex: 1, minWidth: 0, padding: 12, gap: 10, backgroundColor: '#F8FAFC', borderRadius: 12 },
  heading: { marginVertical: 12 },
  person: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#E2E8F0' },
});
