import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ACTIVITY_CONTENT_LIMITS, ACTIVITY_DESCRIPTION_OPTIONS, type ActivityDraft, type ActivityLocationOption } from '../types/creation';
import type { ActivityLocationQuery } from '../types/activity';
import { ActivityDateTimeField } from './ActivityDateTimeField';

/** Shared domain fields for creation/editing; location catalog never contains meshes. */
export function ActivityFields({ draft, change, disabled, locations, organizer, firstOccurrence = false, creationLocation }: {
  draft: ActivityDraft; change: (field: keyof ActivityDraft, value: string) => void; disabled: boolean;
  locations: ActivityLocationOption[]; organizer?: string; firstOccurrence?: boolean;
  creationLocation?: ActivityLocationQuery;
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
    {creationLocation ? <View style={styles.field}>
      <Text style={styles.label}>Descripción</Text>
      <View style={styles.choices}>
        {ACTIVITY_DESCRIPTION_OPTIONS.map(description => <Pressable key={description} accessibilityRole="radio"
          accessibilityLabel={description} accessibilityState={{ selected: draft.description === description, disabled }} disabled={disabled}
          onPress={() => change('description', description)} style={[styles.choice, draft.description === description && styles.selected]}>
          <Text style={draft.description === description ? styles.selectedText : styles.text}>{description}</Text>
        </Pressable>)}
      </View>
    </View> : field('description', 'Descripción', 'Describe la actividad presencial', ACTIVITY_CONTENT_LIMITS.description, true)}
    <Text style={styles.text}>{firstOccurrence ? 'Fecha y hora de la primera actividad. ' : ''}Fechas y horas locales de tu dispositivo, en formato de 24 horas.</Text>
    {creationLocation ? <>
      <ActivityDateTimeField label="Fecha de inicio" mode="date" value={draft.startDate} disabled={disabled} onChange={value => change('startDate', value)} />
      <ActivityDateTimeField label="Hora de inicio" mode="time" value={draft.startTime} disabled={disabled} onChange={value => change('startTime', value)} />
      <ActivityDateTimeField label="Fecha de término" mode="date" value={draft.endDate} disabled={disabled} onChange={value => change('endDate', value)} />
      <ActivityDateTimeField label="Hora de término" mode="time" value={draft.endTime} disabled={disabled} onChange={value => change('endTime', value)} />
    </> : <>
      {field('startDate', 'Fecha de inicio', 'DD/MM/AAAA', 10)}{field('startTime', 'Hora de inicio', 'HH:mm', 5)}
      {field('endDate', 'Fecha de término', 'DD/MM/AAAA', 10)}{field('endTime', 'Hora de término', 'HH:mm', 5)}
    </>}
    {creationLocation?.buildingKey || creationLocation?.floorKey ? <Text style={styles.text}>Ubicación seleccionada en el mapa</Text> : null}
    <Text style={styles.label}>Edificio</Text>
    {creationLocation?.buildingKey ? <Text style={styles.location}>{building?.name ?? 'El edificio seleccionado ya no está disponible.'}</Text> : choices('buildingKey', locations)}
    <Text style={styles.label}>Piso</Text>
    {creationLocation?.floorKey ? <Text style={styles.location}>{floor?.name ?? 'El piso seleccionado ya no está disponible.'}</Text>
      : building ? choices('floorKey', building.floors) : <Text style={styles.text}>Selecciona un edificio.</Text>}
    <Text style={styles.label}>Punto de interés (opcional)</Text>
    {floor ? choices('poiKey', [{ id: '', name: 'En el piso, sin punto de interés' }, ...floor.pois]) : <Text style={styles.text}>Selecciona un piso.</Text>}
    {!creationLocation ? field('customLabel', 'Referencia del lugar (opcional)', 'Ejemplo: junto a la sala de estudio', ACTIVITY_CONTENT_LIMITS.customLabel) : null}
  </View>;
}
const styles = StyleSheet.create({ field: { gap: 10 }, label: { fontWeight: '600', color: '#0F172A' }, text: { color: '#475569', lineHeight: 21 },
  input: { borderWidth: 1, borderColor: '#94A3B8', borderRadius: 8, padding: 12, color: '#0F172A' },
  description: { minHeight: 100, textAlignVertical: 'top' }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  location: { backgroundColor: '#F1F5F9', borderRadius: 8, padding: 12, color: '#0F172A', lineHeight: 21 },
  choice: { borderWidth: 1, borderColor: '#94A3B8', borderRadius: 8, padding: 10 }, selected: { backgroundColor: '#0B6E75', borderColor: '#0B6E75' },
  selectedText: { color: '#FFFFFF', fontWeight: '600' }, });
