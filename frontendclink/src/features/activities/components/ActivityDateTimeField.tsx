import { useEffect, useRef, useState } from 'react';
import { Keyboard, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { formatPickerValue, pickerDate, type ActivityDateTimeFieldProps } from '../types/dateTime';

/** Both platforms block the form while choosing: system dialog on Android, modal on iOS. */
export function ActivityDateTimeField({ label, mode, value, disabled, onChange }: ActivityDateTimeFieldProps) {
  const [selection, setSelection] = useState<Date | null>(null);
  const androidOpen = useRef(false);
  const mounted = useRef(true);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const dismissAndroid = () => {
    if (androidOpen.current) {
      androidOpen.current = false;
      void DateTimePickerAndroid.dismiss(mode).catch(() => {});
    }
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; dismissAndroid(); };
  }, [mode]);
  useEffect(() => {
    if (disabled) { setSelection(null); dismissAndroid(); }
  }, [disabled, mode]);
  const open = () => {
    if (disabled) return;
    Keyboard.dismiss();
    const date = pickerDate(value, mode);
    if (Platform.OS === 'android') {
      androidOpen.current = true;
      DateTimePickerAndroid.open({ value: date, mode, is24Hour: true,
        positiveButton: { label: 'Aceptar' }, negativeButton: { label: 'Cancelar' },
        onValueChange: (_event, selected) => {
          androidOpen.current = false;
          if (mounted.current && !disabledRef.current) onChange(formatPickerValue(selected, mode));
        }, onDismiss: () => { androidOpen.current = false; } });
    } else setSelection(date);
  };
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label}
      accessibilityValue={{ text: value || 'Sin seleccionar' }} accessibilityState={{ disabled, expanded: selection !== null }}
      disabled={disabled} activeOpacity={0.75} onPress={open} style={[styles.input, disabled && styles.disabled]}>
      <Text style={value ? styles.value : styles.placeholder}>{value || (mode === 'date' ? 'Seleccionar fecha' : 'Seleccionar hora')}</Text>
      <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.placeholder}>▾</Text>
    </TouchableOpacity>
    {selection && !disabled ? <Modal visible transparent animationType="fade" presentationStyle="overFullScreen"
      onRequestClose={() => setSelection(null)}>
      <View style={styles.overlay}>
        <View style={styles.picker} accessibilityViewIsModal onAccessibilityEscape={() => setSelection(null)}>
          <Text accessibilityRole="header" style={styles.heading}>{label}</Text>
          <DateTimePicker accessibilityLabel={label} value={selection} mode={mode} display="spinner" locale="es-CL"
            themeVariant="light" textColor="#0F172A" style={styles.wheel}
            onValueChange={(_event, selected) => setSelection(selected)} />
          <View style={styles.actions}>
            <TouchableOpacity accessibilityRole="button" onPress={() => setSelection(null)} style={styles.action}>
              <Text style={styles.placeholder}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={() => { onChange(formatPickerValue(selection, mode)); setSelection(null); }} style={styles.action}>
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
  input: { minHeight: 48, borderWidth: 1, borderColor: '#94A3B8', borderRadius: 8, padding: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  value: { color: '#0F172A' }, placeholder: { color: '#64748B' }, disabled: { opacity: 0.5 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  picker: { width: '100%', maxWidth: 420, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700', color: '#0F172A' }, wheel: { width: '100%' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }, action: { minHeight: 44, padding: 12 },
  confirm: { color: '#0B6E75', fontWeight: '600' },
});
