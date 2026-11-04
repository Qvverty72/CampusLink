import { useState } from 'react';
import { Link } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Check, ChevronDown, Circle, CircleCheck, KeyRound, LockKeyhole, Mail, MapPin, ShieldCheck, UserRound } from 'lucide-react-native';

import { useRegistration } from '../hooks/useRegistration';
import { AUTH_COLORS, authStyles as styles } from './form.styles';
import { AuthButton, AuthHeading, AuthInput, AuthMessage, AuthScaffold, ResendCodeButton } from './AuthUI';

/** Registro institucional, campus del catálogo y verificación de correo con un mismo lenguaje visual. */
export function RegisterScreen() {
  const { auth, options, catalogLoading, setCatalogRevision, email, setEmail, fullName, setFullName,
    password, setPassword, setCampusId, pendingEmail, setPendingEmail, code, setCode, busy,
    confirmingProfile, error, setError, campuses, selectedCampus,
    submit, verify, resend, retryCompletion, resendSeconds } = useRegistration();
  const [campusOpen, setCampusOpen] = useState(false);
  return <AuthScaffold back stepKey={auth.status === 'ready' ? 'ready' : confirmingProfile ? 'profile' : pendingEmail ? 'code' : 'register'}>
    {auth.status === 'ready' ? <>
      <AuthHeading icon={CircleCheck} title="Cuenta verificada" description={<>Hola, {auth.identity?.profile.nombre_completo}. Tu cuenta institucional está lista.</>} />
      <AuthMessage>Campus: {options.find(option => option.campus_id === auth.identity?.campusId)?.campus_nombre ?? 'Asignado a tu cuenta'}</AuthMessage>
      <Link href="/map" replace asChild><Pressable accessibilityRole="link" style={styles.button}><Text style={styles.buttonText}>Continuar</Text></Pressable></Link>
    </> : confirmingProfile ? <>
      <AuthHeading icon={ShieldCheck} title="Correo confirmado" description="Tu correo ya está verificado. Falta completar o consultar tu cuenta; puedes reintentar sin registrarte de nuevo." />
      {auth.status === 'loading' ? <ActivityIndicator color={AUTH_COLORS.PRIMARY} accessibilityLabel="Cargando cuenta" />
        : <AuthButton busy={busy} onPress={retryCompletion}>Completar cuenta</AuthButton>}
    </> : pendingEmail ? <>
      <AuthHeading title="Verifica tu correo" description={<>Ingresa el código enviado a <Text style={styles.email}>{pendingEmail}</Text> para activar tu cuenta institucional.</>} />
      <View style={styles.form}>
        <AuthInput label="Código de verificación" icon={KeyRound} code value={code} onChangeText={setCode} placeholder="000000"
          keyboardType="number-pad" autoComplete="one-time-code" maxLength={10} editable={!busy} onSubmitEditing={verify} returnKeyType="go" />
        <AuthButton busy={busy} onPress={verify}>Verificar correo</AuthButton>
      </View>
      <Text style={styles.description}>¿No ves el correo? Revisa también la carpeta de correo no deseado.</Text>
      <View style={styles.divider} />
      <View style={styles.actions}>
        <ResendCodeButton seconds={resendSeconds} busy={busy} onPress={resend} />
        <Pressable accessibilityRole="button" disabled={busy} style={[styles.linkButton, busy && styles.disabled]} onPress={() => {
          setPendingEmail(null); setCode(''); setPassword(''); setCampusOpen(false); setError(null);
        }}><Text style={styles.link}>Usar otro correo</Text></Pressable>
      </View>
    </> : <>
      <AuthHeading title="Crea tu cuenta" description="Sé parte de tu comunidad. Usa tu correo institucional para comenzar." />
      <View style={styles.form}>
        <AuthInput label="Nombre completo" icon={UserRound} value={fullName} onChangeText={setFullName} placeholder="Tu nombre y apellido"
          autoCapitalize="words" autoComplete="name" maxLength={200} editable={!busy} />
        <AuthInput label="Correo institucional" icon={Mail} value={email} onChangeText={value => { setEmail(value); setCampusId(''); setCampusOpen(false); }}
          keyboardType="email-address" autoComplete="email" maxLength={254} editable={!busy} placeholder="nombre@duocuc.cl" />
        <AuthInput label="Contraseña" icon={LockKeyhole} password value={password} onChangeText={setPassword}
          placeholder="Crea tu contraseña" autoComplete="new-password" maxLength={4096} editable={!busy} />
        {catalogLoading ? null : campuses.length > 0 ? <View style={styles.field}>
          <Text style={styles.label}>Campus</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Campus: ${selectedCampus?.campus_nombre ?? 'Selecciona tu campus'}`}
            accessibilityState={{ expanded: campusOpen, disabled: busy }} disabled={busy} onPress={() => setCampusOpen(open => !open)} style={styles.campusTrigger}>
            <MapPin size={18} color={AUTH_COLORS.SECONDARY} />
            <Text style={styles.campusValue}>{selectedCampus?.campus_nombre ?? 'Selecciona tu campus'}</Text>
            <ChevronDown size={18} color={AUTH_COLORS.SECONDARY} />
          </Pressable>
          <Text style={styles.description}>{campuses[0].institucion_nombre}</Text>
          {campusOpen && <View accessibilityRole="radiogroup" accessibilityLabel="Campus disponibles" style={styles.campusList}>
            {campuses.map(campus => {
              const selected = selectedCampus?.campus_id === campus.campus_id;
              return <Pressable key={campus.campus_id} accessibilityRole="radio" accessibilityLabel={campus.campus_nombre}
                accessibilityState={{ checked: selected, disabled: busy }} disabled={busy}
                onPress={() => { setCampusId(campus.campus_id); setCampusOpen(false); }} style={[styles.campus, selected && styles.selectedCampus]}>
                {selected ? <CircleCheck size={18} color={AUTH_COLORS.PRIMARY} /> : <Circle size={18} color={AUTH_COLORS.muted} />}
                <Text style={styles.campusText}>{campus.campus_nombre}</Text>{selected && <Check size={17} color={AUTH_COLORS.PRIMARY} />}
              </Pressable>;
            })}
          </View>}
        </View> : !options.length ? <Text style={styles.description}>No hay campus disponibles para registro.</Text> : null}
        {!catalogLoading && !options.length && <Pressable accessibilityRole="button" disabled={busy} style={styles.linkButton}
          onPress={() => setCatalogRevision(value => value + 1)}><Text style={styles.link}>Actualizar campus</Text></Pressable>}
        <AuthButton busy={busy} disabled={catalogLoading || !fullName.trim() || !password || !selectedCampus || resendSeconds > 0} onPress={submit}>
          {resendSeconds > 0 ? `Crear cuenta en ${resendSeconds} s` : 'Crear cuenta'}
        </AuthButton>
      </View>
    </>}
    <AuthMessage error>{error}</AuthMessage>
  </AuthScaffold>;
}
