import { useState } from 'react';
import { ArrowLeft, ChevronRight, GraduationCap, LogOut, X, type LucideIcon } from 'lucide-react-native';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_COLORS } from '@/types/colors';
import { AcademicProfileSection } from './AcademicProfile';

interface ProfileAccountModalProps {
  canEditAcademic: boolean;
  closing: boolean;
  error: string | null;
  onClose: () => void;
  onSignOut: () => Promise<void>;
  onAcademicSaved?: () => void;
}

/** Opciones de cuenta y consulta/edición académica dentro de un único modal. */
export function ProfileAccountModal({ canEditAcademic, closing, error, onClose, onSignOut, onAcademicSaved }: ProfileAccountModalProps) {
  const [page, setPage] = useState<'menu' | 'academic'>('menu');
  const insets = useSafeAreaInsets();
  const academicVisible = page === 'academic' && canEditAcademic;
  const close = () => { if (!closing) onClose(); };

  return (
    <Modal visible transparent animationType="fade" presentationStyle="overFullScreen" onRequestClose={close}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.overlay, {
          paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16),
          paddingLeft: Math.max(insets.left, 16), paddingRight: Math.max(insets.right, 16),
        }]}
      >
        <TouchableOpacity
          accessible={false}
          aria-hidden
          importantForAccessibility="no"
          activeOpacity={1}
          disabled={closing}
          onPress={close}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.panel} accessibilityViewIsModal onAccessibilityEscape={close}>
          <View style={styles.header}>
            {academicVisible && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Volver a opciones de cuenta"
                activeOpacity={0.65}
                style={styles.iconButton}
                onPress={() => setPage('menu')}
              >
                <AccountIcon icon={ArrowLeft} />
              </TouchableOpacity>
            )}
            <Text accessibilityRole="header" style={styles.title}>Tu cuenta</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Cerrar opciones de cuenta"
              accessibilityState={{ disabled: closing }}
              disabled={closing}
              activeOpacity={0.65}
              style={[styles.iconButton, closing && styles.disabled]}
              onPress={close}
            >
              <AccountIcon icon={X} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {academicVisible ? <AcademicProfileSection onSaved={onAcademicSaved} /> : <>
              {canEditAcademic && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Perfil académico"
                  accessibilityState={{ disabled: closing }}
                  disabled={closing}
                  activeOpacity={0.65}
                  style={[styles.action, closing && styles.disabled]}
                  onPress={() => setPage('academic')}
                >
                  <AccountIcon icon={GraduationCap} />
                  <Text style={styles.actionText}>Perfil académico</Text>
                  <AccountIcon icon={ChevronRight} size={16} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ disabled: closing, busy: closing }}
                disabled={closing}
                activeOpacity={0.65}
                style={[styles.action, styles.signOut, closing && styles.disabled]}
                onPress={() => void onSignOut()}
              >
                <AccountIcon icon={LogOut} color={APP_COLORS.ACCENT} />
                <Text style={[styles.actionText, styles.signOutText]}>{closing ? 'Cerrando sesión…' : 'Cerrar sesión'}</Text>
              </TouchableOpacity>
            </>}
            {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AccountIcon({ icon: Icon, color = '#FFFFFF', size = 20 }: { icon: LucideIcon; color?: string; size?: number }) {
  return (
    <View style={{ pointerEvents: 'none' }} accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Icon size={size} color={color} strokeWidth={1.7} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#00000080', justifyContent: 'center', alignItems: 'center' },
  panel: { width: '100%', maxWidth: 480, maxHeight: '100%', flexShrink: 1, backgroundColor: APP_COLORS.PRIMARY, borderRadius: 20, borderWidth: 1, borderColor: '#FFFFFF1A', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 8, paddingVertical: 8, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#FFFFFF26' },
  title: { flex: 1, color: '#FFFFFF', fontSize: 17, fontWeight: '700', lineHeight: 24 },
  iconButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { padding: 16, gap: 12 },
  action: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, backgroundColor: `${APP_COLORS.SECONDARY}66` },
  actionText: { flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '600', lineHeight: 21 },
  signOut: { backgroundColor: `${APP_COLORS.ACCENT}0D`, borderWidth: 1, borderColor: `${APP_COLORS.ACCENT}66` },
  signOutText: { color: APP_COLORS.ACCENT },
  error: { color: '#FFB4AB', fontSize: 13, lineHeight: 20 },
  disabled: { opacity: 0.5 },
});
