import { Text, View } from 'react-native';
import type { ReportPerson } from '../types/review';
import { reportStyles as s } from './reports.styles';

/** Contacto vigente. El ID original se conserva en el DTO, fuera de la lectura cotidiana. */
export function ReportPersonDetails({ label, person, missingName = 'Nombre no disponible' }: {
  label: string; person?: Partial<ReportPerson> | null; missingName?: string;
}) {
  return <View style={s.field}>
    <Text style={s.label}>{label}</Text>
    <Text selectable style={s.body}>{person?.name?.trim() || missingName}</Text>
    <Text selectable style={s.small}>{person?.email?.trim() || 'Correo no disponible'}</Text>
  </View>;
}
