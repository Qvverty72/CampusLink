import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ACTIVITY_COLORS, ACTIVITY_LABELS, type Activity } from '../types/activity';

export function ActivityCard({ activity, expanded, onPress, onExplore }: {
  activity: Activity; expanded: boolean; onPress: () => void; onExplore?: () => void;
}) {
  return <View style={[styles.card, { borderLeftColor: ACTIVITY_COLORS[activity.type] }]}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }}
      accessibilityLabel={`${expanded ? 'Cerrar' : 'Abrir'} ficha: ${activity.title}`} onPress={onPress} style={styles.content}>
      <Text style={{ color: ACTIVITY_COLORS[activity.type], fontWeight: '700' }}>{ACTIVITY_LABELS[activity.type]}</Text>
      <Text style={styles.title}>{activity.title}</Text>
      <Text style={styles.text}>{activity.location.buildingName} · {activity.location.floorName}</Text>
      {activity.location.poiName ? <Text style={styles.text}>{activity.location.poiName}</Text> : null}
      <Text style={styles.text}>{new Date(activity.startAt).toLocaleString('es-CL')}</Text>
      <Text style={styles.link}>{expanded ? 'Cerrar ficha' : 'Ver ficha'}</Text>
    </Pressable>
    {expanded ? <View style={styles.detail}>
      <Text style={styles.text}>{activity.description}</Text>
      <Text style={styles.text}>Término: {new Date(activity.endAt).toLocaleString('es-CL')}</Text>
      <Text style={styles.text}>Estado: Activa</Text>
      {activity.location.customLabel ? <Text style={styles.text}>{activity.location.customLabel}</Text> : null}
      {onExplore ? <Pressable accessibilityRole="button" onPress={onExplore} style={styles.explore}>
        <Text style={styles.link}>Explorar este piso</Text>
      </Pressable> : null}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#CBD5E1', borderLeftWidth: 5, borderRadius: 10, backgroundColor: '#F8FAFC' },
  content: { padding: 12, gap: 6 }, title: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  text: { color: '#334155', lineHeight: 21 }, link: { color: '#0B6E75', fontWeight: '700' },
  detail: { padding: 12, paddingTop: 0, gap: 10 }, explore: { paddingVertical: 10 },
});
