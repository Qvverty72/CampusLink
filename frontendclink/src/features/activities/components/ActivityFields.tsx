import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ACTIVITY_CONTENT_LIMITS, type ActivityDraft, type ActivityLocationOption } from '../types/creation';

/** Shared domain fields for creation/editing; location catalog never contains meshes. */
export function ActivityFields({ draft, change, disabled, locations, organizer, firstOccurrence = false }: {
  draft: ActivityDraft; change: (field: keyof ActivityDraft, value: string) => void; disabled: boolean;
  locations: ActivityLocationOption[]; organizer?: string; firstOccurrence?: boolean;
}) {
  const field = (key: keyof ActivityDraft, label: string, placeholder: string, maxLength: number, multiline = false) =>
    <View style={styles.field} key={key}><Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholder={placeholder} value={draft[key]} onChangeText={value => change(key, value)}
        editable={!disabled} maxLength={maxLength} multiline={multiline} style={[styles.input, multiline && styles.description]} />
    </View>;
  const choices = (key: 'buildingKey' | 'floorKey' | 'poiKey', values: { id: string; name: string }[]) =>
    <View style={styles.choices}>{values.map(value => <Pressable key={value.id} accessibilityRole="radio"
      accessibilityState={{ selected: draft[key] === value.id, disabled }} disabled={disabled}
      onPress={() => change(key, value.id)} style={[styles.choice, draft[key] === value.id && styles.selected]}>
      <Text style={draft[key] === value.id ? styles.selectedText : styles.text}>{value.name}</Text>
    </Pressable>)}</View>;
  const building = locations.find(value => value.id === draft.buildingKey);
  const floor = building?.floors.find(value => value.id === draft.floorKey);
  return <View style={styles.field}>
    {organizer ? <><Text style={styles.label}>Organizador</Text><Text style={styles.text}>{organizer}</Text></> : null}
    {field('title', 'Nombre', 'Nombre de la actividad', ACTIVITY_CONTENT_LIMITS.title)}
    {field('description', 'Descripción', 'Describe la actividad presencial', ACTIVITY_CONTENT_LIMITS.description, true)}
    <Text style={styles.text}>{firstOccurrence ? 'Fecha y hora de la primera actividad. ' : ''}Fechas y horas locales de tu dispositivo, en formato de 24 horas.</Text>
    {field('startDate', 'Fecha de inicio', 'DD/MM/AAAA', 10)}{field('startTime', 'Hora de inicio', 'HH:mm', 5)}
    {field('endDate', 'Fecha de término', 'DD/MM/AAAA', 10)}{field('endTime', 'Hora de término', 'HH:mm', 5)}
    <Text style={styles.label}>Edificio</Text>{choices('buildingKey', locations)}
    <Text style={styles.label}>Piso</Text>
    {building ? choices('floorKey', building.floors) : <Text style={styles.text}>Selecciona un edificio.</Text>}
    <Text style={styles.label}>Punto de interés (opcional)</Text>
    {floor ? choices('poiKey', [{ id: '', name: 'En el piso, sin punto de interés' }, ...floor.pois]) : <Text style={styles.text}>Selecciona un piso.</Text>}
    {field('customLabel', 'Referencia del lugar (opcional)', 'Ejemplo: junto a la sala de estudio', ACTIVITY_CONTENT_LIMITS.customLabel)}
  </View>;
}
const styles = StyleSheet.create({ field: { gap: 10 }, label: { fontWeight: '600', color: '#0F172A' }, text: { color: '#475569', lineHeight: 21 },
  input: { borderWidth: 1, borderColor: '#94A3B8', borderRadius: 8, padding: 12, color: '#0F172A' },
  description: { minHeight: 100, textAlignVertical: 'top' }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderColor: '#94A3B8', borderRadius: 8, padding: 10 }, selected: { backgroundColor: '#0B6E75', borderColor: '#0B6E75' },
  selectedText: { color: '#FFFFFF', fontWeight: '600' }, });
