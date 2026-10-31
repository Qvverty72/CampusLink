import type { VerifiedAuthConnection } from '../../auth/types/auth.types.js';
import type { ActivityDependencies } from '../../activities/public.js';
import type { ActivitySnapshot } from '../../activities/types/activities.edit.types.js';
import { getAuthorizedActiveMap } from '../../maps/public.js';
import { resolveActivityLocation, spatialBuildings } from '../../activities/domain/activities.location.js';
import { toVisibleActivity } from '../../activities/domain/activities.policy.js';
import { ApiError } from '../../../shared/errors/api-error.js';
import type { NotificationActivityChangeDto, NotificationActivitySnapshot } from '../types/notifications.types.js';

/** Vincula un aviso autorizado al snapshot exacto, aunque existan ediciones posteriores. */
export async function getNotificationActivityChange(auth: VerifiedAuthConnection, notificationId: string,
  reference: { actividad_id: string; actividad_evento_clave: string }, dependencies: ActivityDependencies = {}): Promise<NotificationActivityChangeDto> {
  const unavailable = () => new ApiError(404, 'NOT_FOUND', 'El cambio de esta actividad ya no está disponible.');
  const id = reference.actividad_id;
  if (!/^[0-9a-f]{24}$/.test(id)) throw unavailable();
  const revision = new RegExp(`^activity:${id}:revision:([1-9][0-9]*)$`).exec(reference.actividad_evento_clave);
  const operation = /^operation:([0-9a-f]{24}):changed$/.exec(reference.actividad_evento_clave);
  if ((!revision && !operation) || (revision && !Number.isSafeInteger(Number(revision[1])))) throw unavailable();
  const map = await getAuthorizedActiveMap(auth, auth.campusId, dependencies.getActiveMap);
  const buildings = spatialBuildings(map), now = dependencies.now?.() ?? new Date();
  const find = dependencies.findActivity ?? (await import('../../activities/public.js')).findVisibleActivity;
  const document = await find(auth.campusId, id, now);
  if (!document || document._id?.toHexString?.() !== id || !toVisibleActivity(document, auth.campusId, now, buildings)) throw unavailable();
  const matches = (Array.isArray(document.changeHistory) ? document.changeHistory : []).filter(history => history?.campusId === auth.campusId
    && history.activityId?.toHexString?.() === id && (revision ? history.revision === Number(revision[1])
      : history.operationId?.toHexString?.() === operation![1]));
  if (matches.length !== 1) throw unavailable();
  const project = (value: ActivitySnapshot): NotificationActivitySnapshot => {
    if (!value || typeof value.title !== 'string' || typeof value.description !== 'string'
      || !(value.startAt instanceof Date) || !(value.endAt instanceof Date)
      || !Number.isFinite(value.startAt.getTime()) || !Number.isFinite(value.endAt.getTime()) || value.endAt <= value.startAt) throw unavailable();
    return { title: value.title, description: value.description, startAt: value.startAt.toISOString(), endAt: value.endAt.toISOString(),
      location: resolveActivityLocation(buildings, value.location) };
  };
  const before = project(matches[0].before), after = project(matches[0].after);
  return { notificationId, activityId: id, title: after.title, before, after };
}
