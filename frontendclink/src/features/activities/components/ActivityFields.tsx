import { APP_COLORS } from '@/types/colors';
import { useEffect, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ACTIVITY_CONTENT_LIMITS, ACTIVITY_DESCRIPTION_OPTIONS, type ActivityDraft, type ActivityLocationOption } from '../types/creation';
import type { ActivityLocationQuery } from '../types/activity';
import { ActivityDateTimeField } from './ActivityDateTimeField';

/** Shared domain fields for creation/editing; location catalog never contains meshes. */
export function ActivityFields({ draft, change, disabled, locations, organizer, firstOccurrence = false, creationLocation, existingContent, locationDropdowns = false, allowCustomDescription = false }: {
  draft: ActivityDraft; change: (field: keyof ActivityDraft, value: string) => void; disabled: boolean;
  locations: ActivityLocationOption[]; organizer?: string; firstOccurrence?: boolean;
  creationLocation?: ActivityLocationQuery;
  existingContent?: Pick<ActivityDraft, 'description' | 'customLabel'>;
  locationDropdowns?: boolean;
  allowCustomDescription?: boolean;
}) {
  const [openLocation, setOpenLocation] = useState<'buildingKey' | 'floorKey' | 'poiKey' | null>(null);
  useEffect(() => { setOpenLocation(null); }, [disabled, locationDropdowns, draft.buildingKey, draft.floorKey]);
  const field = (key: keyof ActivityDraft, label: string, placeholder: string, maxLength: number, multiline = false) =>
    <View style={styles.field} key={key}><Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholder={placeholder} value={draft[key]} onChangeText={value => change(key, value)}
        editable={!disabled} maxLength={maxLength} multiline={multiline} style={[styles.input, multiline && styles.description]} />
    </View>;
  const choices = (key: 'buildingKey' | 'floorKey' | 'poiKey', label: string, values: { id: string; name: string }[], placeholder: string) => {
    if (locationDropdowns) {
      const unavailable = disabled || values.length === 0;
      const expanded = openLocation === key && !unavailable;
      const selected = values.find(value => value.id === draft[key]);
      const displayValue = selected?.name ?? (draft[key] && values.length ? 'Selección no disponible' : placeholder);
      return <View style={styles.dropdown} onAccessibilityEscape={() => setOpenLocation(null)}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityValue={{ text: displayValue }}
          accessibilityState={{ disabled: unavailable, expanded }} aria-disabled={unavailable} aria-expanded={expanded}
          disabled={unavailable} activeOpacity={0.75}
          onPress={() => { if (unavailable) return; Keyboard.dismiss(); setOpenLocation(expanded ? null : key); }}
          style={[styles.dropdownTrigger, expanded && styles.dropdownActive, unavailable && styles.disabled]}>
          <Text style={[styles.dropdownValue, !selected && styles.placeholder]}>{displayValue}</Text>
          <Text aria-hidden accessibilityElementsHidden importantForAccessibility="no" style={styles.placeholder}>{expanded ? '▴' : '▾'}</Text>
        </TouchableOpacity>
        {expanded ? <ScrollView style={styles.dropdownMenu} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          <View accessibilityRole="radiogroup" accessibilityLabel={label}>
            {values.map(value => <TouchableOpacity key={value.id} accessibilityRole="radio" accessibilityLabel={value.name}
              accessibilityState={{ checked: draft[key] === value.id, disabled }} aria-checked={draft[key] === value.id}
              aria-disabled={disabled} disabled={disabled}
              onPress={() => {
                if (unavailable) return;
                setOpenLocation(null);
                if (draft[key] !== value.id) change(key, value.id);
              }} style={[styles.dropdownOption, draft[key] === value.id && styles.dropdownSelected]}>
              <Text style={[styles.dropdownValue, draft[key] === value.id && styles.dropdownSelectedText]}>{value.name}</Text>
              {draft[key] === value.id ? <Text aria-hidden accessibilityElementsHidden importantForAccessibility="no" style={styles.dropdownSelectedText}>✓</Text> : null}
            </TouchableOpacity>)}
          </View>
        </ScrollView> : null}
      </View>;
    }
    return <View style={styles.choices}>{values.map(value => <Pressable key={value.id} accessibilityRole="radio"
      accessibilityState={{ selected: draft[key] === value.id, disabled }} disabled={disabled}
      onPress={() => change(key, value.id)} style={[styles.choice, draft[key] === value.id && styles.selected]}>
      <Text style={draft[key] === value.id ? styles.selectedText : styles.text}>{value.name}</Text>
    </Pressable>)}</View>;
  };
  const building = locations.find(value => value.id === draft.buildingKey);
  const floor = building?.floors.find(value => value.id === draft.floorKey);
  const hasCustomDescription = Boolean(existingContent?.description && !ACTIVITY_DESCRIPTION_OPTIONS.includes(existingContent.description));
  const customDescriptionSelected = hasCustomDescription && draft.description === existingContent?.description;
  return <View style={styles.field}>
    {organizer ? <><Text style={styles.label}>Organizador</Text><Text style={styles.text}>{organizer}</Text></> : null}
    {field('title', 'Nombre', 'Nombre de la actividad', ACTIVITY_CONTENT_LIMITS.title)}
    {allowCustomDescription ? <View style={styles.field}>
      {field('description', 'Descripción', 'Describe la actividad presencial', ACTIVITY_CONTENT_LIMITS.description, true)}
      <Text style={styles.text}>Hasta {ACTIVITY_CONTENT_LIMITS.description} caracteres.</Text>
    </View> : <View style={styles.field}>
      <Text style={styles.label}>Descripción</Text>
      <View style={styles.choices}>
        {ACTIVITY_DESCRIPTION_OPTIONS.map(description => <Pressable key={description} accessibilityRole="radio"
          accessibilityLabel={description} accessibilityState={{ selected: draft.description === description, disabled }} disabled={disabled}
          onPress={() => change('description', description)} style={[styles.choice, draft.description === description && styles.selected]}>
          <Text style={draft.description === description ? styles.selectedText : styles.text}>{description}</Text>
        </Pressable>)}
        {hasCustomDescription ? <Pressable accessibilityRole="radio" accessibilityLabel="Conservar descripción actual"
          accessibilityState={{ selected: customDescriptionSelected, disabled }} disabled={disabled}
          onPress={() => { if (draft.description !== existingContent!.description) change('description', existingContent!.description); }}
          style={[styles.choice, customDescriptionSelected && styles.selected]}>
          <Text style={customDescriptionSelected ? styles.selectedText : styles.text}>Conservar descripción actual</Text>
        </Pressable> : null}
      </View>
      {customDescriptionSelected ? <>
        <Text style={styles.location}>{existingContent!.description}</Text>
        <Text style={styles.text}>Para cambiar la descripción, elige una opción de la lista.</Text>
      </> : null}
    </View>}
    <Text style={styles.text}>{firstOccurrence ? 'Fecha y hora de la primera actividad. ' : ''}Fechas y horas locales de tu dispositivo, en formato de 24 horas.</Text>
    <ActivityDateTimeField label="Fecha de inicio" mode="date" value={draft.startDate} disabled={disabled} onChange={value => change('startDate', value)} />
    <ActivityDateTimeField label="Hora de inicio" mode="time" value={draft.startTime} disabled={disabled} onChange={value => change('startTime', value)} />
    <ActivityDateTimeField label="Fecha de término" mode="date" value={draft.endDate} disabled={disabled} onChange={value => change('endDate', value)} />
    <ActivityDateTimeField label="Hora de término" mode="time" value={draft.endTime} disabled={disabled} onChange={value => change('endTime', value)} />
    {creationLocation?.buildingKey || creationLocation?.floorKey ? <Text style={styles.text}>Ubicación seleccionada en el mapa</Text> : null}
    <Text style={styles.label}>Edificio</Text>
    {creationLocation?.buildingKey ? <Text style={styles.location}>{building?.name ?? 'El edificio seleccionado ya no está disponible.'}</Text>
      : choices('buildingKey', 'Edificio', locations, locations.length ? 'Selecciona un edificio' : 'No hay edificios disponibles')}
    <Text style={styles.label}>Piso</Text>
    {creationLocation?.floorKey ? <Text style={styles.location}>{floor?.name ?? 'El piso seleccionado ya no está disponible.'}</Text>
      : building || locationDropdowns ? choices('floorKey', 'Piso', building?.floors ?? [],
        building ? building.floors.length ? 'Selecciona un piso' : 'No hay pisos disponibles' : 'Selecciona un edificio primero')
      : <Text style={styles.text}>Selecciona un edificio.</Text>}
    <Text style={styles.label}>Punto de interés (opcional)</Text>
    {floor || locationDropdowns ? choices('poiKey', 'Punto de interés (opcional)', floor ? [{ id: '', name: 'En el piso, sin punto de interés' }, ...floor.pois] : [],
      'Selecciona un piso primero') : <Text style={styles.text}>Selecciona un piso.</Text>}
    {existingContent?.customLabel ? field('customLabel', 'Referencia del lugar (opcional)', 'Ejemplo: junto a la sala de estudio', ACTIVITY_CONTENT_LIMITS.customLabel) : null}
  </View>;
}
const styles = StyleSheet.create({ field: { gap: 10 }, label: { fontWeight: '600', color: '#0F172A' }, text: { color: '#475569', lineHeight: 21 },
  input: { borderWidth: 1, borderColor: '#94A3B8', borderRadius: 8, padding: 12, color: '#0F172A' },
  description: { minHeight: 100, textAlignVertical: 'top' }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  location: { backgroundColor: '#F1F5F9', borderRadius: 8, padding: 12, color: '#0F172A', lineHeight: 21 },
  choice: { borderWidth: 1, borderColor: '#94A3B8', borderRadius: 8, padding: 10 }, selected: { backgroundColor: APP_COLORS.PRIMARY, borderColor: APP_COLORS.PRIMARY },
  selectedText: { color: '#FFFFFF', fontWeight: '600' },
  dropdown: { gap: 4 }, dropdownTrigger: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: '#94A3B8', borderRadius: 8, padding: 12 },
  dropdownActive: { borderColor: APP_COLORS.PRIMARY }, dropdownValue: { flex: 1, color: '#0F172A', lineHeight: 21 },
  placeholder: { color: '#64748B' }, disabled: { opacity: 0.5 },
  dropdownMenu: { maxHeight: 220, borderWidth: 1, borderColor: '#94A3B8', borderRadius: 8, backgroundColor: '#FFFFFF' },
  dropdownOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  dropdownSelected: { backgroundColor: '#E6F3F3' }, dropdownSelectedText: { color: APP_COLORS.PRIMARY, fontWeight: '600' }, });
