import { Temporal } from '@js-temporal/polyfill';
import type { RequestParser, ValidationResult, ApiErrorDetail } from '../../types/api.js';
import { parseCreateActivity } from './activities.create.validation.js';
import { RECURRENCE_LIMITS } from './activities.recurrence.js';
import type { ActivityRecurrenceRule, CreateActivitySeriesInput, CreateActivityInput } from './activities.types.js';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const calendarDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try { return Temporal.PlainDate.from(value).toString() === value; } catch { return false; }
};

/** Valida la regla civil, fechas excluidas y zona horaria sin aceptar campos adicionales. */
export function parseRecurrenceRule(value: unknown): ValidationResult<ActivityRecurrenceRule> {
  const issues: ApiErrorDetail[] = [];
  if (!record(value)) return { success: false, issues: [{ field: 'recurrence', message: 'Define la regla de repetición.' }] };
  for (const key of Object.keys(value)) if (!['frequency', 'interval', 'until', 'timeZone', 'excludedDates', 'weekdays'].includes(key)) issues.push({ field: `recurrence.${key}`, message: 'Campo de recurrencia no admitido.' });
  if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(value.frequency as string)) issues.push({ field: 'recurrence.frequency', message: 'Frecuencia diaria, semanal o mensual requerida.' });
  if (!Number.isInteger(value.interval) || (value.interval as number) < 1 || (value.interval as number) > RECURRENCE_LIMITS.interval) issues.push({ field: 'recurrence.interval', message: 'Intervalo entero entre 1 y 52 requerido.' });
  if (!calendarDate(value.until)) issues.push({ field: 'recurrence.until', message: 'Fecha final YYYY-MM-DD válida requerida.' });
  try {
    if (typeof value.timeZone !== 'string' || value.timeZone.length > 100 || !/^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+)$/.test(value.timeZone)) throw new Error();
    Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(value.timeZone);
  } catch { issues.push({ field: 'recurrence.timeZone', message: 'Zona horaria IANA válida requerida.' }); }
  const excludedDates = value.excludedDates ?? [];
  const weekdays = value.weekdays;
  if (weekdays !== undefined && (value.frequency !== 'WEEKLY' || !Array.isArray(weekdays) || weekdays.length < 1 || weekdays.length > 7
    || weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7) || new Set(weekdays).size !== weekdays.length)) {
    issues.push({ field: 'recurrence.weekdays', message: 'Selecciona días semanales distintos del 1 (lunes) al 7 (domingo).' });
  }
  if (!Array.isArray(excludedDates) || excludedDates.length > RECURRENCE_LIMITS.occurrences || excludedDates.some(date => !calendarDate(date))
    || new Set(excludedDates).size !== excludedDates.length) issues.push({ field: 'recurrence.excludedDates', message: 'Usa hasta 200 fechas válidas distintas.' });
  return issues.length ? { success: false, issues } : { success: true, data: { frequency: value.frequency as ActivityRecurrenceRule['frequency'],
    interval: value.interval as number, until: value.until as string, timeZone: value.timeZone as string, excludedDates: [...excludedDates as string[]].sort(),
    ...(weekdays !== undefined ? { weekdays: [...weekdays as number[]].sort((a, b) => a - b) } : {}) } };
}

/** Crea el validador de vista previa o publicación; publicar exige el hash generado en la vista previa. */
export function activitySeriesParser(publish = false): RequestParser {
  return (input: unknown): ValidationResult<CreateActivitySeriesInput> => {
    if (!record(input)) return { success: false, issues: [{ field: 'body', message: 'Define la actividad recurrente.' }] };
    const { recurrence, previewHash, ...base } = input;
    const activity = parseCreateActivity(base); const rule = parseRecurrenceRule(recurrence);
    const issues = [...(!activity.success ? activity.issues : []), ...(!rule.success ? rule.issues : [])];
    if (publish ? typeof previewHash !== 'string' || !/^[0-9a-f]{64}$/.test(previewHash) : previewHash !== undefined) {
      issues.push({ field: 'previewHash', message: publish ? 'Revisa la vista previa antes de publicar.' : 'La vista previa no admite confirmaciones previas.' });
    }
    return issues.length ? { success: false, issues } : { success: true, data: { ...(activity as { data: CreateActivityInput }).data,
      recurrence: (rule as { data: ActivityRecurrenceRule }).data, ...(publish ? { previewHash: previewHash as string } : {}) } };
  };
}

export const parseSeriesId: RequestParser = (input: unknown) => {
  const id = record(input) ? input.seriesId : undefined;
  return typeof id === 'string' && /^[0-9a-f]{24}$/i.test(id) ? { success: true, data: { seriesId: id.toLowerCase() } }
    : { success: false, issues: [{ field: 'seriesId', message: 'ID de serie válido requerido.' }] };
};
