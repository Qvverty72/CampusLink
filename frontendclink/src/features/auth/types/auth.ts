import type { Session } from '@supabase/supabase-js';

/** Asignación de rol o permiso efectiva dentro de un campus. */
export interface AuthAssignment { id: string; name: string; campusId: string }

/** Respuesta de `/api/v1/auth/me`, obtenida del contexto actual de PostgreSQL. */
export interface AuthIdentity {
  userId: string;
  campusId: string;
  profile: {
    id: string;
    institucion_id: string;
    campus_id: string;
    nombre_completo: string;
    foto_path: string | null;
    verificado_en: string | null;
    estado_cuenta: 'ACTIVA' | 'SUSPENDIDA' | 'DESACTIVADA';
    deleted_at: string | null;
  };
  roles: AuthAssignment[];
  permissions: AuthAssignment[];
  capabilities: {
    general: boolean;
    officialActivities: boolean;
    analytics: boolean;
    reports: boolean;
  };
}

/** Estados que determinan si hay sesión y si la identidad backend está lista. */
export type AuthStatus = 'loading' | 'signedOut' | 'ready' | 'forbidden' | 'error' | 'unconfigured';
/** Estado y acciones de autenticación compartidos por la aplicación. */
export interface AuthContextValue {
  session: Session | null;
  identity: AuthIdentity | null;
  status: AuthStatus;
  error: string | null;
  /** Motivo confirmado por /me; nunca se deduce de metadatos del token. */
  denialCode?: string | null;
  refreshIdentity: () => void;
  signOut: () => Promise<void>;
}
