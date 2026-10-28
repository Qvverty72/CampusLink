import { Text, View } from 'react-native';
import type { AuditReference } from '../types/audit';
import { accessLabels } from '../types/access';
import { auditStyles as styles } from './audit.styles';

/** Presenta nombre e ID íntegro; la procedencia permanece en los metadatos de la respuesta. */
export function AuditReferenceValue({ id, reference }: { id: string; reference?: AuditReference }) {
  if (!reference || reference.id !== id) return <Text selectable style={styles.identifier}>{id}</Text>;
  const name = reference.name && (reference.kind === 'role' || reference.kind === 'permission' || reference.kind === 'assignment'
    ? accessLabels[reference.name] ?? reference.name : reference.name);
  return <View style={styles.referenceValue}>
    <Text selectable style={name ? styles.referenceName : styles.valueMuted}>{name ?? 'Nombre no disponible'}</Text>
    <Text selectable style={styles.referenceId}>ID: {id}</Text>
  </View>;
}
