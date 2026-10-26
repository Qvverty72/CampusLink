import { safeAreaInset } from '@/lib/layout/safeArea';
import { useCallback, useState } from 'react';
import { Link, type Href } from 'expo-router';
import { Bell, ChartColumn, ChevronRight, Clock3, Flag, GraduationCap, MapPin, UsersRound, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNavigationBar } from '@/components/navigation/BottomNavigationBar';
import { RefreshScrollView } from '@/components/RefreshScrollView';
import { APP_COLORS } from '@/types/colors';
import { useProfile } from '../hooks/useProfile';
import { useUnreadNotificationCount } from '../hooks/useUnreadNotificationCount';
import { ProfileAccountModal } from './ProfileAccountModal';
import { ProfilePersonalCards } from './ProfilePersonalCards';
import { ProfileAcademicSkeleton, ProfileNotificationCountSkeleton } from './ProfileSkeleton';
import { useProfileOverview } from '../hooks/useProfileOverview';
import { canManageAccess } from '../types/access';
import { canAccessAnalytics } from '@/features/analytics/types/access';

/** Reúne identidad, perfil académico y accesos vigentes de la cuenta. */
export function ProfileScreen() {
  const { auth, closing, identity, signOut, academicProfile, academicLoading, academicError, reloadAcademicProfile } = useProfile();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const { unreadCount, refreshUnreadCount, loading: unreadLoading } = useUnreadNotificationCount();
  const personal = useProfileOverview(identity?.capabilities.general ? identity.campusId : null, identity?.userId);
  const profileLoading = academicLoading || personal.loading;
  const refreshing = profileLoading || unreadLoading;
  const refreshProfile = useCallback(() => {
    auth.refreshIdentity();
    personal.retry(); refreshUnreadCount();
  }, [auth.refreshIdentity, personal.retry, refreshUnreadCount]);
  const insets = useSafeAreaInsets();
  const fullName = academicProfile?.fullName?.trim() || identity?.profile.nombre_completo?.trim() || 'Mi perfil';
  const initials = fullName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('es');
  const managesAccess = canManageAccess(identity?.roles ?? []);
  const hasAnalytics = canAccessAnalytics(identity);

  return (
    <View style={styles.screen}>
      <RefreshScrollView
        style={styles.scroll}
        bounces
        alwaysBounceVertical
        overScrollMode="always"
        onRefresh={refreshProfile}
        refreshing={refreshing}
        refreshEnabled={Boolean(identity?.capabilities.general) && !refreshing && !closing && !accountMenuOpen}
        refreshLabel="tu perfil"
        indicatorColor={APP_COLORS.PRIMARY}
        refreshIndicatorOffset={insets.top + 8}
        contentContainerStyle={[styles.scrollContent, {
          paddingTop: safeAreaInset('top', insets.top, { offset: 24 }),
          paddingBottom: safeAreaInset('bottom', insets.bottom, { min: 8, base: 112 }),
          paddingLeft: safeAreaInset('left', insets.left, { min: 16 }),
          paddingRight: safeAreaInset('right', insets.right, { min: 16 }),
        }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <View style={styles.profileHeader}>
            <View style={styles.header}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Abrir opciones de cuenta"
                accessibilityHint={identity?.capabilities.general ? 'Perfil académico y cierre de sesión' : 'Opciones de cierre de sesión'}
                accessibilityState={{ expanded: accountMenuOpen }}
                activeOpacity={0.65}
                onPress={() => setAccountMenuOpen(true)}
                style={styles.avatar}
              >
                <Text style={styles.avatarText}>{identity?.profile.nombre_completo?.trim() ? initials : 'CL'}</Text>
              </TouchableOpacity>
              <View style={styles.identity}>
                <Text accessibilityRole="header" style={styles.name}>{fullName}</Text>
                <Text selectable style={styles.email}>{auth.session?.user.email}</Text>
              </View>
              {identity?.capabilities.general && (
                <Link href="/notifications" asChild>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={refreshing ? 'Notificaciones, actualizando contador' : unreadCount ? `Notificaciones, ${unreadCount} sin leer` : 'Notificaciones'}
                    activeOpacity={0.65}
                    style={styles.notificationButton}
                  >
                    <ProfileIcon icon={Bell} />
                    {refreshing ? <ProfileNotificationCountSkeleton /> : unreadCount !== null && unreadCount > 0 && (
                      <View style={styles.notificationBadge} accessible={false} aria-hidden>
                        <Text style={styles.notificationBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </Link>
              )}
            </View>
            {identity?.capabilities.general && (
              <View style={styles.academicSummary}>
                {academicLoading && !academicProfile && <ProfileAcademicSkeleton />}
                {academicProfile && <>
                  <AcademicChip icon={MapPin} label={academicProfile.campusName || 'Sin campus disponible'} kind="Campus" />
                  {academicProfile.careers.length ? academicProfile.careers.map(career => (
                    <AcademicChip key={career.id} icon={GraduationCap} label={career.nombre} kind="Carrera" />
                  )) : <AcademicChip icon={GraduationCap} label="Sin carreras asociadas" kind="Carreras" />}
                </>}
                {academicError && <>
                  <Text accessibilityRole="alert" style={styles.academicError}>{academicError}</Text>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Reintentar carga del perfil académico" activeOpacity={0.65} onPress={reloadAcademicProfile} style={styles.retryButton}>
                    <Text style={styles.retryText}>Reintentar</Text>
                  </TouchableOpacity>
                </>}
              </View>
            )}
          </View>

          {identity?.capabilities.general && <ProfilePersonalCards {...personal} loading={profileLoading} />}

          {(managesAccess || hasAnalytics) && (
            <View style={styles.section}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>ADMINISTRACIÓN</Text>
              <View style={styles.menu}>
                {managesAccess && <>
                  <ProfileMenuItem href="/audit" icon={Clock3} label="Historial administrativo" />
                  <ProfileMenuItem href="/access" icon={UsersRound} label="Administrar cuentas y accesos" divider />
                  <ProfileMenuItem href="/reports" icon={Flag} label="Denuncias de contenido" divider />
                </>}
                {hasAnalytics && (
                  <ProfileMenuItem href="/analytics" icon={ChartColumn} label="Analítica" divider={managesAccess} />
                )}
              </View>
            </View>
          )}
        </View>
      </RefreshScrollView>
      <BottomNavigationBar activeItemId="home" />
      {accountMenuOpen && (
        <ProfileAccountModal
          key={`${identity?.userId}:${identity?.campusId}`}
          canEditAcademic={Boolean(identity?.capabilities.general)}
          closing={closing}
          error={auth.error}
          onClose={() => setAccountMenuOpen(false)}
          onSignOut={signOut}
          onAcademicSaved={reloadAcademicProfile}
        />
      )}
    </View>
  );
}

function AcademicChip({ icon, label, kind }: { icon: LucideIcon; label: string; kind: string }) {
  return (
    <View style={styles.academicChip} accessible accessibilityLabel={`${kind}: ${label}`}>
      <ProfileIcon icon={icon} size={14} color={APP_COLORS.SECONDARY} />
      <Text style={styles.academicChipText}>{label}</Text>
    </View>
  );
}

function ProfileIcon({ icon: Icon, color = APP_COLORS.SECONDARY, size = 20 }: { icon: LucideIcon; color?: string; size?: number }) {
  return (
    <View style={{ pointerEvents: 'none' }} accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Icon size={size} color={color} strokeWidth={1.7} />
    </View>
  );
}

function ProfileMenuItem({ href, icon, label, divider = false }: { href: Href; icon: LucideIcon; label: string; divider?: boolean }) {
  return (
    <Link href={href} asChild>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={label}
        activeOpacity={0.65}
        style={StyleSheet.flatten([styles.menuItem, divider && styles.divider])}
      >
        <ProfileIcon icon={icon} size={18} />
        <Text style={styles.menuLabel}>{label}</Text>
        <ProfileIcon icon={ChevronRight} size={16} />
      </TouchableOpacity>
    </Link>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F7F9' },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: 20 },
  profileHeader: { gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 68, height: 68, borderRadius: 34, borderWidth: 3, borderColor: '#E0E8ED', flexShrink: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: APP_COLORS.ACCENT },
  avatarText: { color: APP_COLORS.PRIMARY, fontSize: 26, fontWeight: '600' },
  identity: { flex: 1, minWidth: 0, gap: 4 },
  name: { color: APP_COLORS.PRIMARY, fontSize: 20, fontWeight: '600', lineHeight: 26 },
  email: { color: '#607485', fontSize: 13, lineHeight: 19 },
  academicSummary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  academicChip: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: '#E9F0F6' },
  academicChipText: { flexShrink: 1, color: APP_COLORS.PRIMARY, fontSize: 12, fontWeight: '500', lineHeight: 16 },
  academicError: { color: '#B42318', fontSize: 11, lineHeight: 17 },
  retryButton: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 4 },
  retryText: { color: APP_COLORS.PRIMARY, fontSize: 12, fontWeight: '600' },
  notificationButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, alignSelf: 'flex-start' },
  notificationBadge: { position: 'absolute', top: 1, right: 0, minWidth: 20, minHeight: 20, paddingHorizontal: 4, borderRadius: 12, borderWidth: 2, borderColor: '#F4F7F9', backgroundColor: APP_COLORS.ACCENT, alignItems: 'center', justifyContent: 'center' },
  notificationBadgeText: { color: APP_COLORS.PRIMARY, fontSize: 10, fontWeight: '700', lineHeight: 14 },
  section: { gap: 10 },
  sectionTitle: { color: '#607485', fontSize: 10, fontWeight: '600', letterSpacing: 1.2, lineHeight: 16, marginLeft: 3 },
  menu: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E8ED', borderRadius: 16, overflow: 'hidden' },
  menuItem: { minHeight: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E0E8ED' },
  menuLabel: { flex: 1, color: APP_COLORS.PRIMARY, fontSize: 13, fontWeight: '500', lineHeight: 20 },
});
