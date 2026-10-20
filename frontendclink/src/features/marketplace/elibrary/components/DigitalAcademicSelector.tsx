import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { APP_COLORS } from '@/types/colors';
import type { DigitalAcademicCatalog, DigitalAcademicOption } from '../types/publication';

interface Props {
  catalog: DigitalAcademicCatalog | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  careerIds: string[];
  subjectIds: string[];
  onCareersChange: (ids: string[]) => void;
  onSubjectsChange: (ids: string[]) => void;
  disabled: boolean;
  previous?: { careers: DigitalAcademicOption[]; subjects: DigitalAcademicOption[] };
}
export function DigitalAcademicSelector(props: Props) {
  return <View style={styles.section}>
    <Text style={styles.title}>Relación académica</Text>
    <Text style={styles.helper}>Puedes elegir varias carreras y asignaturas de tu institución. Cada selección es independiente.</Text>
    {props.loading ? <ActivityIndicator accessibilityLabel="Cargando catálogo académico" /> : props.error ? <>
      <Text style={styles.error} accessibilityLiveRegion="polite">{props.error}</Text>
      <Pressable accessibilityRole="button" onPress={props.reload} disabled={props.disabled} style={styles.action}><Text style={styles.link}>Reintentar catálogo</Text></Pressable>
    </> : props.catalog && <>
      <AcademicChoices label="Carreras" options={props.catalog.careers} selected={props.careerIds} onChange={props.onCareersChange}
        disabled={props.disabled} previous={props.previous?.careers} />
      <AcademicChoices label="Asignaturas" options={props.catalog.subjects} selected={props.subjectIds} onChange={props.onSubjectsChange}
        disabled={props.disabled} previous={props.previous?.subjects} />
    </>}
  </View>;
}
function AcademicChoices({ label, options, previous = [], selected, onChange, disabled }: {
  label: string; options: DigitalAcademicOption[]; previous?: DigitalAcademicOption[];
  selected: string[]; onChange: (ids: string[]) => void; disabled: boolean;
}) {
  const [search, setSearch] = useState('');
  const unavailable = previous.filter(row => selected.includes(row.id) && !options.some(option => option.id === row.id));
  const needle = search.trim().toLocaleLowerCase();
  const visible = options.filter(row => selected.includes(row.id) || `${row.name} ${row.code ?? ''}`.toLocaleLowerCase().includes(needle));
  function toggle(id: string) { onChange(selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id]); }
  return <View style={styles.section}>
    <Text style={styles.label}>{label} · {selected.length} seleccionada{selected.length === 1 ? '' : 's'}</Text>
    {options.length > 8 && <TextInput accessibilityLabel={`Buscar ${label.toLowerCase()}`} placeholder={`Buscar ${label.toLowerCase()} por nombre o código`}
      value={search} onChangeText={setSearch} editable={!disabled} style={styles.search} />}
    {!options.length && <Text style={styles.helper}>Aún no hay {label.toLowerCase()} disponibles en el catálogo de tu institución.</Text>}
    {[...unavailable, ...visible].map(row => {
      const checked = selected.includes(row.id), missing = unavailable.some(value => value.id === row.id);
      return <Pressable key={row.id} accessibilityRole="checkbox" accessibilityLabel={`${label}: ${row.name}${row.code ? ` (${row.code})` : ''}`}
        accessibilityState={{ checked, disabled }} aria-checked={checked} aria-disabled={disabled}
        disabled={disabled} onPress={() => toggle(row.id)} style={[styles.option, checked && styles.checked]}>
        <Text style={[styles.check, checked && styles.link]}>{checked ? '✓' : '+'}</Text>
        <View style={styles.text}><Text style={styles.name}>{row.name}</Text>
          {row.code && <Text style={styles.helper}>{row.code}</Text>}
          {missing && <Text style={styles.error}>Ya no está disponible. Quita esta selección para guardar.</Text>}
        </View>
      </Pressable>;
    })}
    {options.length > 0 && !visible.length && <Text style={styles.helper}>No hay coincidencias.</Text>}
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: 10 }, title: { color: '#09243A', fontSize: 18, fontWeight: '700' },
  label: { color: '#09243A', fontSize: 15, fontWeight: '600', marginTop: 4 },
  helper: { color: '#607485', fontSize: 14, lineHeight: 21 },
  option: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#BDCBD5' },
  checked: { backgroundColor: '#E9F0F6', borderColor: APP_COLORS.PRIMARY },
  check: { color: '#607485', width: 18, fontSize: 19 }, text: { flex: 1, gap: 3 }, name: { color: '#09243A', fontSize: 15 },
  search: { color: '#09243A', fontSize: 15, padding: 12, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#BDCBD5' },
  error: { color: '#9D302A', fontSize: 14, lineHeight: 21 },
  action: { minHeight: 44, justifyContent: 'center' }, link: { color: APP_COLORS.PRIMARY, fontSize: 15, fontWeight: '600' },
});
