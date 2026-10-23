import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { loadAcademicProfile } from '../api/profileApi';
import type { AcademicProfile } from '../types/profile';

/** Deriva etiquetas visibles de perfil y protege el cierre de sesión contra dobles envíos. */
export function useProfile() {
  const auth = useAuth();
  const [closing, setClosing] = useState(false);
  const identity = auth.identity;
  const [academicRevision, setAcademicRevision] = useState(0);
  const [academicState, setAcademicState] = useState<{
    identity: typeof identity; profile: AcademicProfile | null; error: string | null; loading: boolean;
  }>({ identity: null, profile: null, error: null, loading: false });

  useEffect(() => {
    if (!identity?.capabilities.general) return;
    const abort = new AbortController();
    setAcademicState(previous => ({ identity, profile: previous.identity === identity ? previous.profile : null, error: null, loading: true }));
    void loadAcademicProfile(abort.signal).then(profile => {
      if (!abort.signal.aborted) setAcademicState({ identity, profile, error: null, loading: false });
    }).catch(() => {
      if (!abort.signal.aborted) setAcademicState(previous => ({ identity, profile: previous.identity === identity ? previous.profile : null,
        error: 'No se pudo cargar el perfil académico.', loading: false }));
    });
    return () => abort.abort();
  }, [identity, academicRevision]);

  // No presentar datos de una identidad anterior mientras se ejecuta el nuevo efecto.
  const currentAcademic = identity?.capabilities.general && academicState.identity === identity ? academicState : null;
  const academicProfile = currentAcademic?.profile ?? null;
  const academicError = currentAcademic?.error ?? null;
  const academicLoading = Boolean(identity?.capabilities.general && (!currentAcademic || currentAcademic.loading));
  const reloadAcademicProfile = useCallback(() => setAcademicRevision(value => value + 1), []);
  const localRoles = identity?.roles.filter(role => role.campusId === identity.campusId) ?? [];
  const roleLabel = localRoles.some(role => role.name === 'ADMINISTRADOR') ? 'Administrador'
    : localRoles.some(role => role.name === 'USUARIO_AUTORIZADO') ? 'Usuario autorizado'
    : identity?.profile.verificado_en ? 'Usuario institucional verificado' : 'Cuenta';
  const functions = identity ? [identity.capabilities.general && 'Funciones generales',
    identity.capabilities.officialActivities && 'Actividades oficiales', identity.capabilities.analytics && 'Analítica',
    identity.capabilities.reports && 'Reportería'].filter(Boolean).join(' · ') : '';
  const signOut = async () => {
    if (closing) return; setClosing(true); await auth.signOut(); setClosing(false);
  };
  return { auth, closing, identity, roleLabel, functions, signOut,
    academicProfile, academicLoading, academicError, reloadAcademicProfile };
}
