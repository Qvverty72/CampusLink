import { APP_COLORS } from '@/types/colors';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ActivityDetail } from '../types/activity';

/** Acciones confirmadas por servidor en la ficha completa, incluida participación histórica propia. */
export function ActivityParticipationControls({ status, canJoin, pending, error, onJoin, activityTitle, disabled = false }: {
  status: ActivityDetail['participation']['status']; canJoin: boolean; pending: 'JOINED' | 'LEFT' | null;
  error: string | null; onJoin: () => Promise<void>; activityTitle?: string;
  disabled?: boolean;
}) {
  const busy = pending !== null || disabled;
  const joinDisabled = busy || !canJoin;
  if (status === 'JOINED' && !error) return null;
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
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  controls: { gap: 10 }, status: { fontSize: 13, lineHeight: 19, color: '#475569' },
  button: { minHeight: 44, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  join: { backgroundColor: APP_COLORS.PRIMARY },
  joinText: { color: '#FFFFFF', fontWeight: '600', textAlign: 'center' },
  disabled: { opacity: 0.4 }, error: { color: '#9A3412', lineHeight: 20, fontSize: 13 },
});
