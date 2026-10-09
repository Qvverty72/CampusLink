import { createModuleHealthCheck } from '../../services/module-health.js';
import { probeUsersDependencies } from './users.repository.js';
import type { UsersHealth } from './users.types.js';
import type { VerifiedAuthConnection } from '../auth/auth.types.js';
import type { ProfileUpdate } from './users.types.js';
import { accountCapabilities } from '../auth/auth.service.js';
import { ApiError } from '../../services/api-response.js';
import { findAcademicProfile, findAcademicOptions, withAcademicProfileTransaction } from './users.repository.js';

const unavailable = () => new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'El perfil académico no está disponible. Inténtalo nuevamente.');
const invalid = (message: string) => new ApiError(400, 'VALIDATION_ERROR', message);
function authorize(auth: VerifiedAuthConnection) {
  if (!accountCapabilities(auth).general) throw new ApiError(403, 'FORBIDDEN', 'Se requiere acceso institucional.');
}
async function dependency<T>(operation: () => PromiseLike<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    if (error instanceof ApiError) throw error;
    throw unavailable();
  }
}

export async function getAcademicProfile(auth: VerifiedAuthConnection) {
  authorize(auth);
  const result = await dependency(() => findAcademicProfile(auth.userId));
  if (result.error) throw unavailable();
  const row = result.data;
  if (!row || row.estado_cuenta !== 'ACTIVA' || row.deleted_at || row.institucion_id !== auth.profile.institucion_id) {
    throw new ApiError(403, 'FORBIDDEN', 'La cuenta no está disponible.');
  }
  return { fullName: row.nombre_completo, campusId: row.campus_id, campusName: row.campus?.nombre ?? '',
    careers: row.usuario_carrera.flatMap(link => link.carrera ? [link.carrera] : []), updatedAt: row.updated_at };
}

export async function getAcademicOptions(auth: VerifiedAuthConnection) {
  authorize(auth);
  const result = await dependency(() => findAcademicOptions(auth.profile.institucion_id));
  if (result.campuses.error || result.careers.error || result.offerings.error) throw unavailable();
  const campuses = (result.campuses.data ?? []).filter(row => row.activo && row.institucion_id === auth.profile.institucion_id);
  const careers = (result.careers.data ?? []).filter(row => row.activo && row.institucion_id === auth.profile.institucion_id);
  return { campuses: campuses.map(row => ({ id: row.id, name: row.nombre })),
    careers: careers.map(row => ({ id: row.id, name: row.nombre, campusIds: (result.offerings.data ?? [])
      .filter(link => link.carrera_id === row.id && campuses.some(campus => campus.id === link.campus_id)).map(link => link.campus_id) })) };
}

export function parseProfileUpdate(body: unknown): ProfileUpdate {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('Revisa los datos del perfil.');
  const values = body as Record<string, unknown>;
  if (Object.keys(values).some(key => !['fullName', 'campusId', 'careerIds', 'updatedAt'].includes(key))) throw invalid('Solo puedes modificar nombre, campus y carreras.');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof values.fullName !== 'string' || !values.fullName.trim() || values.fullName.trim().length > 200 || /[\u0000-\u001f\u007f]/.test(values.fullName)) throw invalid('Ingresa un nombre completo válido (máximo 200 caracteres).');
  if (typeof values.campusId !== 'string' || !uuid.test(values.campusId)) throw invalid('Selecciona un campus válido.');
  if (!Array.isArray(values.careerIds) || values.careerIds.some(id => typeof id !== 'string' || !uuid.test(id))) throw invalid('Selecciona carreras válidas.');
  const careerIds = (values.careerIds as string[]).map(id => id.toLowerCase());
  if (new Set(careerIds).size !== careerIds.length) throw invalid('No repitas carreras.');
  if (typeof values.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(values.updatedAt) || !Number.isFinite(Date.parse(values.updatedAt))) throw invalid('Recarga el perfil antes de guardar.');
  if (new Date(values.updatedAt.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) !== values.updatedAt.slice(0, 10)) throw invalid('Recarga el perfil antes de guardar.');
  return { fullName: values.fullName.trim(), campusId: values.campusId.toLowerCase(), careerIds, updatedAt: values.updatedAt };
}

export async function updateAcademicProfile(auth: VerifiedAuthConnection, body: unknown) {
  authorize(auth);
  const input = parseProfileUpdate(body);
  return dependency(() => withAcademicProfileTransaction(async repository => {
    const profile = await repository.lockProfile(auth.userId, input.updatedAt);
    if (!profile || profile.estado_cuenta !== 'ACTIVA' || profile.deleted_at || profile.institucion_id !== auth.profile.institucion_id) {
      throw new ApiError(403, 'FORBIDDEN', 'La cuenta no está disponible.');
    }
    authorize({ ...auth, campusId: profile.campus_id, profile: { ...auth.profile, ...profile } });
    if (!profile.version_matches) throw new ApiError(409, 'CONFLICT', 'El perfil cambió. Recárgalo antes de guardar.');
    const campus = await repository.lockCampus(input.campusId);
    if (!campus?.activo || campus.institucion_id !== profile.institucion_id) throw invalid('El campus debe estar activo y pertenecer a tu institución.');
    const { careers, offeredCareerIds } = await repository.lockCareers(input.campusId, input.careerIds);
    if (input.careerIds.some(id => !careers.some(row => row.id === id && row.activo && row.institucion_id === profile.institucion_id)
      || !offeredCareerIds.includes(id))) throw invalid('Las carreras deben estar ofrecidas en el campus seleccionado.');
    const updatedAt = await repository.save(auth.userId, input);
    return { ...input, updatedAt };
  }));
}

export const getUsersHealth: () => Promise<UsersHealth> =
  createModuleHealthCheck('users', probeUsersDependencies);
