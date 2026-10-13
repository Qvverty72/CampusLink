import { useState } from 'react';
import { useAuth } from './useAuth';
import { loginAccount } from '../api/sessionApi';

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
    setBusy(true);
    try { await loginAccount(address, password); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo iniciar sesión.'); }
    finally { setPassword(''); setBusy(false); }
  }

  return { auth, email, setEmail, password, setPassword, busy, setBusy, error, submit };
}
