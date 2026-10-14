import { StyleSheet, View } from 'react-native';
import { Skeleton, SkeletonBlock } from '@/components/Skeleton';
import type { Activity } from '../types/activity';

/** Vista decorativa de la lista sin inventar datos ni cantidades de actividades. */
export function ActivityListSkeleton({ activityType }: { activityType?: Activity['type'] }) {
  return <Skeleton label="Cargando actividades" contentStyle={styles.content}>
      {activityType === 'COMMUNITY_ACTIVITY' ? <View style={styles.filter}>
        <SkeletonBlock style={styles.filterLabel} />
        <SkeletonBlock style={styles.filterField} />
      </View> : null}
      <SkeletonBlock style={styles.heading} />
      {[0, 1].map(index => <View key={index} style={styles.row}>
        <View style={styles.identityColumn}>
          <View style={styles.summary}>
            <SkeletonBlock style={styles.title} />
            <SkeletonBlock style={styles.description} />
            <SkeletonBlock style={styles.date} />
            <SkeletonBlock style={styles.date} />
            <SkeletonBlock style={styles.link} />
          </View>
          <SkeletonBlock style={styles.participants} />
        </View>
      </View>)}
  </Skeleton>;
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  filter: { gap: 8, marginTop: 12 },
  filterLabel: { width: 144, height: 14, maxWidth: '70%' },
  filterField: { height: 48, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F1F5F9' },
  heading: { width: 210, maxWidth: '75%', height: 18, marginTop: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, paddingVertical: 18,
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0', alignItems: 'flex-start' },
  identityColumn: { flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 0 },
  summary: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 18,
    backgroundColor: '#F8FAFC', padding: 16, gap: 12, alignItems: 'center' },
  title: { width: '60%', height: 20 },
  description: { width: '90%', height: 46 },
  date: { width: '80%', height: 12 },
  link: { width: '50%', height: 14, marginTop: 4 },
  participants: { width: 112, height: 24, alignSelf: 'center', marginTop: 12 },
});
