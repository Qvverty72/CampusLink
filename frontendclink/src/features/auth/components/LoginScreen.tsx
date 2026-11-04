import { Link, Redirect } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { LockKeyhole, Mail, UserRoundPlus } from 'lucide-react-native';

import { AUTH_COLORS, authStyles as styles } from './form.styles';
import { AuthButton, AuthHeading, AuthInput, AuthMessage, AuthScaffold } from './AuthUI';
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
  return <AuthScaffold>
        <AuthHeading title="Iniciar sesión" description="Qué bueno verte de nuevo. Ingresa a tu comunidad con tu correo y contraseña." />
        {loading ? <ActivityIndicator color={AUTH_COLORS.PRIMARY} accessibilityLabel="Consultando tu cuenta" />
          : auth.session ? <>
            <Text accessibilityRole={denied ? 'alert' : undefined} style={styles.description}>{denied
              ? denialMessage
              : 'No se pudo validar el acceso de tu cuenta.'}</Text>
            <AuthButton onPress={auth.refreshIdentity}>Reintentar</AuthButton>
            {denied && auth.denialCode === 'REGISTRATION_REQUIRED' && <Link href="/register" style={styles.link}>Completar registro institucional</Link>}
            <Pressable accessibilityRole="button" disabled={busy} onPress={async () => {
              if (busy) return; setBusy(true); await auth.signOut(); setBusy(false);
            }} style={styles.linkButton}><Text style={styles.link}>Cerrar sesión</Text></Pressable>
          </> : <>
            <View style={styles.form}>
              <AuthInput label="Correo" icon={Mail} value={email} onChangeText={setEmail} placeholder="tu@correo.cl"
                keyboardType="email-address" autoComplete="email" maxLength={254} editable={!busy} />
              <AuthInput label="Contraseña" icon={LockKeyhole} password value={password} onChangeText={setPassword} placeholder="Ingresa tu contraseña"
                autoComplete="current-password" maxLength={4096} editable={!busy} onSubmitEditing={submit} returnKeyType="go" />
              <AuthButton disabled={auth.status === 'unconfigured'} busy={busy} onPress={submit}>Iniciar sesión</AuthButton>
            </View>
            <Link href="/recover" asChild><Pressable accessibilityRole="link" style={styles.linkButton}><Text style={styles.link}>Olvidé mi contraseña</Text></Pressable></Link>
            <View style={styles.divider} />
            <View style={styles.actions}>
              <Text style={styles.mutedCenter}>¿Primera vez en CampusLink?</Text>
              <Link href="/register" asChild><Pressable accessibilityRole="link" style={styles.secondaryButton}>
                <UserRoundPlus size={18} color={AUTH_COLORS.PRIMARY} /><Text style={styles.secondaryText}>Crear cuenta institucional</Text>
              </Pressable></Link>
            </View>
          </>}
        <AuthMessage error>{error || auth.error}</AuthMessage>
        {auth.status === 'unconfigured' && <AuthMessage error>La autenticación no está configurada.</AuthMessage>}
  </AuthScaffold>;
}
