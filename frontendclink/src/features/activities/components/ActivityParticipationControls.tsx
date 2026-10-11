import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ActivityDetail } from '../types/activity';

/** Shared server-confirmed actions for list rows, full details and historical own state. */
export function ActivityParticipationControls({ status, canJoin, pending, error, onJoin, onLeave, activityTitle }: {
  status: ActivityDetail['participation']['status']; canJoin: boolean; pending: 'JOINED' | 'LEFT' | null;
  error: string | null; onJoin: () => Promise<void>; onLeave: () => Promise<void>; activityTitle?: string;
}) {
  const busy = pending !== null;
  const joinDisabled = busy || !canJoin;
  const leaveDisabled = busy;
  return <View style={styles.controls}>
    {status === 'NOT_JOINED' ? <Text accessibilityLiveRegion="polite" style={styles.status}>
      No estás inscrito.
    </Text> : null}
    {status !== 'JOINED' ? <TouchableOpacity accessibilityRole="button" activeOpacity={0.75} disabled={joinDisabled}
      accessibilityLabel={`Inscribirme${activityTitle ? ` en ${activityTitle}` : ''}`}
      accessibilityState={{ disabled: joinDisabled, busy: pending === 'JOINED' }} onPress={() => { void onJoin(); }}
      style={[styles.button, styles.join, joinDisabled && styles.disabled]}>
      <Text style={styles.joinText}>{pending === 'JOINED' ? 'Inscribiendo…' : 'Inscribirme'}</Text>
    </TouchableOpacity> : null}
    {status === 'JOINED' ? <TouchableOpacity accessibilityRole="button" activeOpacity={0.75} disabled={leaveDisabled}
      accessibilityLabel={`Desinscribirme${activityTitle ? ` de ${activityTitle}` : ''}`}
      accessibilityState={{ disabled: leaveDisabled, busy: pending === 'LEFT' }} onPress={() => { void onLeave(); }}
      style={[styles.button, styles.leave, leaveDisabled && styles.disabled]}>
      <Text style={styles.leaveText}>{pending === 'LEFT' ? 'Confirmando retiro…' : 'Desinscribirme'}</Text>
    </TouchableOpacity> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  controls: { gap: 10 }, status: { fontSize: 13, lineHeight: 19, color: '#475569' },
  button: { minHeight: 44, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  join: { backgroundColor: '#0B6E75' }, leave: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#0B6E75' },
  joinText: { color: '#FFFFFF', fontWeight: '600', textAlign: 'center' },
  leaveText: { color: '#0B6E75', fontWeight: '600', textAlign: 'center' },
  disabled: { opacity: 0.4 }, error: { color: '#9A3412', lineHeight: 20, fontSize: 13 },
});
