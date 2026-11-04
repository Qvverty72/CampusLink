import { Temporal } from '@js-temporal/polyfill';
import { ApiError } from '../../../shared/errors/api-error.js';
import type { DashboardGrouping, DashboardPeriod } from '../types/analytics.types.js';

// Referencia institucional confirmada por el usuario en GH-99.
export const ANALYTICS_TIME_ZONE = 'America/Santiago';
export const MAX_DASHBOARD_INTERVALS = 260;
export interface AnalyticsWindow { key: string; from: Date; until: Date }
export interface AnalyticsInterval extends AnalyticsWindow { label: string; period: DashboardPeriod }

/** Intervalos calendario; extremos recortados al rango, todos semiabiertos. */
export function dashboardIntervals(from: string, to: string, grouping: DashboardGrouping): AnalyticsInterval[] {
  const first = Temporal.PlainDate.from(from), last = Temporal.PlainDate.from(to);
  let cursor = grouping === 'week' ? first.subtract({ days: first.dayOfWeek - 1 }) : first.with({ day: 1 });
  const intervals: AnalyticsInterval[] = [];
  while (Temporal.PlainDate.compare(cursor, last) <= 0) {
    if (intervals.length === MAX_DASHBOARD_INTERVALS) {
      throw new ApiError(400, 'VALIDATION_ERROR', `Selecciona un rango de hasta ${MAX_DASHBOARD_INTERVALS} intervalos.`);
    }
    const next = cursor.add(grouping === 'week' ? { weeks: 1 } : { months: 1 });
    const start = Temporal.PlainDate.compare(cursor, first) < 0 ? first : cursor;
    const end = Temporal.PlainDate.compare(next, last.add({ days: 1 })) > 0 ? last.add({ days: 1 }) : next;
    const key = cursor.toString();
    const begin = new Date(start.toZonedDateTime(ANALYTICS_TIME_ZONE).epochMilliseconds);
    const until = new Date(end.toZonedDateTime(ANALYTICS_TIME_ZONE).epochMilliseconds);
    intervals.push({ key, label: grouping === 'week' ? `Semana del ${key}` : `Mes ${key.slice(0, 7)}`,
      from: begin, until, period: { from: start.toString(), to: end.subtract({ days: 1 }).toString(), timeZone: ANALYTICS_TIME_ZONE, cutoff: until.toISOString() } });
    cursor = next;
  }
  return intervals;
}
