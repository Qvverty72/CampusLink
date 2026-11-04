import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { loadAcademicProfile } from '../api/profileApi';
import type { AcademicProfile } from '../types/profile';

// Conserva solo el último ámbito durante la sesión, también al reemplazar la ruta.
let cachedAcademic: { scope: string; profile: AcademicProfile } | null = null;

/** Deriva etiquetas visibles de perfil y protege el cierre de sesión contra dobles envíos. */
export function useProfile() {
  const auth = useAuth();
  const [closing, setClosing] = useState(false);
  const identity = auth.identity;
  const academicScope = identity?.capabilities.general ? JSON.stringify([identity.userId, identity.campusId, auth.session?.user.last_sign_in_at]) : null;
  const [academicRevision, setAcademicRevision] = useState(0);
  const [academicState, setAcademicState] = useState<{
    scope: string | null; profile: AcademicProfile | null; error: string | null; loading: boolean;
  }>({ scope: null, profile: null, error: null, loading: false });

  useEffect(() => {
    if (!academicScope) {
      cachedAcademic = null;
      setAcademicState({ scope: null, profile: null, error: null, loading: false });
      return;
    }
    if (cachedAcademic?.scope === academicScope) {
      setAcademicState({ ...cachedAcademic, error: null, loading: false });
      return;
    }
    cachedAcademic = null;
    const abort = new AbortController();
    setAcademicState(previous => ({ scope: academicScope, profile: previous.scope === academicScope ? previous.profile : null, error: null, loading: true }));
    void loadAcademicProfile(abort.signal).then(profile => {
      if (!abort.signal.aborted) {
        cachedAcademic = { scope: academicScope, profile };
        setAcademicState({ ...cachedAcademic, error: null, loading: false });
      }
    }).catch(() => {
      if (!abort.signal.aborted) setAcademicState(previous => ({ scope: academicScope, profile: previous.scope === academicScope ? previous.profile : null,
        error: 'No se pudo cargar el perfil académico.', loading: false }));
    });
    return () => abort.abort();
  }, [academicScope, academicRevision]);

  // No presentar datos de una identidad anterior mientras se ejecuta el nuevo efecto.
  // Renovar la identidad del mismo usuario/campus no invalida el encabezado.
  const currentAcademic = academicScope && academicState.scope === academicScope ? academicState
    : academicScope && cachedAcademic?.scope === academicScope ? { ...cachedAcademic, error: null, loading: false } : null;
  const academicProfile = currentAcademic?.profile ?? null;
  const academicError = currentAcademic?.error ?? null;
  const academicLoading = Boolean(identity?.capabilities.general && (!currentAcademic || currentAcademic.loading));
  const reloadAcademicProfile = useCallback(() => {
    cachedAcademic = null;
    setAcademicRevision(value => value + 1);
  }, []);
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
