import { useEffect, useState } from 'react';
import { Link, type Href } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { completeInstitutionalRegistration, confirmInstitutionalEmail, getRegistrationOptions, registerInstitutionalAccount, resendInstitutionalConfirmation, type RegistrationOption } from '@/features/auth/registration';

export default function RegisterScreen() {
  const auth = useAuth();
  const [options, setOptions] = useState<RegistrationOption[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [campusId, setCampusId] = useState('');
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmingProfile, setConfirmingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const domain = email.trim().toLowerCase().split('@')[1];
  const campuses = options.filter(option => option.dominio === domain);
  const selectedCampus = campuses.find(option => option.campus_id === campusId);

  useEffect(() => {
    if (auth.session?.user.email_confirmed_at) setConfirmingProfile(true);
  }, [auth.session]);

  useEffect(() => {
    const abort = new AbortController();
    setCatalogLoading(true);
    setError(null);
    void getRegistrationOptions(abort.signal).then(rows => {
      if (!abort.signal.aborted) setOptions(rows);
    }).catch(reason => {
      if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : 'No se pudieron cargar los campus.');
    }).finally(() => { if (!abort.signal.aborted) setCatalogLoading(false); });
    return () => abort.abort();
  }, [catalogRevision]);

  async function submit() {
    if (busy) return;
    setError(null); setNotice(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!fullName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || !selectedCampus || !password) {
      setError('Completa tu nombre, correo institucional, contraseña y campus.'); return;
    }
    setBusy(true);
    try {
      await registerInstitutionalAccount({ email: normalizedEmail, fullName: fullName.trim(), password, campusId: selectedCampus.campus_id });
      setPassword('');
      setPendingEmail(normalizedEmail);
      setNotice('Si el registro procede, recibirás un código para verificar tu correo. Si ya tienes una cuenta, no necesitas registrarte nuevamente.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo iniciar el registro.'); }
    finally { setBusy(false); }
  }

  async function verify() {
    if (busy || !pendingEmail) return;
    setError(null); setNotice(null);
    if (!/^\d{6,10}$/.test(code.trim())) { setError('Ingresa el código recibido por correo.'); return; }
    setBusy(true);
    try {
      const result = await confirmInstitutionalEmail(pendingEmail, code.trim());
      setCode(''); setConfirmingProfile(true);
      if (result !== 'session_pending') auth.refreshIdentity();
      if (result !== 'complete') setNotice('Tu correo está verificado. Falta completar tu cuenta; puedes reintentar.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo verificar el correo.'); }
    finally { setBusy(false); }
  }

  async function resend() {
    if (busy || !pendingEmail) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await resendInstitutionalConfirmation(pendingEmail);
      setNotice('Si la cuenta necesita verificación, recibirás un nuevo código.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo reenviar el código.'); }
    finally { setBusy(false); }
  }

  async function retryCompletion() {
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await completeInstitutionalRegistration();
      auth.refreshIdentity();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo completar la cuenta.'); }
    finally { setBusy(false); }
  }

  return <SafeAreaView style={styles.page}>
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Link href={'/login' as Href} style={styles.link}>← Volver</Link>
        <Text style={styles.brand}>CampusLink</Text>
        {auth.status === 'ready' ? <>
          <Text style={styles.title}>Cuenta verificada</Text>
          <Text style={styles.description}>Hola, {auth.identity?.profile.nombre_completo}. Tu cuenta institucional está lista.</Text>
          <Text style={styles.description}>Campus: {options.find(option => option.campus_id === auth.identity?.campusId)?.campus_nombre ?? 'Asignado a tu cuenta'}</Text>
          <Link href={'/map' as Href} replace asChild>
            <Pressable accessibilityRole="button" style={styles.button}><Text style={styles.buttonText}>Continuar</Text></Pressable>
          </Link>
        </> : confirmingProfile ? <>
          <Text style={styles.title}>Correo confirmado</Text>
          {auth.status === 'loading' ? <ActivityIndicator color="#74C69D" accessibilityLabel="Cargando cuenta" /> : <>
            <Text style={styles.description}>Falta completar o consultar tu cuenta. Puedes reintentar sin volver a registrarte.</Text>
            <Pressable accessibilityRole="button" disabled={busy} onPress={retryCompletion} style={[styles.button, busy && styles.disabled]}><Text style={styles.buttonText}>Completar cuenta</Text></Pressable>
          </>}
        </> : pendingEmail ? <>
          <Text style={styles.title}>Verifica tu correo</Text>
          <Text style={styles.description}>Ingresa el código enviado a {pendingEmail}. Revisa también el correo no deseado.</Text>
          <Text style={styles.label}>Código de verificación</Text>
          <TextInput accessibilityLabel="Código de verificación" style={styles.input} value={code} onChangeText={setCode}
            keyboardType="number-pad" autoComplete="one-time-code" maxLength={10} editable={!busy} onSubmitEditing={verify} />
          <Pressable accessibilityRole="button" disabled={busy} onPress={verify} style={[styles.button, busy && styles.disabled]}>
            <Text style={styles.buttonText}>Verificar correo</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={resend}><Text style={styles.link}>Reenviar código</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setPendingEmail(null); setCode(''); setNotice(null); setError(null); }}>
            <Text style={styles.link}>Usar otro correo</Text>
          </Pressable>
        </> : <>
          <Text style={styles.title}>Crea tu cuenta</Text>
          <Text style={styles.description}>Usa tu correo institucional y elige tu campus. Deberás verificar el correo para activar tu cuenta.</Text>
          <Text style={styles.label}>Nombre completo</Text>
          <TextInput accessibilityLabel="Nombre completo" style={styles.input} value={fullName} onChangeText={setFullName} autoComplete="name" maxLength={200} editable={!busy} />
          <Text style={styles.label}>Correo institucional</Text>
          <TextInput accessibilityLabel="Correo institucional" style={styles.input} value={email} onChangeText={value => { setEmail(value); setCampusId(''); }}
            keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" maxLength={254} editable={!busy} placeholder="nombre@duocuc.cl" placeholderTextColor="#8198A8" />
          <Text style={styles.label}>Contraseña</Text>
          <TextInput accessibilityLabel="Contraseña" style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" maxLength={4096} editable={!busy} />
          <Text style={styles.label}>Campus {campuses[0] ? `· ${campuses[0].institucion_nombre}` : ''}</Text>
          {catalogLoading ? <ActivityIndicator color="#74C69D" accessibilityLabel="Cargando campus" /> : <>
            {campuses.length === 0 && <Text style={styles.description}>{options.length ? 'Ingresa un correo de una institución admitida para ver sus campus.' : 'No hay campus disponibles para registro.'}</Text>}
            {campuses.map(campus => <Pressable key={campus.campus_id} accessibilityRole="radio" accessibilityState={{ checked: selectedCampus?.campus_id === campus.campus_id }}
              disabled={busy} onPress={() => setCampusId(campus.campus_id)} style={[styles.campus, selectedCampus?.campus_id === campus.campus_id && styles.selected]}>
              <Text style={styles.campusText}>{selectedCampus?.campus_id === campus.campus_id ? '●' : '○'} {campus.campus_nombre}</Text>
            </Pressable>)}
            {!options.length && <Pressable accessibilityRole="button" onPress={() => setCatalogRevision(value => value + 1)}><Text style={styles.link}>Actualizar campus</Text></Pressable>}
          </>}
          <Pressable accessibilityRole="button" disabled={busy || catalogLoading || !selectedCampus} onPress={submit}
            style={[styles.button, (busy || catalogLoading || !selectedCampus) && styles.disabled]}><Text style={styles.buttonText}>Crear cuenta</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy || catalogLoading} onPress={() => {
            const address = email.trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || !campuses.length) {
              setError('Ingresa tu correo institucional para continuar con la verificación.'); return;
            }
            setPassword(''); setPendingEmail(address); setError(null); setNotice(null);
          }}><Text style={styles.link}>Ya tengo un código de verificación</Text></Pressable>
        </>}
        {busy && <ActivityIndicator color="#74C69D" accessibilityLabel="Procesando" />}
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {notice && <Text accessibilityLiveRegion="polite" style={styles.description}>{notice}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#071A2B' },
  container: { padding: 28, gap: 14, width: '100%', maxWidth: 560, alignSelf: 'center' },
  brand: { color: '#74C69D', fontSize: 20, fontWeight: '700', marginTop: 12 },
  title: { color: '#FFFFFF', fontSize: 32, fontWeight: '800', marginTop: 8 },
  description: { color: '#B9CAD6', fontSize: 15, lineHeight: 23 },
  label: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', marginTop: 8 },
  input: { color: '#FFFFFF', borderWidth: 1, borderColor: '#486476', borderRadius: 12, padding: 14, minHeight: 52, fontSize: 16 },
  campus: { padding: 16, borderWidth: 1, borderColor: '#486476', borderRadius: 12 },
  selected: { borderColor: '#74C69D', backgroundColor: '#123742' },
  campusText: { color: '#FFFFFF', fontSize: 16 },
  button: { backgroundColor: '#FFFFFF', padding: 18, borderRadius: 14, alignItems: 'center', marginTop: 12 },
  buttonText: { color: '#09243A', fontSize: 17, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  link: { color: '#74C69D', fontSize: 15, paddingVertical: 8 },
  error: { color: '#FFB4AB', fontSize: 15, lineHeight: 23 },
});
