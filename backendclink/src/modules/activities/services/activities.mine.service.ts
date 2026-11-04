import { findJoinedActivities } from '../repositories/activities.mine.repository.js';
import type { VerifiedAuthConnection } from '../../auth/types/auth.types.js';
import type { ActivityDocument } from '../types/activities.types.js';
import { getActivities, type ActivityDependencies } from './activities.service.js';
import { getMongoDB as getMongoDb } from '../../../database/mongodb/client.js';
import { visibleActivityFilter } from '../domain/activities.policy.js';
import { parsePaginationQuery } from '../../../shared/pagination/pagination.js';
import { ApiError } from '../../../shared/errors/api-error.js';

export interface OwnActivityDependencies extends ActivityDependencies {
  findJoinedActivities?: (campusId: string, userId: string, now: Date) => Promise<ActivityDocument[]>;
}

/** DTO personal paginado, sin identidad del participante ni metadatos de series restringidos. */
export async function getOwnActivities(auth: VerifiedAuthConnection, query: unknown, dependencies: OwnActivityDependencies = {}) {
  const pagination = parsePaginationQuery(query);
  if (!pagination.success || Object.keys(query as object).some(key => !['page', 'limit'].includes(key))) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Revisa la paginación de tus actividades.');
  }
  const items = await getActivities(auth, {}, {
    ...dependencies,
    findActivities: (campusId, _query, now) => (dependencies.findJoinedActivities ?? findJoinedActivities)(campusId, auth.userId, now),
  });
  const { page, limit, offset } = pagination.data;
  return { campusId: auth.campusId, total: items.length, page, limit,
    hasMore: offset + limit < items.length,
    items: items.slice(offset, offset + limit).map(({ series: _series, ...item }) => item) };
}
