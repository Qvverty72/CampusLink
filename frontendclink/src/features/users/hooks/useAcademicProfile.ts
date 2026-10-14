import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { loadAcademicOptions, loadAcademicProfile, saveAcademicProfile } from '../api/profileApi';
import type { AcademicOptions, AcademicProfile } from '../types/profile';

/** Carga perfil y catálogo, valida selecciones y guarda con detección de conflicto. */
export function useAcademicProfile() {
  const auth = useAuth();
  const [profile, setProfile] = useState<AcademicProfile | null>(null);
  const [options, setOptions] = useState<AcademicOptions | null>(null);
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [campusId, setCampusId] = useState('');
  const [careerIds, setCareerIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [revision, setRevision] = useState(0);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController(); pending.current = abort;
    setBusy(true); setProfile(null); setOptions(null); setError(null); setConflict(false); setEditing(false);
    void Promise.all([loadAcademicProfile(abort.signal), loadAcademicOptions(abort.signal)])
      .then(([next, catalogue]) => {
        if (abort.signal.aborted) return;
        setProfile(next); setOptions(catalogue); setFullName(next.fullName);
        setCampusId(next.campusId); setCareerIds(next.careers.map(row => row.id));
      }).catch(reason => {
        if (!abort.signal.aborted) setError(reason instanceof AuthApiError ? reason.message : 'No se pudo cargar el perfil académico.');
      }).finally(() => { if (!abort.signal.aborted) setBusy(false); });
    return () => abort.abort();
  }, [revision]);
  useEffect(() => () => pending.current?.abort(), []);
  async function save() {
    if (busy || !profile || conflict) return;
    if (!fullName.trim() || fullName.trim().length > 200 || /[\u0000-\u001f\u007f]/.test(fullName)) {
      setError('Ingresa un nombre completo válido (máximo 200 caracteres).'); return;
    }
    const abort = new AbortController(); pending.current = abort;
    setBusy(true); setError(null);
    try {
      await saveAcademicProfile({ fullName, campusId, careerIds, updatedAt: profile.updatedAt }, abort.signal);
      if (!abort.signal.aborted) auth.refreshIdentity();
    } catch (reason) {
      if (abort.signal.aborted) return;
      if (reason instanceof AuthApiError && reason.status === 409) {
        setConflict(true); setError('El perfil cambió en otra operación. Recárgalo antes de guardar.');
      } else if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) {
        auth.refreshIdentity();
      } else setError(reason instanceof Error ? reason.message : 'No se pudo guardar. Inténtalo nuevamente.');
    } finally { if (!abort.signal.aborted) setBusy(false); }
  }
  const offered = options?.careers.filter(row => row.campusIds.includes(campusId)) ?? [];
  const selectionsValid = Boolean(options?.campuses.some(row => row.id === campusId))
    && careerIds.every(id => offered.some(row => row.id === id));
  return { profile, options, editing, setEditing, fullName, setFullName, campusId, setCampusId,
    careerIds, setCareerIds, busy, error, setError, conflict, setRevision, save, offered, selectionsValid };
}
