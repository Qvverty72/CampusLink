import { StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { accessLabels } from '../types/access';
import type { AuditActor } from '../types/audit';
import { AuditActorBadge } from './AuditActorBadge';
import { auditColors as colors } from './audit.styles';

/** Describe las asignaciones históricas del responsable; no calcula ni concede capacidades. */
export function AuditActorAssignments({ actorId, actor }: { actorId: string | null; actor?: AuditActor }) {
  const available = !!actorId && actor?.source === 'assignment_history';
  return <View style={styles.card}>
    <AuditActorBadge actorId={actorId} actor={actor} variant="detail" />
    <Text style={styles.caption}>{available ? 'Asignaciones vigentes al momento de la acción.' : 'No hay información histórica de roles y permisos para esta acción.'}</Text>
    {available && <>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.heading}>ROLES ({actor.roles.length})</Text>
        {actor.roles.length ? <View style={styles.roles}>
          {actor.roles.map((role,index) => <View key={role+index} style={[styles.role,role === 'ADMINISTRADOR' && styles.adminRole]}>
            <Text selectable style={[styles.chipText,role === 'ADMINISTRADOR' && styles.adminText]}>{accessLabels[role] ?? role}</Text>
          </View>)}
        </View> : <Text style={styles.empty}>Sin roles asignados.</Text>}
      </View>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.heading}>PERMISOS ({actor.permissions.length})</Text>
        {actor.permissions.length ? <View style={styles.permissions}>
          {actor.permissions.map((permission,index) => <View key={permission+index} style={styles.permission}>
            <View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Check size={13} color="#286B49" strokeWidth={2} />
            </View>
            <Text selectable style={styles.chipText}>{accessLabels[permission] ?? permission}</Text>
          </View>)}
        </View> : <Text style={styles.empty}>Sin permisos específicos asignados.</Text>}
      </View>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  card: { marginVertical: 14, padding: 15, gap: 8, borderWidth: 1, borderColor: '#DCE6EF', borderRadius: 16, backgroundColor: colors.surface },
  caption: { color: colors.PRIMARY, fontSize: 11, lineHeight: 18 },
  section: { gap: 7, marginTop: 6 }, heading: { color: colors.PRIMARY, fontSize: 10, lineHeight: 16, fontWeight: '600', letterSpacing: 0.45 },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  role: { maxWidth: '100%', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999, backgroundColor: '#E8F0F9' },
  adminRole: { backgroundColor: '#0B2E50' }, adminText: { color: '#FFFFFF', fontWeight: '600' },
  permissions: { alignItems: 'flex-start', gap: 6 },
  permission: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: '#E5F3EB' },
  chipText: { color: colors.PRIMARY, fontSize: 11, lineHeight: 17, flexShrink: 1 },
  empty: { color: colors.muted, fontSize: 11, lineHeight: 18 },
});
