import type { ModuleHealth } from '../../types/api.types.js';
export type AuthHealth = ModuleHealth<'auth'>;
export interface AuthProfile {
  id: string;
  campus_id: string;
  estado_cuenta: 'ACTIVA' | 'SUSPENDIDA' | 'DESACTIVADA';
  deleted_at: string | null;
}
export interface VerifiedAuthConnection { userId: string; campusId: string }
