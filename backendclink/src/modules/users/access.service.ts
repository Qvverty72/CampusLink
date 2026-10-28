import { createHash } from 'node:crypto';
import { ApiError } from '../../services/api-response.js';
import { createPaginatedResult, parsePaginationQuery } from '../../services/pagination.js';
import type { VerifiedAuthConnection } from '../auth/auth.types.js';
import { withAccessTransaction, type accessRepository } from './access.repository.js';
import type { AccessProfile, AccessSnapshot, AccessUpdate, AccountStateUpdate, AccessCampus, AuditDetail, AuditEntry } from './access.types.js';
import { requireActiveAccount, requireCampusCapability } from '../auth/auth.authorization.js';
import { auditSnapshot } from './audit.snapshot.js';
import { auditReferenceRequests, auditReferences } from './audit.references.js';
import { auditActor } from './audit.actor.js';
import { AUDIT_ACTIONS, ACTIVITY_AUDIT_ACTIONS } from './access.types.js';
import { activityAuditRepository, activityAuditDetail, activityEditHistory, parseActivityAuditId } from './audit.activities.repository.js';
import { auditTimeline } from './audit.timeline.js';
import { auditLocationReferences } from './audit.location.references.js';
import { auditContainsImage, auditImageStorage, isAuditImageFile } from './audit.images.js';
import { ACCESS_AUDIT_ACTIONS, auditAccessGroup, presentAuditAccessGroup } from './audit.access-groups.js';
import { isAuditEdit, presentAuditEditGroup } from './audit.edit-groups.js';

const ROLE_NAMES = ['ADMINISTRADOR', 'USUARIO_AUTORIZADO'];
const PERMISSION_NAMES = ['PUBLICAR_EVENTO', 'ACCEDER_ANALITICA', 'ACCEDER_REPORTERIA'];
const invalid = (message: string) => new ApiError(400, 'VALIDATION_ERROR', message);
const forbidden = () => new ApiError(403, 'FORBIDDEN', 'Se requiere un administrador con alcance vigente sobre este campus.');
type Repository = ReturnType<typeof accessRepository>;
async function auditEntryActors(repository: Repository, campus: AccessCampus, entries: AuditEntry[]) {
  const actors = new Map((await repository.auditActors(campus,entries)).map(row=>[row.audit_id,row]));
  return entries.map(entry=>({...entry,actor:auditActor(actors.get(entry.id))}));
}

function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw invalid('Identificador inválido.');
  return value.toLowerCase();
}
function requireActiveActor(rows: AccessProfile[], auth: VerifiedAuthConnection) {
  const actor = rows.find(row => row.id === auth.userId);
  if (!actor) throw forbidden();
  requireActiveAccount(actor, auth.userId);
}
async function authorizedCampus(repository: Repository, auth: VerifiedAuthConnection, campusId: string) {
  const assignments = await repository.adminAssignments(auth.userId);
  requireCampusCapability({ ...auth, roles: assignments }, campusId, 'administration');
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
function version(profile: AccessProfile, snapshot: AccessSnapshot) {
  // El hash incluye estado y asignaciones activas; el cliente no decide qué datos versiona.
  return createHash('sha256').update(JSON.stringify({ userId: profile.id, campusId: profile.campus_id,
    accountState: profile.estado_cuenta, updatedAt: profile.updated_at, roles: snapshot.roles.map(row => row.id).sort(),
    permissions: snapshot.permissions.map(row => row.id).sort() })).digest('hex');
}
function detail(profile: AccessProfile, campusId: string, snapshot: AccessSnapshot) {
  return { userId: profile.id, fullName: profile.nombre_completo, accountState: profile.estado_cuenta,
    campusId, roles: snapshot.roles, permissions: snapshot.permissions, version: version(profile, snapshot) };
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
/** Devuelve solo los campus activos donde el usuario conserva una asignación de administrador. */
export async function getAccessCampuses(auth: VerifiedAuthConnection) {
  return transaction(async repository => {
    requireActiveActor(await repository.lockProfiles([auth.userId]), auth);
    const assignments = await repository.adminAssignments(auth.userId);
    if (!assignments.length) throw forbidden();
    return (await repository.campuses(assignments.map(row => row.campusId))).filter(row => row.activo)
      .map(row => ({ id: row.id, name: row.nombre }));
  });
}
/** Comprueba que el catálogo fijo esperado exista antes de permitir asignaciones. */
async function catalog(repository: Repository) {
  const rows = await repository.catalog();
  const roles = rows.roles.filter(row => ROLE_NAMES.includes(row.nombre));
  const permissions = rows.permissions.filter(row => PERMISSION_NAMES.includes(row.nombre));
  if (roles.length !== ROLE_NAMES.length || permissions.length !== PERMISSION_NAMES.length) {
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'El catálogo de accesos no está configurado.');
  }
  return { roles, permissions };
}
/** Devuelve el catálogo tras validar alcance administrativo sobre el campus solicitado. */
export async function getAccessCatalog(auth: VerifiedAuthConnection, rawCampusId: unknown) {
  const campusId = uuid(rawCampusId);
  return transaction(async repository => {
    requireActiveActor(await repository.lockProfiles([auth.userId]), auth);
    await authorizedCampus(repository, auth, campusId);
    return catalog(repository);
  });
}
/** Lista perfiles del campus autorizado con paginación y una proyección mínima. */
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
/** Lista snapshots históricos del campus sin reconstruirlos desde los datos actuales. */
export async function listAuditEntries(auth: VerifiedAuthConnection, rawCampusId: unknown, query: unknown) {
  const campusId = uuid(rawCampusId);
  const pagination = parsePaginationQuery(query);
  if (!pagination.success) throw invalid('Revisa la página y el tamaño del historial.');
  const input = query as Record<string, unknown>;
  const action = input.action;
  if (Object.keys(input).some(key => key.startsWith('action[')) ||
    (action !== undefined && (typeof action !== 'string' || !(AUDIT_ACTIONS as readonly string[]).includes(action)))) {
    throw invalid('Selecciona un tipo de acción válido.');
  }
  const boundary = (key: 'from' | 'before') => {
    const value = input[key];
    if (Object.keys(input).some(name => name.startsWith(key + '['))) throw invalid('Selecciona fechas válidas.');
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw invalid('Selecciona fechas válidas.');
    return value;
  };
  const from = boundary('from'), before = boundary('before');
  if (from && before && from >= before) throw invalid('La fecha inicial debe ser anterior al límite final.');
  const nameFilter = (key: 'contentName' | 'userName') => {
    const value = input[key];
    if (Object.keys(input).some(name => name.startsWith(key + '[')) || (value !== undefined &&
      (typeof value !== 'string' || value.length > 100 || /[\u0000-\u001f\u007f]/.test(value)))) throw invalid('Escribe un nombre válido de hasta 100 caracteres.');
    return typeof value === 'string' ? value.trim() || undefined : undefined;
  };
  const contentName = nameFilter('contentName'), userName = nameFilter('userName');
  return transaction(async repository => {
    requireActiveActor(await repository.lockProfiles([auth.userId]), auth);
    const campus = await authorizedCampus(repository, auth, campusId);
    const users = userName && (!action || (ACTIVITY_AUDIT_ACTIONS as readonly unknown[]).includes(action))
      ? await repository.auditSearchUsers(campus,userName) : undefined;
    const search = { contentName,userName,users };
    const sql = async (limit: number, offset: number) => (await repository.auditEntries(campus, limit, offset, action, from, before,search)).map(presentAuditAccessGroup).map(presentAuditEditGroup);
    const mongo = (limit: number, offset: number) => activityAuditRepository.list(campus, limit, offset, action as string | undefined, from, before,search);
    const result = action
      ? createPaginatedResult(await ((ACTIVITY_AUDIT_ACTIONS as readonly unknown[]).includes(action) ? mongo : sql)(pagination.data.limit + 1, pagination.data.offset), pagination.data)
      : await auditTimeline(pagination.data, sql, mongo);
    const countSql = () => repository.auditEntryCount(campus,action as string | undefined,from,before,search);
    const countMongo = () => activityAuditRepository.count(campus,action as string | undefined,from,before,search);
    const total = action
      ? await ((ACTIVITY_AUDIT_ACTIONS as readonly unknown[]).includes(action) ? countMongo : countSql)()
      : (await Promise.all([countSql(),countMongo()])).reduce((sum,count) => sum + count,0);
    return { ...result, meta: { ...result.meta,total }, data: await auditEntryActors(repository,campus,result.data) };
  });
}
/** Lee una auditoría del campus autorizado y filtra sus campos antes de exponerla. */
export async function getAuditEntry(auth: VerifiedAuthConnection, rawCampusId: unknown, rawAuditId: unknown) {
  const campusId = uuid(rawCampusId);
  const activityKey = typeof rawAuditId === 'string' ? parseActivityAuditId(rawAuditId) : null;
  const auditId = activityKey ? rawAuditId as string : uuid(rawAuditId);
  return transaction(async repository => {
    requireActiveActor(await repository.lockProfiles([auth.userId]), auth);
    const campus = await authorizedCampus(repository, auth, campusId);
    const document = activityKey ? await activityAuditRepository.find(campus,activityKey.activityId) : null;
    const entry = activityKey ? document && activityAuditDetail(document,auditId,campus) : await repository.auditEntry(campus,auditId);
    if (!entry) throw new ApiError(404, 'NOT_FOUND', 'El registro no está disponible en este campus.');
    if (document?.seriesId && activityKey?.suffix === 'created') {
      const group = await activityAuditRepository.occurrences(campus,document,1,0);
      if (group.total) entry.activitySeries = { seriesId: document.seriesId.toHexString(), count: group.total };
    }
    if (entry.entidad_tipo === 'perfil_usuario' && entry.actor_usuario_id && (ACCESS_AUDIT_ACTIONS as readonly string[]).includes(entry.accion)) {
      const peers = await repository.auditAccessPeers(campus, entry);
      const group = auditAccessGroup(peers.map(row => row.accion), peers.map(row => row.id));
      if (group) entry.accessGroup = group;
    }
    if (isAuditEdit(entry)) {
      const total = document ? activityEditHistory(document,campus,0,0).total : await repository.auditEditsCount(campus,entry.entidad_id);
      if (total > 1) entry.editGroup = {count:total};
    }
    return enrichAuditDetail(repository,campus,entry);
  });
}
/** Versiones originales de la entidad de una edición real; filtros del listado no limitan esta cronología. */
export async function getAuditEdits(auth: VerifiedAuthConnection, rawCampusId: unknown, rawAuditId: unknown, query: unknown) {
  const campusId = uuid(rawCampusId), pagination = parsePaginationQuery(query);
  if (!pagination.success) throw invalid('Revisa la página del historial de ediciones.');
  const key = typeof rawAuditId === 'string' ? parseActivityAuditId(rawAuditId) : null;
  const auditId = key ? rawAuditId as string : uuid(rawAuditId);
  return transaction(async repository=>{
    requireActiveActor(await repository.lockProfiles([auth.userId]),auth);
    const campus = await authorizedCampus(repository,auth,campusId);
    const document = key ? await activityAuditRepository.find(campus,key.activityId) : null;
    const anchor = key ? document && activityAuditDetail(document,auditId,campus) : await repository.auditEntry(campus,auditId);
    if (!anchor || !isAuditEdit(anchor)) throw new ApiError(404,'NOT_FOUND','El historial de ediciones no está disponible en este registro.');
    const {limit,offset} = pagination.data;
    const result = document ? activityEditHistory(document,campus,limit+1,offset)
      : {data:await repository.auditEdits(campus,anchor.entidad_id,limit+1,offset),total:await repository.auditEditsCount(campus,anchor.entidad_id)};
    const page = createPaginatedResult(result.data,pagination.data);
    return {...page,meta:{...page.meta,total:result.total},data:await auditEntryActors(repository,campus,page.data)};
  });
}
/** Firma solo fotos referenciadas por la auditoría y vinculadas a su publicación/campus, incluidas retiradas. */
export async function getAuditImage(auth: VerifiedAuthConnection, rawCampusId: unknown, rawAuditId: unknown, rawImageId: unknown) {
  const campusId = uuid(rawCampusId), auditId = uuid(rawAuditId), imageId = uuid(rawImageId);
  const file = await transaction(async repository => {
    requireActiveActor(await repository.lockProfiles([auth.userId]), auth);
    const campus = await authorizedCampus(repository, auth, campusId);
    const entry = await repository.auditEntry(campus, auditId);
    const unavailable = () => new ApiError(404, 'NOT_FOUND', 'La imagen no está disponible en este registro.');
    if (!entry || !['publicacion_recurso', 'PUBLICACION_FISICA'].includes(entry.entidad_tipo) || !auditContainsImage(entry, imageId)) throw unavailable();
    const file = await repository.auditPublicationImage(campus, entry.entidad_id, imageId);
    if (!file || !isAuditImageFile(campus.id, file)) throw unavailable();
    return file;
  });
  // Como la galería, firma después de liberar los bloqueos y conexión SQL de esta lectura autorizada.
  try { return { url: await auditImageStorage.sign(file.storage_path), expiresIn: 60 }; }
  catch { throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo cargar la vista previa de la imagen.'); }
}

/** Todas las ocurrencias de la misma publicación, tras revalidar administrador y campus. */
export async function getAuditOccurrences(auth: VerifiedAuthConnection, rawCampusId: unknown, rawAuditId: unknown, query: unknown) {
  const campusId = uuid(rawCampusId), pagination = parsePaginationQuery(query);
  if (!pagination.success) throw invalid('Revisa la página de las ocurrencias.');
  const key = typeof rawAuditId === 'string' ? parseActivityAuditId(rawAuditId) : null;
  return transaction(async repository => {
    requireActiveActor(await repository.lockProfiles([auth.userId]),auth);
    const campus = await authorizedCampus(repository,auth,campusId);
    const unavailable = () => new ApiError(404,'NOT_FOUND','La serie no está disponible en este registro.');
    if (!key || key.suffix !== 'created') throw unavailable();
    const document = await activityAuditRepository.find(campus,key.activityId);
    if (!document?.seriesId || !activityAuditDetail(document,rawAuditId as string,campus)) throw unavailable();
    const result = await activityAuditRepository.occurrences(campus,document,pagination.data.limit+1,pagination.data.offset);
    if (!result.total) throw unavailable();
    const page = createPaginatedResult(result.occurrences,pagination.data);
    return { ...page, data: { seriesId: document.seriesId.toHexString(), occurrences: page.data } };
  });
}

async function enrichAuditDetail(repository: Repository, campus: AccessCampus, entry: AuditDetail) {
  const before = entry.activity ? entry.datos_antes as Record<string, unknown> | null : auditSnapshot(entry.datos_antes);
  const after = entry.activity ? entry.datos_despues as Record<string, unknown> | null : auditSnapshot(entry.datos_despues);
  const requests = auditReferenceRequests(entry,before,after);
  const references = auditReferences(requests,await repository.auditReferenceNames(campus,requests));
  if (entry.activity) Object.assign(references, auditLocationReferences(campus.id,before,after,await activityAuditRepository.map(campus.id)));
  if (entry.activity?.snapshotSource === 'current') for (const reference of Object.values(references)) {
    if (reference.kind === 'activity' && reference.name) reference.source = 'current';
  }
  const actor = auditActor((await repository.auditActors(campus,[entry]))[0]);
  const responsibleProfile = entry.actor_usuario_id && actor.source === 'assignment_history'
    ? await repository.auditResponsibleProfile(campus,entry.actor_usuario_id) : null;
  let publicationOwners: AuditDetail['publicationOwners'];
  if (['publicacion_recurso','PUBLICACION_FISICA','PUBLICACION_DIGITAL'].includes(entry.entidad_tipo)
    && ['PUBLICAR_PUBLICACION','EDITAR_PUBLICACION','RETIRAR_PUBLICACION'].includes(entry.accion)) {
    const ids = [...new Set([before?.propietario_id,after?.propietario_id].filter((id): id is string =>
      typeof id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)).map(id=>id.toLowerCase()))];
    if (ids.length) {
      publicationOwners = {};
      const otherIds = ids.filter(id=>id !== entry.actor_usuario_id?.toLowerCase());
      const rows = new Map((await repository.auditActors(campus,otherIds.map(id=>({...entry,id,actor_usuario_id:id})))).map(row=>[row.audit_id,row]));
      for (const id of ids) {
        const sameActor = id === entry.actor_usuario_id?.toLowerCase(), assignments = sameActor ? actor : auditActor(rows.get(id));
        const profile = sameActor ? responsibleProfile : assignments.source === 'assignment_history' ? await repository.auditResponsibleProfile(campus,id) : null;
        publicationOwners[id] = { profile, assignments };
      }
    }
  }
  return { ...entry, datos_antes: before, datos_despues: after, references, actor, responsibleProfile, ...(publicationOwners ? { publicationOwners } : {}) };
}

/** Histórico nominativo exclusivo de administración, incluso para actividades eliminadas o finalizadas. */
export async function getAuditParticipation(auth: VerifiedAuthConnection, rawCampusId: unknown, rawAuditId: unknown, query: unknown) {
  const campusId = uuid(rawCampusId), pagination = parsePaginationQuery(query);
  if (!pagination.success) throw invalid('Revisa la página del historial de participación.');
  const key = typeof rawAuditId === 'string' ? parseActivityAuditId(rawAuditId) : null;
  return transaction(async repository => {
    requireActiveActor(await repository.lockProfiles([auth.userId]), auth);
    const campus = await authorizedCampus(repository, auth, campusId);
    if (!key || key.suffix !== 'created') throw new ApiError(404, 'NOT_FOUND', 'El historial de participación no está disponible.');
    const document = await activityAuditRepository.find(campus,key.activityId);
    if (!document || !activityAuditDetail(document,rawAuditId as string,campus)) throw new ApiError(404, 'NOT_FOUND', 'El historial de participación no está disponible.');
    const result = await activityAuditRepository.participation(campus,key.activityId,pagination.data.limit + 1,pagination.data.offset);
    const page = createPaginatedResult(result.events,pagination.data);
    const names = new Map((await repository.auditParticipantNames(campus,[...new Set(page.data.map(row => row.userId))])).map(row => [row.id,row.name]));
    return { ...page, data: { activityId: key.activityId, summary: result.summary,
      events: page.data.map(row => ({ ...row, name: names.get(row.userId.toLowerCase()) ?? null })) } };
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
/** Consulta los permisos del usuario solo dentro del campus de la ruta y del administrador. */
export async function getUserAccess(auth: VerifiedAuthConnection, rawCampusId: unknown, rawUserId: unknown) {
  const campusId = uuid(rawCampusId), userId = uuid(rawUserId);
  return transaction(async repository => {
    const { profile } = await target(repository, auth, campusId, userId);
    return detail(profile, campusId, await repository.snapshot(userId, campusId));
  });
}
/**
 * Aplica altas y revocaciones de asignaciones en una transacción y registra cada cambio.
 * La versión impide sobrescribir cambios concurrentes y el catálogo limita nuevas concesiones.
 */
export async function updateUserAccess(auth: VerifiedAuthConnection, rawCampusId: unknown, rawUserId: unknown, body: unknown) {
  const campusId = uuid(rawCampusId), userId = uuid(rawUserId), input = parseAccessUpdate(body);
  return transaction(async repository => {
    const { campus, profile } = await target(repository, auth, campusId, userId);
    const available = await catalog(repository);
    const before = await repository.snapshot(userId, campusId);
    if (version(profile, before) !== input.version) throw new ApiError(409, 'CONFLICT', 'El usuario o sus accesos cambiaron. Recarga antes de guardar.');
    const changes: { action: string; assignmentId: string; catalogId: string }[] = [];
    for (const [kind, selected, choices] of [['roles', input.roleIds, available.roles], ['permissions', input.permissionIds, available.permissions]] as const) {
      const current = before[kind];
      // Se pueden conservar o revocar asignaciones históricas fuera del catálogo, pero no crear privilegios nuevos con ellas.
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

export function parseAccountStateUpdate(body: unknown): AccountStateUpdate {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('Revisa la acción de cuenta.');
  const input = body as Record<string, unknown>;
  if (Object.keys(input).length !== 2 || Object.keys(input).some(key => !['accountState','version'].includes(key))
    || !['SUSPENDIDA','DESACTIVADA'].includes(input.accountState as string)
    || typeof input.version !== 'string' || !/^[0-9a-f]{64}$/.test(input.version)) {
    throw invalid('Selecciona suspender o desactivar y recarga el usuario antes de confirmar.');
  }
  return { accountState: input.accountState as AccountStateUpdate['accountState'], version: input.version };
}

/**
 * Suspende o desactiva una cuenta con versión vigente y registra el cambio de estado.
 * Al desactivar, también retira lógicamente sus publicaciones físicas activas en cualquier campus.
 */
export async function updateAccountState(auth: VerifiedAuthConnection, rawCampusId: unknown, rawUserId: unknown, body: unknown) {
  const campusId = uuid(rawCampusId), userId = uuid(rawUserId), input = parseAccountStateUpdate(body);
  return transaction(async repository => {
    const { campus, profile } = await target(repository, auth, campusId, userId);
    const snapshot = await repository.snapshot(userId, campusId);
    if (version(profile, snapshot) !== input.version) throw new ApiError(409, 'CONFLICT', 'El usuario o sus accesos cambiaron. Recarga antes de confirmar.');
    if (profile.estado_cuenta === input.accountState) return detail(profile, campusId, snapshot);
    if (profile.estado_cuenta === 'DESACTIVADA') throw new ApiError(409, 'CONFLICT', 'La cuenta ya está desactivada. Recarga el usuario.');
    // Incluye publicaciones de campus anteriores: la desactivación alcanza todas las publicaciones físicas
    // activas, aunque conserva el campus de origen y su historial.
    const publications = input.accountState === 'DESACTIVADA'
      ? (await repository.lockPhysicalPublications(userId)).filter(row => ['DISPONIBLE','RESERVADO','OCULTO'].includes(row.estado_publicacion)) : [];
    const changedAt = await repository.setAccountState(userId, input.accountState);
    const after = { ...profile, estado_cuenta: input.accountState, updated_at: changedAt };
    const retired = publications.length ? await repository.retirePhysicalPublications(publications.map(row => row.id), changedAt) : [];
    await repository.auditAccountState(auth.userId, campus, userId,
      input.accountState === 'SUSPENDIDA' ? 'SUSPENDER_CUENTA' : 'DESACTIVAR_CUENTA', profile, after, publications, retired);
    return detail(after, campusId, snapshot);
  });
}
