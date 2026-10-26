import { Link } from 'expo-router';
import { CalendarCheck, ChevronRight, ClipboardClock, FolderDown, ReceiptText, Store, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { APP_COLORS } from '@/types/colors';
import type { useProfileOverview } from '../hooks/useProfileOverview';
import { ProfilePersonalCardsSkeleton } from './ProfileSkeleton';

export type PersonalSection = 'publications' | 'requests' | 'transactions' | 'resources' | 'activities';
export const PERSONAL_TITLES: Record<PersonalSection, string> = {
  publications: 'Mis publicaciones', requests: 'Mis solicitudes', transactions: 'Mis transacciones',
  resources: 'Mis recursos', activities: 'Mis actividades',
};

export function ProfilePersonalCards({ overview, activities, failed, retry, loading }: ReturnType<typeof useProfileOverview>) {
  if (loading) return <ProfilePersonalCardsSkeleton />;
  return <View style={styles.section}>
    <View style={styles.row}>
      <PersonalCard section="publications" icon={Store} subtitle="Venta y donaciones" count={overview?.activePublications} unit="activas" />
      <PersonalCard section="requests" icon={ClipboardClock} subtitle="Estado de intercambios" count={overview?.pendingRequests} unit="pendientes" accent />
    </View>
    <View style={styles.row}>
      <PersonalCard section="transactions" icon={ReceiptText} subtitle="Historial completo" count={overview?.transactions} unit="pendientes" />
      <PersonalCard section="resources" icon={FolderDown} subtitle="Guías y apuntes" count={overview?.acquiredResources} unit="adquiridos" />
    </View>
    <PersonalCard section="activities" icon={CalendarCheck} subtitle="Talleres, deportes y grupos" count={activities} unit="inscripciones" wide />
    {failed && <TouchableOpacity accessibilityRole="button" onPress={retry} activeOpacity={0.65} style={styles.retry}>
      <Text style={styles.retryText}>No se actualizaron todos los contadores. Reintentar</Text>
    </TouchableOpacity>}
  </View>;
}

function PersonalCard({ section, icon: Icon, subtitle, count, unit, accent = false, wide = false }: {
  section: PersonalSection; icon: LucideIcon; subtitle: string; count?: number | null; unit?: string; accent?: boolean; wide?: boolean;
}) {
  const badge = count !== null && count !== undefined && count > 0;
  const unitLabel = count === 1 ? ({ activas: 'activa', pendientes: 'pendiente', adquiridos: 'adquirido', inscripciones: 'inscripción' }[unit ?? ''] ?? unit) : unit;
  return <Link href={{ pathname: '/personal', params: { section } }} asChild>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${PERSONAL_TITLES[section]}${badge ? `, ${count} ${unitLabel}` : ''}`}
      activeOpacity={0.75} style={StyleSheet.flatten([styles.card, wide && styles.wide])}>
      <View style={[styles.cardTop, wide && styles.wideTop]}>
        <View style={[styles.icon, accent && styles.accentIcon]} accessible={false} aria-hidden>
          <Icon size={23} color={accent ? '#8A6400' : APP_COLORS.PRIMARY} strokeWidth={1.8} />
        </View>
        {!wide && (badge ? <Text style={[styles.badge, accent && styles.accentBadge]}>{count} {unitLabel}</Text>
          : <ChevronRight size={17} color={APP_COLORS.SECONDARY} />)}
      </View>
      <View style={[styles.labels, wide && styles.wideLabels]}>
        <Text style={styles.title}>{PERSONAL_TITLES[section]}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {wide && badge && <Text style={styles.wideBadge}>{count} {unitLabel}</Text>}
      </View>
      {wide && <ChevronRight size={18} color={APP_COLORS.SECONDARY} />}
    </TouchableOpacity>
  </Link>;
}

const styles = StyleSheet.create({
  section: { gap: 12, marginTop: 4 }, row: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  card: { flex: 1, minWidth: 0, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, gap: 18, minHeight: 150 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#EAF1F8', alignItems: 'center', justifyContent: 'center' },
  accentIcon: { backgroundColor: '#FFF6DC' }, badge: { color: APP_COLORS.SECONDARY, backgroundColor: '#EFF4F8', paddingHorizontal: 5, paddingVertical: 3, borderRadius: 12, fontSize: 9, lineHeight: 14, fontWeight: '600', flexShrink: 1 },
  accentBadge: { color: '#8A6400', backgroundColor: '#FFF6DC' }, labels: { flexShrink: 1, gap: 5 }, wideLabels: { flex: 1 },
  title: { color: APP_COLORS.PRIMARY, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  subtitle: { color: '#617484', fontSize: 12, lineHeight: 18 },
  wide: { flex: 0, minHeight: 96, flexDirection: 'row', alignItems: 'center', gap: 12 },
  wideTop: { flexShrink: 0 }, wideBadge: { color: APP_COLORS.SECONDARY, fontSize: 11, lineHeight: 17, fontWeight: '600' },
  retry: { minHeight: 44, justifyContent: 'center' }, retryText: { color: APP_COLORS.PRIMARY, fontSize: 12, lineHeight: 18 },
});
