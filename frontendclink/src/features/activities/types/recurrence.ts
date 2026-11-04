import type { Activity, ActivityDetail } from './activity';
import type { CreateActivityInput } from './creation';

export interface ActivityRecurrenceRule {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'; interval: number; until: string; timeZone: string; excludedDates: string[]; weekdays?: number[];
}
/** El formulario conserva fechas de calendario local hasta validar el contrato de API. */
export interface ActivityRecurrenceDraft {
  enabled: boolean; frequency: ActivityRecurrenceRule['frequency']; interval: string; until: string; excludedDates: string; weekdays?: number[];
}
export const RECURRENCE_WEEKDAYS = [
  { value: 1, short: 'Lun', name: 'lunes' }, { value: 2, short: 'Mar', name: 'martes' },
  { value: 3, short: 'Mié', name: 'miércoles' }, { value: 4, short: 'Jue', name: 'jueves' },
  { value: 5, short: 'Vie', name: 'viernes' }, { value: 6, short: 'Sáb', name: 'sábados' }, { value: 7, short: 'Dom', name: 'domingos' },
] as const;
/** Devuelve los nombres locales de los días elegidos para mostrar un resumen. */
const joinDays = (weekdays: number[]) => {
  const names = RECURRENCE_WEEKDAYS.filter(day => weekdays.includes(day.value)).map(day => day.name);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : names[0] ?? 'días por elegir';
};
/** Devuelve el día ISO de semana (lunes=1) de una fecha local validada. */
export function recurrenceStartWeekday(startDate: string): number | null {
  const date = activityCalendarDate(startDate);
  return date ? new Date(`${date}T12:00:00Z`).getUTCDay() || 7 : null;
}
/** Formatea una fecha local para texto sin desplazarla por la zona del dispositivo. */
export function recurrenceDateLabel(date: string): string {
  const iso = activityCalendarDate(date);
  return iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-CL', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }) : date;
}
/** Resume frecuencia, intervalo y días semanales seleccionados. */
export function recurrenceSummary(value: ActivityRecurrenceDraft): string {
  if (!value.enabled) return 'Nunca';
  if (value.frequency === 'WEEKLY' && value.weekdays) {
    return value.interval === '1' ? `Los ${joinDays(value.weekdays)}` : `Los ${joinDays(value.weekdays)} cada ${value.interval} semanas`;
  }
  const units = { DAILY: ['día', 'días'], WEEKLY: ['semana', 'semanas'], MONTHLY: ['mes', 'meses'] }[value.frequency];
  return value.interval === '1' ? `Cada ${units[0]}` : `Cada ${value.interval || '…'} ${units[1]}`;
}
/** Explica el patrón y, si existe, el rango y el número de ocurrencias previstas. */
export function recurrenceDescription(value: ActivityRecurrenceDraft, startDate: string, count?: number): string {
  if (!value.enabled) return 'Esta actividad se realizará una sola vez.';
  const pattern = value.frequency === 'DAILY' && value.interval === '1' ? 'todos los días'
    : value.frequency === 'WEEKLY' && value.weekdays ? `${value.interval === '1' ? 'todos ' : ''}${recurrenceSummary(value).toLocaleLowerCase()}`
      : value.frequency === 'MONTHLY' && value.interval === '1' ? 'una vez al mes' : recurrenceSummary(value).toLocaleLowerCase();
  const range = activityCalendarDate(startDate) && activityCalendarDate(value.until)
    ? `, desde el ${recurrenceDateLabel(startDate)} hasta el ${recurrenceDateLabel(value.until)}` : '';
  return `Esta actividad se hará ${pattern}${range}.${count === undefined ? '' : ` ${count === 1 ? 'Se creará 1 actividad' : `Son ${count} actividades`}.`}`;
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

/** Valida una fecha civil sin zona horaria, independiente de cambios DST a medianoche. */
export function activityCalendarDate(text: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const [, day, month, year] = match.map(Number); const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1000 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
}

/** Normaliza los campos del formulario y valida intervalo, zona, días y exclusiones. */
export function recurrenceDraftRule(frequency: ActivityRecurrenceRule['frequency'], intervalText: string, untilText: string,
  exclusionsText: string, timeZone: string, weekdays?: number[]): { rule: ActivityRecurrenceRule; error?: never } | { error: string; rule?: never } {
  const until = activityCalendarDate(untilText); const interval = Number(intervalText);
  if (!/^[0-9]{1,2}$/.test(intervalText) || !Number.isInteger(interval) || interval < 1 || interval > 52) return { error: 'El intervalo debe estar entre 1 y 52.' };
  if (!until) return { error: 'Completa la fecha final con DD/MM/AAAA.' };
  if (!timeZone) return { error: 'No se pudo identificar la zona horaria del dispositivo.' };
  if (weekdays !== undefined && (frequency !== 'WEEKLY' || weekdays.length < 1 || weekdays.length > 7
    || weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7) || new Set(weekdays).size !== weekdays.length)) {
    return { error: 'Selecciona al menos un día de la semana, sin repetir días.' };
  }
  const dates = exclusionsText.trim() ? exclusionsText.split(/[,\n]/).map(value => activityCalendarDate(value)) : [];
  if (dates.some(value => !value) || dates.length > 200 || new Set(dates).size !== dates.length) return { error: 'Las exclusiones deben ser fechas válidas distintas, separadas por comas.' };
  return { rule: { frequency, interval, until, timeZone, excludedDates: (dates as string[]).sort(),
    ...(weekdays !== undefined ? { weekdays: [...weekdays].sort((a, b) => a - b) } : {}) } };
}
