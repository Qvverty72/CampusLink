export interface AuthAssignment { id: string; name: string; campusId: string }

// GET /api/v1/auth/me: PostgreSQL data, never claims supplied in user_metadata.
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
}
