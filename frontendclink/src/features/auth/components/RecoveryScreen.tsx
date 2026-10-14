import { Link } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput } from 'react-native';

import { authStyles as styles } from './form.styles';
import { useRecovery } from '../hooks/useRecovery';

/** Flujo de recuperación con solicitud de código y confirmación de nueva contraseña. */
export function RecoveryScreen() {
  const { email, setEmail, pendingEmail, setPendingEmail, code, setCode, password, setPassword,
    confirmation, setConfirmation, busy, done, error, setError, notice, setNotice, request, confirm } = useRecovery();
  return <SafeAreaView style={styles.page}>
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Link href="/login" style={styles.link}>← Volver al inicio de sesión</Link>
        <Text style={styles.brand}>CampusLink</Text>
        <Text style={styles.title}>{done ? 'Contraseña actualizada' : 'Recuperar contraseña'}</Text>
        {done ? <>
          <Text style={styles.description}>Ya puedes iniciar sesión con tu nueva contraseña.</Text>
          <Link href="/login" replace style={styles.link}>Iniciar sesión</Link>
        </> : pendingEmail ? <>
          <Text style={styles.description}>Ingresa el código de recuperación recibido por correo y elige una nueva contraseña. El código tiene vigencia limitada y solo puede usarse una vez.</Text>
          <Text style={styles.label}>Código de recuperación</Text>
          <TextInput accessibilityLabel="Código de recuperación" style={styles.input} value={code} onChangeText={setCode}
            keyboardType="number-pad" autoComplete="one-time-code" maxLength={10} editable={!busy} />
          <Text style={styles.label}>Nueva contraseña</Text>
          <TextInput accessibilityLabel="Nueva contraseña" style={styles.input} value={password} onChangeText={setPassword}
            secureTextEntry autoComplete="new-password" maxLength={4096} editable={!busy} />
          <Text style={styles.label}>Repetir nueva contraseña</Text>
          <TextInput accessibilityLabel="Repetir nueva contraseña" style={styles.input} value={confirmation} onChangeText={setConfirmation}
            secureTextEntry autoComplete="new-password" maxLength={4096} editable={!busy} onSubmitEditing={confirm} />
          <Pressable accessibilityRole="button" disabled={busy} onPress={confirm} style={[styles.button, busy && styles.disabled]}><Text style={styles.buttonText}>Cambiar contraseña</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={request}><Text style={styles.link}>Solicitar un código nuevo</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => {
            setPendingEmail(null); setCode(''); setPassword(''); setConfirmation(''); setError(null); setNotice(null);
          }}><Text style={styles.link}>Usar otro correo</Text></Pressable>
        </> : <>
          <Text style={styles.description}>Solicita un código para establecer una nueva contraseña.</Text>
          <Text style={styles.label}>Correo</Text>
          <TextInput accessibilityLabel="Correo" style={styles.input} value={email} onChangeText={setEmail}
            keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" maxLength={254} editable={!busy} onSubmitEditing={request} />
          <Pressable accessibilityRole="button" disabled={busy} onPress={request} style={[styles.button, busy && styles.disabled]}><Text style={styles.buttonText}>Enviar código</Text></Pressable>
        </>}
        {busy && <ActivityIndicator color="#74C69D" accessibilityLabel="Procesando" />}
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {notice && <Text accessibilityLiveRegion="polite" style={styles.description}>{notice}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
