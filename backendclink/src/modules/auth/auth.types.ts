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
export interface VerifiedIdentity {
  userId: string;
  email: string;
  emailConfirmedAt: string;
  registration: { fullName: unknown; campusId: unknown };
}
export interface IdentityLocals { identity: VerifiedIdentity }
export interface RegistrationInput {
  email: string;
  password: string;
  fullName: string;
  campusId: string;
}

export interface RegistrationOption {
  dominio: string;
  institucion_id: string;
  institucion_nombre: string;
  campus_id: string;
  campus_nombre: string;
}
export interface RegistrationDomainRow {
  dominio: string;
  institucion_id: string;
  activo: boolean;
  institucion: { nombre: string } | null;
}
export interface RegistrationCampusRow {
  id: string;
  institucion_id: string;
  nombre: string;
  activo: boolean;
}
export type NewAuthProfile = Pick<AuthProfile,
  'id' | 'institucion_id' | 'campus_id' | 'nombre_completo' | 'verificado_en' | 'estado_cuenta'>;
