import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { publicationUI as f } from './PublicationFormUI';

/** Catálogos extensos: la selección conserva su UUID y siempre permanece visible. */
export function PublicationChoices({ label, options, value, onChange, disabled, emptyLabel }: {
  label: string; options: { id: string; name: string; code?: string | null }[]; value: string;
  onChange: (id: string) => void; disabled: boolean; emptyLabel?: string;
}) {
  const [search, setSearch] = useState(''), [limit, setLimit] = useState(20);
  const needle = search.trim().toLocaleLowerCase();
  const matches = options.filter(row => row.id !== value && `${row.name} ${row.code ?? ''}`.toLocaleLowerCase().includes(needle));
  const visibleIds = new Set([value, ...matches.slice(0, limit).map(row => row.id)]);
  const visible = options.filter(row => visibleIds.has(row.id));
  const choice = (id: string, name: string, code?: string | null) => <Pressable key={id} accessibilityRole="radio"
    accessibilityLabel={name} accessibilityState={{ checked: value === id, disabled }} aria-checked={value === id} disabled={disabled}
    onPress={() => onChange(id)} style={[f.choice, value === id && f.selected, disabled && f.disabled]}>
    <Text style={f.actionText}>{name}{code ? ` · ${code}` : ''}</Text></Pressable>;
  return <View style={f.field}><Text style={f.label}>{label}</Text>
    {options.length > 8 && <TextInput accessibilityLabel={`Buscar ${label}`} placeholder="Buscar por nombre o código" value={search}
      onChangeText={text => { setSearch(text); setLimit(20); }} editable={!disabled} style={f.input} />}
    <View style={f.choices}>{emptyLabel && choice('', emptyLabel)}{visible.map(row => choice(row.id, row.name, row.code))}</View>
    {!matches.length && Boolean(needle) && <Text style={f.hint}>Sin coincidencias para esta búsqueda.</Text>}
    {matches.length > limit && <Pressable accessibilityRole="button" disabled={disabled} style={f.secondary} onPress={() => setLimit(count => count + 20)}>
      <Text style={f.actionText}>Mostrar más opciones ({limit} de {matches.length})</Text></Pressable>}
  </View>;
}
