import { Text, View } from 'react-native';
import { UserRound } from 'lucide-react-native';
import type { AuditActor } from '../types/audit';
import { AuditActorBadge } from './AuditActorBadge';
import { auditColors as colors, auditStyles as styles } from './audit.styles';

/** Franja de autoría compartida por las cards del listado y cada edición original. */
export function AuditResponsibleBanner({ actorId, actor, caption = 'Responsable' }: {
  actorId: string | null; actor?: AuditActor; caption?: string;
}) {
  return <View style={styles.responsibleBand}>
    <View style={styles.responsibleAvatar} accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <UserRound size={16} color={colors.PRIMARY} strokeWidth={1.8} />
    </View>
    <View style={styles.actor}>
      <Text style={styles.responsibleCaption}>{caption}</Text>
      <Text style={styles.actorName}>{actor?.name ?? (actorId ? 'Nombre no disponible' : 'No registrado')}</Text>
    </View>
    <View style={styles.actorTag}><AuditActorBadge actorId={actorId} actor={actor} variant="tag" /></View>
  </View>;
}
