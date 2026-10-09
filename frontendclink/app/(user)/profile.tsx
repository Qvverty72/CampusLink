import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomNavigationBar } from '@/components/navigation/BottomNavigationBar';
import { useAuth } from '@/features/auth/AuthProvider';
import { AcademicProfileSection } from '@/features/users/AcademicProfile';

export default function ProfileScreen() {
  const auth = useAuth();
  const [closing, setClosing] = useState(false);
  const identity = auth.identity;
  const localRoles = identity?.roles.filter(role => role.campusId === identity.campusId) ?? [];
  const roleLabel = localRoles.some(role => role.name === 'ADMINISTRADOR') ? 'Administrador'
    : localRoles.some(role => role.name === 'USUARIO_AUTORIZADO') ? 'Usuario autorizado'
    : identity?.profile.verificado_en ? 'Usuario institucional verificado' : 'Cuenta';
  const functions = identity ? [identity.capabilities.general && 'Funciones generales',
    identity.capabilities.officialActivities && 'Actividades oficiales', identity.capabilities.analytics && 'Analítica',
    identity.capabilities.reports && 'Reportería'].filter(Boolean).join(' · ') : '';
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>CL</Text>
        </View>

        <Text style={styles.eyebrow}>CUENTA</Text>
        <Text style={styles.title}>Mi perfil</Text>
        <Text style={styles.description}>
          {identity?.profile.nombre_completo}
        </Text>

        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Información personal</Text>
          <Text style={styles.placeholderDescription}>
            {auth.session?.user.email}
          </Text>
          <Text style={styles.placeholderDescription}>{roleLabel}</Text>
          <Text style={styles.placeholderDescription}>Acceso en tu campus: {functions || 'Solo tu cuenta'}</Text>
        </View>

        {identity?.capabilities.general && <AcademicProfileSection key={`${identity.userId}:${identity.campusId}`} />}

        <View style={styles.moduleLinks}>
          {identity?.capabilities.reports && <Link href={'/reports'} asChild>
            <Pressable
              accessibilityRole={'button'}
              accessibilityLabel={'Ir a Reportes'}
              style={({ pressed }) => [
                styles.moduleLink,
                pressed && styles.moduleLinkPressed,
              ]}
            >
              <Text style={styles.moduleLinkText}>Reportes</Text>
              <Text style={styles.moduleLinkArrow}>→</Text>
            </Pressable>
          </Link>}

          {identity?.capabilities.analytics && <Link href={'/analytics'} asChild>
            <Pressable
              accessibilityRole={'button'}
              accessibilityLabel={'Ir a Analítica'}
              style={({ pressed }) => [
                styles.moduleLink,
                pressed && styles.moduleLinkPressed,
              ]}
            >
              <Text style={styles.moduleLinkText}>Analítica</Text>
              <Text style={styles.moduleLinkArrow}>→</Text>
            </Pressable>
          </Link>}
          <Pressable accessibilityRole="button" disabled={closing} style={styles.moduleLink} onPress={async () => {
            if (closing) return; setClosing(true); await auth.signOut(); setClosing(false);
          }}><Text style={styles.moduleLinkText}>{closing ? 'Cerrando sesión…' : 'Cerrar sesión'}</Text></Pressable>
          {auth.error && <Text accessibilityRole="alert" style={styles.placeholderDescription}>{auth.error}</Text>}
        </View>
      </ScrollView>
      <BottomNavigationBar activeItemId={'home'} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#071A2B',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 28,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginBottom: 28,
  },
  avatarText: {
    color: '#0B6E75',
    fontSize: 18,
    fontWeight: '900',
  },
  eyebrow: {
    color: '#74C69D',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.2,
    marginBottom: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '800',
  },
  description: {
    color: '#B9CAD6',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12,
  },
  placeholder: {
    marginTop: 30,
    padding: 18,
    borderRadius: 16,
    backgroundColor: '#102A3F',
  },
  placeholderTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  placeholderDescription: {
    color: '#B9CAD6',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  moduleLinks: {
    gap: 12,
    marginTop: 16,
  },
  moduleLink: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  moduleLinkPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  moduleLinkText: {
    color: '#09243A',
    fontSize: 16,
    fontWeight: '700',
  },
  moduleLinkArrow: {
    color: '#0B6E75',
    fontSize: 22,
    fontWeight: '700',
  },
});
