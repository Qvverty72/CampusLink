import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { CircleCheck, KeyRound, LockKeyhole, Mail } from 'lucide-react-native';

import { authStyles as styles } from './form.styles';
import { AuthButton, AuthHeading, AuthInput, AuthMessage, AuthScaffold, ResendCodeButton } from './AuthUI';
import { useRecovery } from '../hooks/useRecovery';

/** Solicitud por correo y confirmación OTP con contraseñas visibles a elección del usuario. */
export function RecoveryScreen() {
  const { email, setEmail, pendingEmail, setPendingEmail, code, setCode, password, setPassword,
    confirmation, setConfirmation, busy, done, error, setError, request, confirm, resendSeconds } = useRecovery();
  return <AuthScaffold back stepKey={done ? 'done' : pendingEmail ? 'code' : 'email'}>
    {done ? <>
      <AuthHeading icon={CircleCheck} title="Contraseña actualizada" description="Tu contraseña se cambió correctamente. Ya puedes volver a tu comunidad." />
      <Link href="/login" replace asChild><Pressable accessibilityRole="link" style={styles.button}><Text style={styles.buttonText}>Iniciar sesión</Text></Pressable></Link>
    </> : pendingEmail ? <>
      <AuthHeading title="Recuperar contraseña" description={<>Si tu correo tiene una cuenta asociada, recibirás un código en <Text style={styles.email}>{pendingEmail}</Text>.</>} />
      <View style={styles.form}>
        <AuthInput label="Código de recuperación" icon={KeyRound} code value={code} onChangeText={setCode}
          placeholder="000000" keyboardType="number-pad" autoComplete="one-time-code" maxLength={10} editable={!busy} />
        <AuthInput label="Nueva contraseña" icon={LockKeyhole} password value={password} onChangeText={setPassword}
          placeholder="Elige una nueva contraseña" autoComplete="new-password" maxLength={4096} editable={!busy} />
        <AuthInput label="Repetir nueva contraseña" icon={LockKeyhole} password value={confirmation} onChangeText={setConfirmation}
          placeholder="Repite tu nueva contraseña" autoComplete="new-password" maxLength={4096} editable={!busy} onSubmitEditing={confirm} returnKeyType="go" />
        <AuthButton busy={busy} onPress={confirm}>Cambiar contraseña</AuthButton>
      </View>
      <Text style={styles.description}>El código tiene vigencia limitada y solo puede usarse una vez. Revisa también el correo no deseado.</Text>
      <View style={styles.divider} />
      <View style={styles.actions}>
        <ResendCodeButton seconds={resendSeconds} busy={busy} onPress={request} />
        <Pressable accessibilityRole="button" disabled={busy} style={[styles.linkButton, busy && styles.disabled]} onPress={() => {
          setPendingEmail(null); setCode(''); setPassword(''); setConfirmation(''); setError(null);
        }}><Text style={styles.link}>Usar otro correo</Text></Pressable>
      </View>
    </> : <>
      <AuthHeading title="¿Olvidaste tu contraseña?" description="Ingresa el correo de tu cuenta para solicitar un código y crear una nueva contraseña." />
      <View style={styles.form}>
        <AuthInput label="Correo" icon={Mail} value={email} onChangeText={setEmail} placeholder="tu@correo.cl"
          keyboardType="email-address" autoComplete="email" maxLength={254} editable={!busy} onSubmitEditing={request} returnKeyType="send" />
        <AuthButton busy={busy} disabled={resendSeconds > 0} onPress={request}>{resendSeconds > 0 ? `Enviar código en ${resendSeconds} s` : 'Enviar código'}</AuthButton>
      </View>
    </>}
    <AuthMessage error>{error}</AuthMessage>
  </AuthScaffold>;
}
