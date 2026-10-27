import { useState } from 'react';
import { Keyboard } from 'react-native';
import { useAuth } from './useAuth';
import { loginAccount } from '../api/sessionApi';

/** Mantiene el formulario de acceso, valida campos y descarta la contraseña tras enviar. */
export function useLogin() {
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
    Keyboard.dismiss();
    setBusy(true);
    try { await loginAccount(address, password); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo iniciar sesión.'); }
    finally { setPassword(''); setBusy(false); }
  }

  return { auth, email, setEmail, password, setPassword, busy, setBusy, error, submit };
}
