import { useState } from 'react';
import { Text } from 'react-native';
import { AuthLayout } from '@/components/AuthLayout';
import { Button, Field, go, ui, useToast } from '@/components/ui';

const modes = { login: 'Iniciar sesión', register: 'Crear cuenta', recovery: 'Recuperar contraseña', verification: 'Verificar correo' };
export function AuthScreen({ mode }: { mode: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const toast = useToast();
  if (!Object.prototype.hasOwnProperty.call(modes, mode)) return <AuthLayout title="Acceso no encontrado"><Button label="Ir a Login" onPress={() => go('/auth/login')} /></AuthLayout>;
  const submit = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Escribe un correo de ejemplo válido.'); return; }
    if (mode === 'register' && !name.trim()) { setError('Escribe un nombre de ejemplo.'); return; }
    if (mode !== 'recovery' && password.length < 6) { setError('Usa una contraseña ficticia de al menos 6 caracteres.'); return; }
    setError(''); setPassword('');
    if (mode === 'login') { toast('Sesión de demostración iniciada'); go('/'); }
    else { toast(mode === 'recovery' ? 'Enlace de recuperación simulado' : 'Registro simulado'); go('/auth/verification'); }
  };
  return <AuthLayout title={modes[mode as keyof typeof modes]}>
    {mode === 'verification' ? <>
      <Text style={ui.body}>Revisa tu correo</Text><Text style={ui.muted}>Aquí aparecería el enlace de verificación o recuperación. En esta maqueta no se envía ningún correo.</Text>
      <Button label="Simular verificación" onPress={() => { toast('Correo verificado · simulación'); go('/auth/login'); }} />
      <Button secondary label="Reenviar correo de ejemplo" onPress={() => toast('Reenvío simulado')} />
    </> : <>
      {mode === 'register' && <Field label="Nombre" value={name} onChangeText={setName} placeholder="Alex Muñoz" autoComplete="off" />}
      <Field label="Correo" value={email} onChangeText={setEmail} placeholder="alex@ejemplo.cl" keyboardType="email-address" autoCapitalize="none" autoComplete="off" />
      {mode !== 'recovery' && <Field label="Contraseña ficticia" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="off" />}
      {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
      <Button label={mode === 'recovery' ? 'Enviar enlace simulado' : modes[mode as keyof typeof modes]} onPress={submit} />
    </>}
    {mode !== 'login' && <Button secondary label="Volver a Login" onPress={() => go('/auth/login')} />}
    {mode === 'login' && <><Button secondary label="Crear cuenta" onPress={() => go('/auth/register')} /><Button secondary label="Olvidé mi contraseña" onPress={() => go('/auth/recovery')} /><Button secondary label="Verificación de correo" onPress={() => go('/auth/verification')} /></>}
    <Button secondary label="Explorar sin cuenta" onPress={() => go('/')} />
  </AuthLayout>;
}
