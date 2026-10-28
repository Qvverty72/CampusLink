import { StyleSheet, Text, View } from 'react-native';
import { BadgeCheck, ShieldCheck, UserRound } from 'lucide-react-native';
import type { AuditActor } from '../types/audit';
import { auditActorLabel } from '../utils/auditActorPresentation';

/** Mismo distintivo de responsable para listado y detalle. */
export function AuditActorBadge({ actorId, actor, variant = 'compact' }: { actorId: string | null; actor?: AuditActor; variant?: 'compact' | 'detail' | 'tag' }) {
  const admin = actor?.kind === 'administrator', authorized = actor?.kind === 'authorized', user = !!actorId && actor?.kind === 'user';
  const known = admin || authorized || user;
  const color = admin ? '#4A2B75' : authorized ? '#5B3E05' : user ? '#16476C' : '#536879';
  const backgroundColor = admin ? '#E7DAF5' : authorized ? '#F8E3AE' : user ? '#D1E5F4' : '#EFF3F5';
  const borderColor = admin ? '#B59BCD' : authorized ? '#CCAA5E' : '#A3C2D9';
  const Icon = admin ? ShieldCheck : authorized ? BadgeCheck : UserRound;
  return <View style={[styles.badge, variant === 'detail' && styles.detail, variant === 'tag' && styles.tag, known && styles.roleBadge, { backgroundColor, borderColor }]}>
    {variant !== 'tag' && <View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon size={13} color={color} strokeWidth={1.8} /></View>}
    <Text style={[styles.label, variant === 'detail' && styles.detailLabel, variant === 'tag' && styles.tagLabel, known && styles.roleLabel, { color }]}>{auditActorLabel(actorId,actor)}</Text>
  </View>;
}

const styles = StyleSheet.create({
  badge: { maxWidth: '100%', alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8 },
  label: { fontSize: 10, lineHeight: 15, fontWeight: '600', flexShrink: 1 },
  detail: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, gap: 6 },
  detailLabel: { fontSize: 11, lineHeight: 17 },
  tag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  tagLabel: { fontSize: 9, lineHeight: 13, fontWeight: '500' },
  roleBadge: { borderWidth: 1 },
  roleLabel: { fontWeight: '600' },
});
