import { useEffect } from 'react';
import { Link, type Href } from 'expo-router';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { preloadCampusGLTF } from '@/three/models/CampusModel';

export default function WelcomeScreen() {
  useEffect(() => {
    preloadCampusGLTF();
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={[styles.glow, styles.glowTop]} />
        <View style={[styles.glow, styles.glowBottom]} />

        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>CL</Text>
          </View>
          <Text style={styles.brandName}>CampusLink</Text>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>TU CAMPUS, MÁS CERCA</Text>
          <Text style={styles.title}>Bienvenido a{`\n`}CampusLink</Text>
          <Text style={styles.description}>
            Explora el campus, encuentra edificios y descubre cada espacio desde
            un mapa interactivo.
          </Text>
        </View>

        <View style={styles.footer}>
          <Link href={'/map' as Href} prefetch replace asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Iniciar sesión"
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.buttonText}>Iniciar sesión</Text>
              <Text style={styles.buttonArrow}>→</Text>
            </Pressable>
          </Link>
          <Text style={styles.helperText}>
            Por ahora puedes ingresar sin una cuenta.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#071A2B',
  },
  container: {
    flex: 1,
    backgroundColor: '#071A2B',
    paddingHorizontal: 28,
    paddingVertical: 24,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: '#168AAD',
    opacity: 0.16,
  },
  glowTop: {
    top: -160,
    right: -120,
  },
  glowBottom: {
    bottom: -190,
    left: -150,
    backgroundColor: '#52B788',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  logoText: {
    color: '#0B6E75',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  brandName: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    maxWidth: 540,
  },
  eyebrow: {
    color: '#74C69D',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.2,
    marginBottom: 18,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 47,
    lineHeight: 52,
    fontWeight: '800',
    letterSpacing: -1.8,
  },
  description: {
    color: '#B9CAD6',
    fontSize: 17,
    lineHeight: 26,
    marginTop: 22,
    maxWidth: 430,
  },
  footer: {
    gap: 14,
  },
  button: {
    minHeight: 58,
    borderRadius: 18,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
  },
  buttonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  buttonText: {
    color: '#09243A',
    fontSize: 17,
    fontWeight: '700',
  },
  buttonArrow: {
    color: '#0B6E75',
    fontSize: 25,
    fontWeight: '600',
  },
  helperText: {
    color: '#8198A8',
    fontSize: 12,
    textAlign: 'center',
  },
});
