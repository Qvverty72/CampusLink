import { Text, View } from 'react-native';
import { evidenceLabels, evidenceValue, isEvidenceDate, isEvidenceReference } from '../utils/reportPresentation';
import { reportStyles as s } from './reports.styles';

/** Sólo campos descriptivos conocidos del snapshot; no expone referencias técnicas. */
export function ReportEvidence({ value, hideWithdrawal = false }: { value: unknown; hideWithdrawal?: boolean }) {
  if (value === null || value === undefined) return <Text style={s.muted}>Sin antecedentes registrados.</Text>;
  if (Array.isArray(value)) return value.length ? <View style={s.stack}>{value.map((item, i) => <ReportEvidence key={i} value={item} hideWithdrawal={hideWithdrawal} />)}</View> : <Text style={s.muted}>Sin registros.</Text>;
  if (typeof value !== 'object') return <Text selectable style={s.body}>{evidenceValue('', value as string | number | boolean)}</Text>;
  const record = value as Record<string, unknown>;
  const entries = Object.entries(record).filter(([key]) => evidenceLabels[key] && !isEvidenceReference(key) && key !== 'files'
    && !(hideWithdrawal && ['deleted_at', 'deletedAt'].includes(key))
    && !(key === 'precio' && record.modalidad === 'DONACION'));
  if (!entries.length) return <Text style={s.muted}>No hay información descriptiva registrada.</Text>;
  return <View style={s.stack}>{entries.map(([key, item]) => {
    const nested = item !== null && typeof item === 'object';
    return <View key={key} style={nested ? s.fieldGroup : s.field}>
      <Text style={s.small}>{evidenceLabels[key]}</Text>
      {nested ? <ReportEvidence value={item} hideWithdrawal={hideWithdrawal} /> : <Text selectable style={s.body}>{item === null || item === undefined ? 'No registrado' : evidenceValue(key, item as string | number | boolean, record)}</Text>}
    </View>;
  })}</View>;
}

export function reportReferences(value: unknown, prefix = ''): { label: string; value: string }[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => reportReferences(item, `${prefix} ${index + 1}`));
  return Object.entries(value).flatMap(([key, item]) => {
    if (!evidenceLabels[key]) return [];
    const label = [prefix, evidenceLabels[key]].filter(Boolean).join(' · ');
    if (item !== null && typeof item === 'object') return reportReferences(item, label);
    return isEvidenceReference(key) || isEvidenceDate(key) ? [{ label, value: item === null || item === undefined ? 'No registrado' : String(item) }] : [];
  });
}
