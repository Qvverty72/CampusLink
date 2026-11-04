import { Skeleton, SkeletonBlock } from '@/components/Skeleton';
import { StyleSheet, View } from 'react-native';

/** Carga de denuncia de actividad: todavía no se conoce si corresponde formulario o acuse previo. */
export function ActivityReportSkeleton() {
  return <Skeleton label="Cargando denuncia de actividad" contentStyle={styles.content}>
    <View style={styles.header}>
      <SkeletonBlock width={38} height={38} borderRadius={19}/>
      <View style={styles.headerText}>
        <SkeletonBlock width="75%" height={24}/>
        <SkeletonBlock width="90%" height={16}/>
      </View>
    </View>
    <View style={styles.fields}>
      {[0, 1, 2].map(index => <View key={index} style={[styles.row, index > 0 && styles.divider]}>
        <View style={styles.label}>
          <SkeletonBlock width={16} height={16} borderRadius={4}/>
          <SkeletonBlock width="70%" height={16}/>
        </View>
        <SkeletonBlock width="38%" height={22} borderRadius={12}/>
      </View>)}
    </View>
    <View style={styles.section}>
      <SkeletonBlock width="40%" height={19}/>
      <SkeletonBlock height={88} borderRadius={12}/>
    </View>
    <View style={styles.section}>
      <SkeletonBlock width="95%" height={13}/>
      <SkeletonBlock width="70%" height={13}/>
    </View>
  </Skeleton>;
}

const styles = StyleSheet.create({
  content: { gap: 20, paddingVertical: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, minWidth: 0, gap: 8 },
  fields: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, overflow: 'hidden' },
  row: { minHeight: 52, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  divider: { borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  section: { gap: 10 },
});
