import { createHash } from 'node:crypto';
import { ApiError } from '../../services/api-response.js';
import { createPaginatedResult, parsePaginationQuery } from '../../services/pagination.js';
import type { VerifiedAuthConnection } from '../auth/auth.types.js';
import { withAccessTransaction, type accessRepository } from './access.repository.js';
import type { AccessProfile, AccessSnapshot, AccessUpdate } from './access.types.js';

const ROLE_NAMES = ['ADMINISTRADOR', 'USUARIO_AUTORIZADO'];
const PERMISSION_NAMES = ['PUBLICAR_EVENTO', 'ACCEDER_ANALITICA', 'ACCEDER_REPORTERIA'];
const invalid = (message: string) => new ApiError(400, 'VALIDATION_ERROR', message);
const forbidden = () => new ApiError(403, 'FORBIDDEN', 'Se requiere un administrador con alcance vigente sobre este campus.');
type Repository = ReturnType<typeof accessRepository>;

function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw invalid('Identificador inválido.');
  return value.toLowerCase();
}
function requireActiveActor(rows: AccessProfile[], auth: VerifiedAuthConnection) {
  const actor = rows.find(row => row.id === auth.userId);
  if (!actor || actor.estado_cuenta !== 'ACTIVA' || actor.deleted_at) throw forbidden();
}
async function authorizedCampus(repository: Repository, auth: VerifiedAuthConnection, campusId: string) {
  const assignments = await repository.adminAssignments(auth.userId);
  if (!assignments.some(row => row.campus_id === campusId)) throw forbidden();
  const campus = await repository.lockCampus(campusId);
  if (!campus?.activo) throw forbidden();
  return campus;
}
async function transaction<T>(operation: (repository: Repository) => Promise<T>) {
  try { return await withAccessTransaction(operation); } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo consultar o guardar los accesos. Inténtalo nuevamente.');
  }
}
function version(snapshot: AccessSnapshot) {
  return createHash('sha256').update(JSON.stringify({ roles: snapshot.roles.map(row => row.id).sort(),
    permissions: snapshot.permissions.map(row => row.id).sort() })).digest('hex');
}
function detail(profile: AccessProfile, campusId: string, snapshot: AccessSnapshot) {
  return { userId: profile.id, fullName: profile.nombre_completo, accountState: profile.estado_cuenta,
    campusId, roles: snapshot.roles, permissions: snapshot.permissions, version: version(snapshot) };
}
export function parseAccessUpdate(body: unknown): AccessUpdate {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('Revisa los roles y permisos.');
  const input = body as Record<string, unknown>;
  if (Object.keys(input).length !== 3 || Object.keys(input).some(key => !['roleIds','permissionIds','version'].includes(key))) throw invalid('Solo puedes modificar roles y permisos.');
  const ids = (value: unknown) => {
    if (!Array.isArray(value) || value.length > 100) throw invalid('Selecciona asignaciones válidas.');
    const result = value.map(uuid);
    if (new Set(result).size !== result.length) throw invalid('No repitas asignaciones.');
    return result;
  };
  if (typeof input.version !== 'string' || !/^[0-9a-f]{64}$/.test(input.version)) throw invalid('Recarga los accesos antes de guardar.');
  return { roleIds: ids(input.roleIds), permissionIds: ids(input.permissionIds), version: input.version };
}
export async function getAccessCampuses(auth: VerifiedAuthConnection) {
  return transaction(async repository => {
    requireActiveActor(await repository.lockProfiles([auth.userId]), auth);
    const assignments = await repository.adminAssignments(auth.userId);
    if (!assignments.length) throw forbidden();
    return (await repository.campuses(assignments.map(row => row.campus_id))).filter(row => row.activo)
      .map(row => ({ id: row.id, name: row.nombre }));
  });
}
async function catalog(repository: Repository) {
  const rows = await repository.catalog();
  const roles = rows.roles.filter(row => ROLE_NAMES.includes(row.nombre));
  const permissions = rows.permissions.filter(row => PERMISSION_NAMES.includes(row.nombre));
  if (roles.length !== ROLE_NAMES.length || permissions.length !== PERMISSION_NAMES.length) {
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'El catálogo de accesos no está configurado.');
  }
  return { roles, permissions };
}
export async function getAccessCatalog(auth: VerifiedAuthConnection, rawCampusId: unknown) {
  const campusId = uuid(rawCampusId);
  return transaction(async repository => {
    requireActiveActor(await repository.lockProfiles([auth.userId]), auth);
    await authorizedCampus(repository, auth, campusId);
    return catalog(repository);
  });
}
export async function listAccessUsers(auth: VerifiedAuthConnection, rawCampusId: unknown, query: unknown) {
  const campusId = uuid(rawCampusId);
  const pagination = parsePaginationQuery(query);
  if (!pagination.success) throw invalid('Revisa la página y el tamaño del listado.');
  return transaction(async repository => {
    requireActiveActor(await repository.lockProfiles([auth.userId]), auth);
    await authorizedCampus(repository, auth, campusId);
    const users = await repository.users(campusId, pagination.data.limit + 1, pagination.data.offset);
    return createPaginatedResult(users.map(row => ({ userId: row.id, fullName: row.nombre_completo, accountState: row.estado_cuenta, campusId })), pagination.data);
  });
}
async function target(repository: Repository, auth: VerifiedAuthConnection, campusId: string, userId: string) {
  const profiles = await repository.lockProfiles([...new Set([auth.userId, userId])]);
  requireActiveActor(profiles, auth);
  const campus = await authorizedCampus(repository, auth, campusId);
  const profile = profiles.find(row => row.id === userId);
  if (!profile || profile.deleted_at || profile.campus_id !== campusId || profile.institucion_id !== campus.institucion_id) {
    throw new ApiError(404, 'NOT_FOUND', 'El usuario no está disponible en este campus.');
  }
  return { campus, profile };
}
export async function getUserAccess(auth: VerifiedAuthConnection, rawCampusId: unknown, rawUserId: unknown) {
  const campusId = uuid(rawCampusId), userId = uuid(rawUserId);
  return transaction(async repository => {
    const { profile } = await target(repository, auth, campusId, userId);
    return detail(profile, campusId, await repository.snapshot(userId, campusId));
  });
}
export async function updateUserAccess(auth: VerifiedAuthConnection, rawCampusId: unknown, rawUserId: unknown, body: unknown) {
  const campusId = uuid(rawCampusId), userId = uuid(rawUserId), input = parseAccessUpdate(body);
  return transaction(async repository => {
    const { campus, profile } = await target(repository, auth, campusId, userId);
    const available = await catalog(repository);
    const before = await repository.snapshot(userId, campusId);
    if (version(before) !== input.version) throw new ApiError(409, 'CONFLICT', 'Los accesos cambiaron. Recárgalos antes de guardar.');
    const changes: { action: string; assignmentId: string; catalogId: string }[] = [];
    for (const [kind, selected, choices] of [['roles', input.roleIds, available.roles], ['permissions', input.permissionIds, available.permissions]] as const) {
      const current = before[kind];
      // Existing out-of-catalog grants may be preserved or revoked; no new unknown privilege can be granted.
      if (selected.some(id => !choices.some(row => row.id === id) && !current.some(row => row.catalog_id === id))) throw invalid('El rol o permiso no pertenece al catálogo disponible.');
      for (const row of current.filter(row => !selected.includes(row.catalog_id))) {
        await repository.revoke(kind, row.id);
        changes.push({ action: kind === 'roles' ? 'REVOCAR_ROL' : 'REVOCAR_PERMISO', assignmentId: row.id, catalogId: row.catalog_id });
      }
      for (const id of selected.filter(id => !current.some(row => row.catalog_id === id))) {
        const assignmentId = await repository.grant(kind, userId, id, campusId, auth.userId);
        changes.push({ action: kind === 'roles' ? 'ASIGNAR_ROL' : 'ASIGNAR_PERMISO', assignmentId, catalogId: id });
      }
    }
    const after = await repository.snapshot(userId, campusId);
    for (const change of changes) await repository.audit(auth.userId, campus, userId, change.action, before, after, change);
    return detail(profile, campusId, after);
  });
}
