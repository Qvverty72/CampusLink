import type { DashboardGrouping } from '../types/analytics.types.js';
import type { AnalyticsWindow } from '../domain/analytics.periods.js';
import { ANALYTICS_TIME_ZONE } from '../domain/analytics.periods.js';


/**
 * Cuenta eventos ocurridos en `[from, until)` para un campus.
 * Usa el registro histórico de interacciones, no el estado JOINED actual como métrica pasada.
 */
interface ActivityCounts { viewed: number; joined: number; left: number; legacyEvents: number }

export function countActivityInteractions(campusId: string | string[], from: Date, until: Date, userIds?: string[]): Promise<ActivityCounts>;

export function countActivityInteractions(campusId: string | string[], from: Date, until: Date, userIds: string[] | undefined, windows: AnalyticsWindow[], grouping: DashboardGrouping): Promise<ActivityCounts & { intervals: (ActivityCounts & { key: string })[] }>;

export async function countActivityInteractions(campusId: string | string[], from: Date, until: Date, userIds?: string[], windows?: AnalyticsWindow[], grouping: DashboardGrouping = 'month') {
  const campusIds = typeof campusId === 'string' ? [campusId] : campusId;
  if (!campusIds.length || campusIds.some(id => !id) || !Number.isFinite(from.getTime()) || !Number.isFinite(until.getTime()) || until <= from) throw new Error('Invalid metric scope.');
  const { getMongoDB: getMongoDb } = await import('../../../database/mongodb/client.js');
  const group = { $group: { _id: '$type', count: { $sum: 1 }, legacy: { $sum: { $cond: [{ $eq: ['$provenance', 'LEGACY_STATE'] }, 1, 0] } } } };
  const pipeline = [
    { $match: { campusId: typeof campusId === 'string' ? campusId : { $in: campusIds }, ...(userIds ? { userId: { $in: userIds } } : {}),
      occurredAt: { $gte: from, $lt: until }, type: { $in: ['VIEWED', 'JOINED', 'LEFT'] } } },
    ...(windows ? [{ $facet: { total: [group], periods: [{ $group: { ...group.$group,
      _id: { type: '$type', period: { $dateToString: { format: '%Y-%m-%d', timezone: ANALYTICS_TIME_ZONE,
        date: { $dateTrunc: { date: '$occurredAt', unit: grouping, timezone: ANALYTICS_TIME_ZONE, ...(grouping === 'week' ? { startOfWeek: 'monday' } : {}) } } } } },
    } }] } }] : [group]),
  ];
  type Count = { _id: string; count: number; legacy: number };
  type PeriodCount = Omit<Count, '_id'> & { _id: { type: string; period: string } };
  const counts = await getMongoDb().collection('activity_interactions').aggregate<Count | { total: Count[]; periods: PeriodCount[] }>(pipeline).toArray();
  const summarize = (counts: Count[]) => ({ viewed: counts.find(row => row._id === 'VIEWED')?.count ?? 0,
    joined: counts.find(row => row._id === 'JOINED')?.count ?? 0, left: counts.find(row => row._id === 'LEFT')?.count ?? 0,
    legacyEvents: counts.reduce((total, row) => total + row.legacy, 0) });
  if (!windows) return summarize(counts as Count[]);
  const result = counts[0] as { total: Count[]; periods: PeriodCount[] } | undefined;
  return { ...summarize(result?.total ?? []), intervals: windows.map(window => ({ key: window.key,
    ...summarize((result?.periods ?? []).filter(row => row._id.period === window.key).map(row => ({ ...row, _id: row._id.type }))) })) };
}
