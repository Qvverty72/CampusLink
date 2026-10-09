import { useState } from 'react';
import { Link, Redirect } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { loginAccount } from '@/features/auth/session';
import { authStyles as styles } from '@/features/auth/form.styles';

export default function LoginScreen() {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy || auth.status === 'loading') return;
    setError(null);
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || !password) {
      setError('Ingresa tu correo y contraseña.'); return;
    }
    setBusy(true);
    try { await loginAccount(address, password); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo iniciar sesión.'); }
    finally { setPassword(''); setBusy(false); }
  }

  if (auth.status === 'ready') return <Redirect href="/profile" />;
  const loading = auth.status === 'loading';
  return <SafeAreaView style={styles.page}>
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>CampusLink</Text>
        <Text style={styles.title}>Iniciar sesión</Text>
        <Text style={styles.description}>Ingresa con el correo y la contraseña de tu cuenta.</Text>
        {loading ? <ActivityIndicator color="#74C69D" accessibilityLabel="Consultando tu cuenta" />
          : auth.session ? <>
            <Text style={styles.description}>{auth.status === 'forbidden'
              ? 'Tu cuenta no tiene acceso o falta completar tu registro.'
              : 'No se pudo validar el acceso de tu cuenta.'}</Text>
            <Pressable accessibilityRole="button" onPress={auth.refreshIdentity} style={styles.button}><Text style={styles.buttonText}>Reintentar consulta</Text></Pressable>
            {auth.status === 'forbidden' && <Link href="/register" style={styles.link}>Completar registro institucional</Link>}
            <Pressable accessibilityRole="button" disabled={busy} onPress={async () => {
              if (busy) return; setBusy(true); await auth.signOut(); setBusy(false);
            }}><Text style={styles.link}>Cerrar sesión</Text></Pressable>
          </> : <>
            <Text style={styles.label}>Correo</Text>
            <TextInput accessibilityLabel="Correo" style={styles.input} value={email} onChangeText={setEmail}
              keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" maxLength={254} editable={!busy} />
            <Text style={styles.label}>Contraseña</Text>
            <TextInput accessibilityLabel="Contraseña" style={styles.input} value={password} onChangeText={setPassword}
              secureTextEntry autoComplete="current-password" maxLength={4096} editable={!busy} onSubmitEditing={submit} />
            <Pressable accessibilityRole="button" disabled={busy || auth.status === 'unconfigured'} onPress={submit}
              style={[styles.button, (busy || auth.status === 'unconfigured') && styles.disabled]}><Text style={styles.buttonText}>Iniciar sesión</Text></Pressable>
            <Link href="/recover" style={styles.link}>Olvidé mi contraseña</Link>
            <Link href="/register" style={styles.link}>Crear cuenta institucional</Link>
          </>}
        {busy && <ActivityIndicator color="#74C69D" accessibilityLabel="Procesando" />}
        {(error || auth.error) && <Text accessibilityRole="alert" style={styles.error}>{error || auth.error}</Text>}
        {auth.status === 'unconfigured' && <Text style={styles.error}>La autenticación no está configurada.</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
