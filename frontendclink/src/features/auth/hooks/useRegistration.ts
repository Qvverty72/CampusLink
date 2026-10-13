import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { completeInstitutionalRegistration, confirmInstitutionalEmail, getRegistrationOptions, registerInstitutionalAccount, resendInstitutionalConfirmation } from '../api/registrationApi';
import type { RegistrationOption } from '../types/registration';

export function useRegistration() {
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

  return { auth, options, catalogLoading, setCatalogRevision, email, setEmail, fullName, setFullName,
    password, setPassword, setCampusId, pendingEmail, setPendingEmail, code, setCode, busy,
    confirmingProfile, error, setError, notice, setNotice, campuses, selectedCampus,
    submit, verify, resend, retryCompletion };
}
