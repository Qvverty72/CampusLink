import type { ModuleHealth } from '../../types/api.types.js';
export type AuthHealth = ModuleHealth<'auth'>;
export interface AuthProfile {
  id: string;
  campus_id: string;
  institucion_id: string;
  nombre_completo: string;
  foto_path: string | null;
  verificado_en: string | null;
  estado_cuenta: 'ACTIVA' | 'SUSPENDIDA' | 'DESACTIVADA';
  deleted_at: string | null;
}
export interface AuthAssignmentRow {
  campus_id: string;
  rol?: { id: string; nombre: string } | null;
  permiso?: { id: string; nombre: string } | null;
}
export interface AuthAssignment { id: string; name: string; campusId: string }
export interface VerifiedAuthConnection {
  userId: string;
  campusId: string;
  profile: AuthProfile;
  roles: AuthAssignment[];
  permissions: AuthAssignment[];
}
export interface AuthLocals { auth: VerifiedAuthConnection }
