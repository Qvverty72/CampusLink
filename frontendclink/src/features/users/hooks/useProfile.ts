import { useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';

/** Deriva etiquetas visibles de perfil y protege el cierre de sesión contra dobles envíos. */
export function useProfile() {
  const auth = useAuth();
  const [closing, setClosing] = useState(false);
  const identity = auth.identity;
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
  return { auth, closing, identity, roleLabel, functions, signOut };
}
