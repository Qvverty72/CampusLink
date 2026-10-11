import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { browserDateSelection, browserDateValue, formatPickerValue, pickerDate, type ActivityDateTimeFieldProps } from '../types/dateTime';

/** Browser-native selector inside a blocking modal, with changes staged until acceptance. */
export function ActivityDateTimeField({ label, mode, value, disabled, onChange }: ActivityDateTimeFieldProps) {
  const [selection, setSelection] = useState<string | null>(null);
  useEffect(() => { if (disabled) setSelection(null); }, [disabled]);
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityValue={{ text: value || 'Sin seleccionar' }}
      accessibilityState={{ disabled, expanded: selection !== null }} disabled={disabled} activeOpacity={0.75}
      onPress={() => setSelection(value || formatPickerValue(pickerDate('', mode), mode))} style={[styles.trigger, disabled && styles.disabled]}>
      <Text style={value ? styles.value : styles.placeholder}>{value || (mode === 'date' ? 'Seleccionar fecha' : 'Seleccionar hora')}</Text>
      <Text aria-hidden style={styles.placeholder}>▾</Text>
    </TouchableOpacity>
    {selection !== null && !disabled ? <Modal visible transparent animationType="fade" onRequestClose={() => setSelection(null)}>
      <View style={styles.overlay}>
        <View style={styles.picker} accessibilityViewIsModal>
          <Text accessibilityRole="header" style={styles.heading}>{label}</Text>
          <input type={mode} aria-label={label} autoFocus step={mode === 'time' ? 60 : undefined}
            value={mode === 'date' ? browserDateValue(selection) : selection}
            onChange={event => setSelection(mode === 'date' ? browserDateSelection(event.target.value) : event.target.value)}
            style={{ boxSizing: 'border-box', width: '100%', minHeight: 48, padding: 12, border: '1px solid #94A3B8',
              borderRadius: 8, background: '#FFFFFF', color: '#0F172A', font: 'inherit' }} />
          <View style={styles.actions}>
            <TouchableOpacity accessibilityRole="button" onPress={() => setSelection(null)} style={styles.action}>
              <Text style={styles.placeholder}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" disabled={!selection} accessibilityState={{ disabled: !selection }}
              onPress={() => { if (selection) { onChange(selection); setSelection(null); } }} style={[styles.action, !selection && styles.disabled]}>
              <Text style={styles.confirm}>Aceptar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal> : null}
  </View>;
}

const styles = StyleSheet.create({
  field: { gap: 8 }, label: { fontWeight: '600', color: '#0F172A' },
  trigger: { minHeight: 48, borderWidth: 1, borderColor: '#94A3B8', borderRadius: 8, padding: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  value: { color: '#0F172A' }, placeholder: { color: '#64748B' }, disabled: { opacity: 0.5 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  picker: { width: '100%', maxWidth: 420, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, gap: 16 },
  heading: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }, action: { minHeight: 44, padding: 12 },
  confirm: { color: '#0B6E75', fontWeight: '600' },
});
