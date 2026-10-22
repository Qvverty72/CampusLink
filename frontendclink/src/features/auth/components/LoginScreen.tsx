import { Link, Redirect } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput } from 'react-native';

import { authStyles as styles } from './form.styles';
import { useLogin } from '../hooks/useLogin';

/** Formulario de acceso conectado al hook que intercambia credenciales por sesión. */
export function LoginScreen() {
  const { auth, email, setEmail, password, setPassword, busy, setBusy, error, submit } = useLogin();
  if (auth.status === 'ready') return <Redirect href="/profile" />;
  const loading = auth.status === 'loading';
  const denied = auth.status === 'forbidden';
  const denialMessage = auth.denialCode === 'ACCOUNT_SUSPENDED'
    ? 'Tu cuenta está suspendida. Contacta a la administración de tu campus.'
    : auth.denialCode === 'ACCOUNT_DEACTIVATED'
      ? 'Tu cuenta está desactivada. Contacta a la administración de tu campus.'
      : auth.denialCode === 'REGISTRATION_REQUIRED'
        ? 'Falta completar tu registro institucional.'
        : 'Tu cuenta no tiene acceso. Contacta a la administración de tu campus.';
  return <SafeAreaView style={styles.page}>
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>CampusLink</Text>
        <Text style={styles.title}>Iniciar sesión</Text>
        <Text style={styles.description}>Ingresa con el correo y la contraseña de tu cuenta.</Text>
        {loading ? <ActivityIndicator color="#74C69D" accessibilityLabel="Consultando tu cuenta" />
          : auth.session ? <>
            <Text accessibilityRole={denied ? 'alert' : undefined} style={styles.description}>{denied
              ? denialMessage
              : 'No se pudo validar el acceso de tu cuenta.'}</Text>
            <Pressable accessibilityRole="button" onPress={auth.refreshIdentity} style={styles.button}><Text style={styles.buttonText}>Reintentar</Text></Pressable>
            {denied && auth.denialCode === 'REGISTRATION_REQUIRED' && <Link href="/register" style={styles.link}>Completar registro institucional</Link>}
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
