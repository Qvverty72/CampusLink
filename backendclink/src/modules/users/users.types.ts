import type { ModuleHealth } from '../../types/api.types.js';
import type { AuthProfile } from '../auth/auth.types.js';

export type UsersHealth = ModuleHealth<'users'>;

export interface AcademicOption { id: string; nombre: string; institucion_id: string; activo: boolean }
export interface AcademicProfileRow {
  id: string; institucion_id: string; campus_id: string; nombre_completo: string;
  updated_at: string; estado_cuenta: string; deleted_at: string | null;
  campus: { id: string; nombre: string } | null;
  usuario_carrera: { carrera: { id: string; nombre: string } | null }[];
}
export interface ProfileUpdate { fullName: string; campusId: string; careerIds: string[]; updatedAt: string }

export interface LockedAcademicProfile extends Pick<AuthProfile,
  'id' | 'institucion_id' | 'campus_id' | 'estado_cuenta' | 'deleted_at' | 'verificado_en'> {
  version_matches: boolean;
}
export interface AcademicProfileTransaction {
  lockProfile: (userId: string, updatedAt: string) => Promise<LockedAcademicProfile | null>;
  lockCampus: (campusId: string) => Promise<AcademicOption | null>;
  lockCareers: (campusId: string, careerIds: string[]) => Promise<{ careers: AcademicOption[]; offeredCareerIds: string[] }>;
  save: (userId: string, input: ProfileUpdate) => Promise<string>;
}
