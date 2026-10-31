import { ObjectId, type Document } from 'mongodb';
import { getMongoDB as getMongoDb } from '../../../database/mongodb/client.js';
import type { ActivityDocument, ActivityInteractionDocument, ActivityParticipationDocument } from '../../activities/activities.types.js';
import type { ActivityChangeDocument } from '../../activities/activities.edit.types.js';
import type { AccessCampus, AuditDetail, AuditEntry, AuditOccurrences, AuditSearch } from '../types/access.types.js';
import { findActiveMapByCampusId } from '../../maps/map.repository.js';
import { compareAuditEntries } from '../domain/audit.timeline.js';
import { auditEditSummary } from '../domain/audit.edit-groups.js';

const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const objectId = (value: unknown): value is ObjectId => value instanceof ObjectId;
const date = (value: unknown): value is Date => value instanceof Date && Number.isFinite(value.getTime());
const text = (value: unknown) => typeof value === 'string' ? value : undefined;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export const activityAuditId = (id: ObjectId, suffix: string) => `activity:${id.toHexString()}:${suffix}`;
export function parseActivityAuditId(value: string) {
  const match = /^activity:([a-f0-9]{24}):(created|deleted|change:([a-f0-9]{24}))$/.exec(value);
  return match ? { activityId: match[1], suffix: match[2], changeId: match[3] } : null;
}

function action(kind: string, type: string) {
  return type === 'OFFICIAL_EVENT'
    ? kind === 'created' ? 'PUBLICAR_EVENTO_OFICIAL' : kind === 'deleted' ? 'ELIMINAR_EVENTO_OFICIAL' : 'EDITAR_EVENTO_OFICIAL'
    : kind === 'created' ? 'CREAR_ACTIVIDAD' : kind === 'deleted' ? 'ELIMINAR_ACTIVIDAD' : 'EDITAR_ACTIVIDAD';
}
function validChanges(document: ActivityDocument): ActivityChangeDocument[] {
  return (Array.isArray(document.changeHistory) ? document.changeHistory : []).filter(change =>
    change && change.campusId === document.campusId && objectId(change.activityId) && change.activityId.equals(document._id)
    && objectId(change._id) && date(change.changedAt));
}

/** Solo campos de negocio conocidos; nunca notificationEvents, destinatarios, tokens ni JSON arbitrario. */
export function activityAuditSnapshot(value: unknown, document: ActivityDocument): Record<string, unknown> | null {
  if (!record(value)) return null;
  const result: Record<string, unknown> = { id: document._id.toHexString(), campus_id: document.campusId };
  if (uuid(document.createdByUserId)) result.propietario_id = document.createdByUserId;
  for (const [source, target] of [['title','titulo'],['description','descripcion'],['type','tipo_actividad'],['status','estado_actividad'],['visibility','visibilidad']] as const) {
    if (typeof value[source] === 'string') result[target] = value[source];
  }
  for (const [source, target] of [['startAt','inicio_en'],['endAt','termino_en'],['deletedAt','eliminado_en']] as const) {
    if (date(value[source])) result[target] = value[source].toISOString();
  }
  if (record(value.location)) {
    const location: Record<string, string> = {};
    for (const [source, target] of [['buildingKey','edificio_clave'],['floorKey','piso_clave'],['poiKey','poi_clave'],['customLabel','referencia']] as const) {
      if (typeof value.location[source] === 'string') location[target] = value.location[source];
    }
    result.ubicacion = location;
  }
  return result;
}

interface MongoAuditRow { id: string; activityId: ObjectId; at: Date; actor: unknown; type: string; kind: string; name?: string; seriesId?: ObjectId; seriesCount?: number; editCount?: number }
export function activityAuditEntry(row: MongoAuditRow, campus: AccessCampus): AuditEntry {
  return { id: row.id, actor_usuario_id: uuid(row.actor) ? row.actor : null, institucion_id: campus.institucion_id,
    campus_id: campus.id, entidad_tipo: row.type === 'OFFICIAL_EVENT' ? 'evento_oficial' : 'actividad',
    entidad_id: row.activityId.toHexString(), accion: action(row.kind, row.type), created_at: row.at.toISOString(),
    ...(typeof row.name === 'string' ? { entity_name: row.name } : {}),
    ...(row.kind === 'created' && objectId(row.seriesId) && row.seriesCount ? { activitySeries: { seriesId: row.seriesId.toHexString(), count: row.seriesCount } } : {}),
    ...(row.kind === 'edited' && Number.isSafeInteger(row.editCount) && row.editCount! > 1 ? { editGroup:{count:row.editCount!} } : {}) };
}

/** Despliega eventos dentro de activities, sin colección nueva ni copia del historial. */
function activityAuditEvents(campusId: string, selectedAction?: string, from?: string, before?: string, search: AuditSearch = {}): Document[] {
  const changes = { $filter: { input: { $cond: [{ $isArray: '$changeHistory' }, '$changeHistory', []] }, as: 'change', cond: { $and: [
    { $eq: ['$$change.campusId', '$campusId'] }, { $eq: ['$$change.activityId', '$_id'] },
    { $eq: [{ $type: '$$change._id' }, 'objectId'] }, { $eq: [{ $type: '$$change.changedAt' }, 'date'] },
  ] } } };
  const isDeletion = { $or: [{ $eq: ['$$change.after.status', 'DELETED'] }, { $eq: [{ $type: '$$change.after.deletedAt' }, 'date'] }] };
  const prefix = { $concat: ['activity:', { $toString: '$_id' }, ':'] };
  const eventMatch: Document = { at: { $type: 'date', ...(from ? { $gte: new Date(from) } : {}), ...(before ? { $lt: new Date(before) } : {}) } };
  if (selectedAction) eventMatch.action = selectedAction;
  const pattern = search.contentName?.replace(/[.*+?^{}$()|[\]\\]/g,'\\$&');
  const nameMatch = { $or: ['$name','$previousName'].map(field=>({ $regexMatch: {
    input: { $cond: [{ $eq: [{ $type: field },'string'] },field,''] }, regex: pattern ?? '',options:'i',
  } })) };
  if (pattern) eventMatch.matchingName = 1;
  if (search.userName) {
    const users = (search.users ?? []).filter(user=>uuid(user.id) && Number.isFinite(user.createdAt));
    eventMatch.actor = { $in: users.map(user=>user.id) };
    if (users.length) eventMatch.$or = users.map(user=>({ actor:user.id,at:{ $gte:new Date(user.createdAt) } }));
  }
  return [
    { $match: { campusId, type: { $in: ['COMMUNITY_ACTIVITY', 'OFFICIAL_EVENT'] } } },
    { $set: { auditChanges: changes } },
    { $project: { campusId: 1, events: { $concatArrays: [
      [{ id: { $concat: [prefix, 'created'] }, activityId: '$_id', at: '$createdAt', actor: '$createdByUserId', type: '$type', kind: 'created', name: '$title', seriesId: '$seriesId' }],
      { $map: { input: '$auditChanges', as: 'change', in: {
        id: { $concat: [prefix, 'change:', { $toString: '$$change._id' }] }, activityId: '$_id', at: '$$change.changedAt', actor: '$$change.actorUserId',
        type: { $cond: [{ $in: ['$$change.after.type', ['COMMUNITY_ACTIVITY','OFFICIAL_EVENT']] }, '$$change.after.type', '$type'] }, kind: { $cond: [isDeletion, 'deleted', 'edited'] },
        name: { $ifNull: ['$$change.after.title', '$$change.before.title'] },
        previousName: '$$change.before.title',
      } } },
      { $cond: [{ $and: [{ $eq: [{ $type: '$deletedAt' }, 'date'] }, { $eq: [{ $size: { $filter: {
        input: '$auditChanges', as: 'change', cond: isDeletion,
      } } }, 0] }] }, [{ id: { $concat: [prefix, 'deleted'] }, activityId: '$_id', at: '$deletedAt', actor: '$deletedByUserId', type: '$type', kind: 'deleted', name: '$title' }], []] },
    ] } } },
    { $unwind: '$events' },
    { $replaceWith: '$events' },
    { $set: { action: { $switch: { branches: ['created','edited','deleted'].flatMap(kind => ['COMMUNITY_ACTIVITY','OFFICIAL_EVENT'].map(type => ({
      case: { $and: [{ $eq: ['$kind', kind] }, { $eq: ['$type', type] }] }, then: action(kind, type),
    }))), default: null } } } },
    // Solo la creación comparte identidad de serie; las ediciones se agrupan después por actividad concreta.
    { $set: { groupedCreation: { $and: [{ $eq: ['$kind','created'] }, { $eq: [{ $type: '$seriesId' },'objectId'] },
      { $regexMatch: { input: { $cond: [{ $eq: [{ $type: '$actor' },'string'] },'$actor',''] }, regex: /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i } },
      { $eq: [{ $type: '$at' },'date'] }] } } },
    { $sort: { id: -1 } },
    { $group: { _id: { $cond: ['$groupedCreation', { seriesId: '$seriesId', actor: '$actor', type: '$type', at: '$at' }, { id: '$id' }] },
      entry: { $first: '$$ROOT' }, seriesCount: { $sum: 1 },
      ...(pattern ? { matchingName: { $max: { $cond: [nameMatch,1,0] } } } : {}) } },
    { $replaceWith: { $mergeObjects: ['$entry', { seriesCount: { $cond: ['$entry.groupedCreation','$seriesCount',null] },
      ...(pattern ? { matchingName:'$matchingName' } : {}) }] } },
    { $match: eventMatch },
    // Los filtros seleccionan versiones; una card reúne las ediciones coincidentes de la misma actividad.
    { $sort: { at: -1, id: -1 } },
    { $group: { _id: { $cond: [{ $eq: ['$kind','edited'] },{ editActivity:'$activityId' },{ id:'$id' }] },
      entry:{ $first:'$$ROOT' },editCount:{ $sum:1 } } },
    { $replaceWith: { $mergeObjects: ['$entry',{editCount:'$editCount'}] } },
  ];
}

export function activityAuditPipeline(campusId: string, limit: number, offset: number, selectedAction?: string, from?: string, before?: string, search: AuditSearch = {}): Document[] {
  return [...activityAuditEvents(campusId,selectedAction,from,before,search),{ $sort: { at: -1, id: -1 } },{ $skip: offset },{ $limit: limit }];
}

export async function countActivityAudit(campus: AccessCampus, selectedAction?: string, from?: string, before?: string, search: AuditSearch = {}) {
  const [result] = await getMongoDb().collection<ActivityDocument>('activities').aggregate<{ total: number }>([
    ...activityAuditEvents(campus.id,selectedAction,from,before,search),{ $count: 'total' },
  ]).toArray();
  return result?.total ?? 0;
}

/** El navegador administrativo mantiene fechas pasadas, estados ocultos y eliminaciones; no usa la política pública. */
export function auditSeriesFilter(campus: AccessCampus, anchor: ActivityDocument): Document | null {
  if (anchor.campusId !== campus.id || !objectId(anchor.seriesId) || !date(anchor.createdAt) || !uuid(anchor.createdByUserId)
    || !['COMMUNITY_ACTIVITY','OFFICIAL_EVENT'].includes(anchor.type)) return null;
  return { campusId: campus.id, seriesId: anchor.seriesId, createdByUserId: anchor.createdByUserId, type: anchor.type, createdAt: anchor.createdAt };
}

export function auditOccurrence(document: ActivityDocument): AuditOccurrences['occurrences'][number] {
  return { auditId: activityAuditId(document._id,'created'), activityId: document._id.toHexString(),
    ...(Number.isSafeInteger(document.occurrenceIndex) && document.occurrenceIndex! > 0 ? { index: document.occurrenceIndex } : {}),
    title: text(document.title) ?? null, startAt: date(document.startAt) ? document.startAt.toISOString() : null,
    endAt: date(document.endAt) ? document.endAt.toISOString() : null, status: text(document.status) ?? null, visibility: text(document.visibility) ?? null };
}

export async function listAuditOccurrences(campus: AccessCampus, anchor: ActivityDocument, limit: number, offset: number) {
  const filter = auditSeriesFilter(campus,anchor);
  if (!filter) return { total: 0, occurrences: [] };
  const [result] = await getMongoDb().collection<ActivityDocument>('activities').aggregate<{ count: { total: number }[]; rows: ActivityDocument[] }>([
    { $match: filter }, { $facet: { count: [{ $count: 'total' }], rows: [
      { $sort: { occurrenceIndex: 1, originalStartAt: 1, startAt: 1, _id: 1 } }, { $skip: offset }, { $limit: limit },
      { $project: { _id: 1, occurrenceIndex: 1, title: 1, startAt: 1, endAt: 1, status: 1, visibility: 1 } },
    ] } },
  ]).toArray();
  return { total: result?.count[0]?.total ?? 0, occurrences: (result?.rows ?? []).map(auditOccurrence) };
}

export async function listActivityAudit(campus: AccessCampus, limit: number, offset: number, selectedAction?: string, from?: string, before?: string, search: AuditSearch = {}) {
  const rows = await getMongoDb().collection<ActivityDocument>('activities').aggregate<MongoAuditRow>(
    activityAuditPipeline(campus.id, limit, offset, selectedAction, from, before,search)).toArray();
  return rows.map(row => activityAuditEntry(row, campus));
}

export async function findAuditActivity(campus: AccessCampus, id: string) {
  return getMongoDb().collection<ActivityDocument>('activities').findOne({ campusId: campus.id, _id: new ObjectId(id), type: { $in: ['COMMUNITY_ACTIVITY','OFFICIAL_EVENT'] } },
    { projection: { campusId: 1, createdByUserId: 1, title: 1, description: 1, type: 1, status: 1, visibility: 1, startAt: 1, endAt: 1,
      location: 1, createdAt: 1, updatedAt: 1, deletedAt: 1, deletedByUserId: 1, seriesId: 1, occurrenceIndex: 1, changeHistory: 1 } });
}

/** No presenta campos actuales como si fueran una instantánea original de publicación. */
export function activityAuditDetail(document: ActivityDocument, id: string, campus: AccessCampus): AuditDetail | null {
  const key = parseActivityAuditId(id);
  if (!key || key.activityId !== document._id.toHexString() || document.campusId !== campus.id) return null;
  const changes = validChanges(document);
  const change = changes.find(row => row._id.toHexString() === key.changeId);
  if (key.changeId && !change) return null;
  if (key.suffix === 'deleted' && (!date(document.deletedAt) || changes.some(row => row.after?.status === 'DELETED' || date(row.after?.deletedAt)))) return null;
  const first = changes.find(row => row.revision === 1);
  const kind = key.suffix === 'created' ? 'created' : change ? (change.after?.status === 'DELETED' || date(change.after?.deletedAt) ? 'deleted' : 'edited') : 'deleted';
  const at = kind === 'created' ? document.createdAt : change?.changedAt ?? document.deletedAt;
  if (!date(at)) return null;
  const snapshot = kind === 'created' ? first?.before ?? document : change?.after ?? document;
  const type = record(snapshot) && ['COMMUNITY_ACTIVITY','OFFICIAL_EVENT'].includes(String(snapshot.type)) ? String(snapshot.type) : document.type;
  const entry = activityAuditEntry({ id, activityId: document._id, at, actor: kind === 'created' ? document.createdByUserId : change?.actorUserId ?? document.deletedByUserId,
    kind, type, name: record(snapshot) ? text(snapshot.title) : undefined }, campus);
  return { ...entry, justificacion_accion: null, reporte_contenido_id: null,
    datos_antes: change ? activityAuditSnapshot(change.before, document) : null,
    datos_despues: activityAuditSnapshot(snapshot, document),
    activity: { kind, snapshotSource: change ? 'recorded' : kind === 'created' && first ? 'first_change' : 'current',
      changedFields: Array.isArray(change?.changedFields) ? change.changedFields.filter(field => ['title','description','startAt','endAt','location','status','deletedAt','type'].includes(field)) : [],
      ...(change && Number.isSafeInteger(change.revision) ? { revision: change.revision } : {}),
      ...(change && ['ONE','UPCOMING'].includes(change.scope) ? { scope: change.scope } : {}),
      ...(objectId(change?.operationId) ? { operationId: change.operationId.toHexString() } : {}),
      ...(objectId(document.seriesId) ? { seriesId: document.seriesId.toHexString(), occurrenceIndex: document.occurrenceIndex } : {}),
    } };
}

/** Versiones individuales de una actividad concreta; no agrupa distintas ocurrencias de su serie. */
export function activityEditHistory(document: ActivityDocument, campus: AccessCampus, limit: number, offset: number) {
  if (document.campusId !== campus.id) return {data:[],total:0};
  const entries = validChanges(document).filter(change=>change.after?.status !== 'DELETED' && !date(change.after?.deletedAt)).map(change=>{
    const type = ['COMMUNITY_ACTIVITY','OFFICIAL_EVENT'].includes(String(change.after?.type)) ? String(change.after.type) : document.type;
    return {...activityAuditEntry({id:activityAuditId(document._id,'change:'+change._id.toHexString()),activityId:document._id,
      at:change.changedAt,actor:change.actorUserId,type,kind:'edited',name:text(change.after?.title) ?? text(change.before?.title)},campus),
      changes:auditEditSummary(activityAuditSnapshot(change.before,document),activityAuditSnapshot(change.after,document))};
  }).sort(compareAuditEntries);
  return {data:entries.slice(offset,offset+limit),total:entries.length};
}

export async function activityAuditParticipation(campus: AccessCampus, activityId: string, limit: number, offset: number) {
  const db = getMongoDb(), filter = { campusId: campus.id, activityId: new ObjectId(activityId) };
  const [events, counts] = await Promise.all([
    db.collection<ActivityInteractionDocument>('activity_interactions').find({ ...filter, type: { $in: ['JOINED','LEFT'] },
      occurredAt: { $type: 'date' }, userId: { $regex: /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i } },
      { projection: { _id: 1, userId: 1, type: 1, occurredAt: 1, provenance: 1 } }).sort({ occurredAt: -1, _id: -1 }).skip(offset).limit(limit).toArray(),
    db.collection<ActivityParticipationDocument>('activity_participation').aggregate<{ joined: number; left: number; incomplete: number }>([
      { $match: filter }, { $group: { _id: null,
        joined: { $sum: { $cond: [{ $eq: ['$status','JOINED'] }, 1, 0] } },
        left: { $sum: { $cond: [{ $eq: ['$status','LEFT'] }, 1, 0] } },
        incomplete: { $sum: { $cond: [{ $eq: ['$historyComplete',true] }, 0, 1] } },
      } },
    ]).toArray(),
  ]);
  const summary = counts[0] ?? { joined: 0, left: 0, incomplete: 0 };
  return { events: events.map(event => ({ id: event._id.toHexString(), userId: event.userId, type: event.type as 'JOINED' | 'LEFT',
    occurredAt: event.occurredAt.toISOString(), provenance: event.provenance === 'LIVE' ? 'LIVE' as const : 'LEGACY_STATE' as const })),
    summary: { joined: summary.joined, left: summary.left, historyIncomplete: summary.incomplete > 0 || (!events.length && offset === 0 && summary.joined + summary.left > 0) } };
}

export const activityAuditRepository = { list: listActivityAudit, count: countActivityAudit, find: findAuditActivity, participation: activityAuditParticipation,
  occurrences: listAuditOccurrences, map: findActiveMapByCampusId };
