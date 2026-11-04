import { StyleSheet, View } from 'react-native';
import { Skeleton, SkeletonBlock } from '@/components/Skeleton';

/** Filas neutras con la misma geometría del icono y los textos de cada aviso. */
export function NotificationSkeleton({ rows = 4, heading = true, label = 'Cargando notificaciones' }: {
  rows?: number; heading?: boolean; label?: string;
}) {
  return <Skeleton label={label} contentStyle={styles.group}>
    {heading && <SkeletonBlock width={88} height={10} style={styles.block} />}
    <View>{Array.from({ length: rows }, (_, index) => <View key={index} style={styles.row}>
      <SkeletonBlock width={38} height={38} borderRadius={19} style={styles.block} />
      <View style={styles.copy}>
        <SkeletonBlock width={index % 2 ? '80%' : '66%'} height={14} style={styles.block} />
        <SkeletonBlock width="90%" height={10} style={styles.block} />
      </View>
      <View style={styles.options}><SkeletonBlock width={16} height={5} style={styles.block} /></View>
    </View>)}</View>
  </Skeleton>;
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  copy: { flex: 1, minWidth: 0, gap: 8 },
  options: { width: 34, alignItems: 'center' },
  block: { backgroundColor: '#FFFFFF26' },
});
