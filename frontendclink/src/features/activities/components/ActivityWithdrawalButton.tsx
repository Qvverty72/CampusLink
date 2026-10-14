import { CalendarOff } from 'lucide-react-native';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { APP_COLORS } from '@/types/colors';

/** El caller entrega la capacidad de retiro confirmada por el servidor, no inferida del nombre. */
export function ActivityWithdrawalButton({ onLeave, disabled = false, pending = false }: {
  onLeave: () => Promise<void>; disabled?: boolean; pending?: boolean;
}) {
  const busy = disabled || pending;
  return <TouchableOpacity accessibilityRole="button" activeOpacity={0.75}
    accessibilityLabel={pending ? 'Confirmando retiro de la actividad' : 'Retirarme de esta actividad'}
    accessibilityHint="Dejarás de figurar como persona inscrita."
    accessibilityState={{ disabled: busy, busy: pending }} aria-busy={pending}
    disabled={busy} onPress={() => { void onLeave(); }} style={[styles.button, busy && styles.disabled]}>
    <View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={styles.icon}>
      <CalendarOff size={22} color={APP_COLORS.PRIMARY} strokeWidth={1.8} />
    </View>
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#EDF3F8', borderWidth: 1, borderColor: '#D9E4EE' },
  icon: { pointerEvents: 'none' }, disabled: { opacity: 0.4 },
});
