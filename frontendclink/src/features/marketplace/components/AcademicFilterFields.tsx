import { Text, View } from 'react-native';
import { SearchableFilterSelect, type FilterSelectOption } from './SearchableFilterSelect';
import { ui } from './CatalogUI';

type AcademicField = 'careerId' | 'subjectId';

export function AcademicFilterFields({ careers, subjects, careerId, subjectId, onChange, openField, onOpenFieldChange, disabled = false, loading = false }: {
  careers: readonly FilterSelectOption[]; subjects: readonly FilterSelectOption[];
  careerId: string; subjectId: string; onChange: (field: AcademicField, id: string) => void;
  openField: AcademicField | null; onOpenFieldChange: (field: AcademicField | null) => void;
  disabled?: boolean; loading?: boolean;
}) {
  return <View style={{ gap: 8 }}>
    <Text style={ui.filterLabel}>Carrera y asignatura</Text>
    {([{ key: 'careerId', label: 'Carrera', options: careers, value: careerId },
      { key: 'subjectId', label: 'Asignatura', options: subjects, value: subjectId }] as const).map(field =>
      <SearchableFilterSelect key={field.key} searchRequired showLabel={false} label={field.label} placeholder={field.label}
        options={field.options} value={field.value} onChange={id => onChange(field.key, id)}
        expanded={openField === field.key} onExpandedChange={open => onOpenFieldChange(open ? field.key : null)}
        disabled={disabled} loading={loading} />)}
  </View>;
}
