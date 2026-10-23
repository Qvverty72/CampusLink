import { APP_COLORS } from '@/types/colors';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

/** Retorno común de ficha, edición y denuncia; solo cambia el destino y su etiqueta. */
export function ActivityBackButton({ label, onBack, disabled = false }: {
  label: string; onBack: () => void; disabled?: boolean;
}) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onBack}
    style={[styles.button, disabled && styles.disabled]}>
    <Text style={styles.label}>‹ {label}</Text>
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  button: { alignSelf: 'flex-start', minHeight: 44, paddingVertical: 12 },
  label: { color: APP_COLORS.PRIMARY, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
