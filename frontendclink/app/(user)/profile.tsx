import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomNavigationBar } from '@/components/navigation/BottomNavigationBar';

export default function ProfileScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>CL</Text>
        </View>

        <Text style={styles.eyebrow}>CUENTA</Text>
        <Text style={styles.title}>Mi perfil</Text>
        <Text style={styles.description}>
          Esta pantalla base está preparada para mostrar la información de tu
          perfil.
        </Text>

        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Información personal</Text>
          <Text style={styles.placeholderDescription}>
            Aquí se agregarán los datos y opciones de la cuenta.
          </Text>
        </View>

        <View style={styles.moduleLinks}>
          <Link href={'/reports'} asChild>
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
          </Link>

          <Link href={'/analytics'} asChild>
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
          </Link>
        </View>
      </View>
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
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
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
