import type { Activity, ActivityDetail } from './activity';
import type { CreateActivityInput } from './creation';

export interface ActivityRecurrenceRule {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'; interval: number; until: string; timeZone: string; excludedDates: string[];
}
export interface CreateActivitySeriesInput extends CreateActivityInput { recurrence: ActivityRecurrenceRule; previewHash?: string }
export interface ActivityRecurrencePreview {
  campusId: string; type: Activity['type']; previewHash: string; recurrence: ActivityRecurrenceRule;
  occurrences: { index: number; startAt: string; endAt: string }[];
  skipped: { date: string; reason: 'INVALID_MONTH_DAY' | 'EXCLUDED' }[];
}
export interface ActivitySeries {
  id: string; campusId: string; title: string; description: string; type: Activity['type']; recurrence: ActivityRecurrenceRule;
  occurrenceCount: number; occurrences: Activity[];
}
export interface CreatedActivitySeries { series: ActivitySeries; firstOccurrence: ActivityDetail }
export const RECURRENCE_LABELS = { DAILY: 'Diaria', WEEKLY: 'Semanal', MONTHLY: 'Mensual' };

/** A calendar date has no UTC offset. Validate independently of midnight DST transitions. */
export function activityCalendarDate(text: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const [, day, month, year] = match.map(Number); const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1000 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
}

export function recurrenceDraftRule(frequency: ActivityRecurrenceRule['frequency'], intervalText: string, untilText: string,
  exclusionsText: string, timeZone: string): { rule: ActivityRecurrenceRule; error?: never } | { error: string; rule?: never } {
  const until = activityCalendarDate(untilText); const interval = Number(intervalText);
  if (!/^[0-9]{1,2}$/.test(intervalText) || !Number.isInteger(interval) || interval < 1 || interval > 52) return { error: 'El intervalo debe estar entre 1 y 52.' };
  if (!until) return { error: 'Completa la fecha final con DD/MM/AAAA.' };
  if (!timeZone) return { error: 'No se pudo identificar la zona horaria del dispositivo.' };
  const dates = exclusionsText.trim() ? exclusionsText.split(/[,\n]/).map(value => activityCalendarDate(value)) : [];
  if (dates.some(value => !value) || dates.length > 200 || new Set(dates).size !== dates.length) return { error: 'Las exclusiones deben ser fechas válidas distintas, separadas por comas.' };
  return { rule: { frequency, interval, until, timeZone, excludedDates: (dates as string[]).sort() } };
}
