import { useState } from 'react';
import { requestRecovery, resetPassword } from '../api/sessionApi';

/** Coordina solicitud del código y confirmación de cambio de contraseña. */
export function useRecovery() {
  const [email, setEmail] = useState('');
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function request() {
    if (busy) return;
    const address = pendingEmail ?? email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) { setError('Ingresa un correo válido.'); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      await requestRecovery(address);
      setPendingEmail(address); setCode('');
      setNotice('Si existe una cuenta asociada a ese correo y el envío está disponible, recibirás un código de recuperación. Revisa también el correo no deseado.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo solicitar la recuperación.'); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (busy || !pendingEmail) return;
    setError(null); setNotice(null);
    if (!/^\d{6,10}$/.test(code.trim()) || !password || password !== confirmation) {
      setError('Ingresa el código y una nueva contraseña; ambas contraseñas deben coincidir.'); return;
    }
    setBusy(true);
    try {
      await resetPassword(pendingEmail, code.trim(), password);
      setDone(true); setCode(''); setPassword(''); setConfirmation('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo cambiar la contraseña. Solicita un código nuevo.');
    } finally { setBusy(false); }
  }

  return { email, setEmail, pendingEmail, setPendingEmail, code, setCode, password, setPassword,
    confirmation, setConfirmation, busy, done, error, setError, notice, setNotice, request, confirm };
}
