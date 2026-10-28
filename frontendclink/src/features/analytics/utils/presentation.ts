import type { DashboardGrouping, DashboardPeriod, HistoricalReportSummary } from '../types/dashboard';

export const ANALYTICS_ZONE = 'America/Santiago';
export const formatNumber = (value: number | null) => value === null ? 'Sin datos' : new Intl.NumberFormat('es-CL').format(value);

/** Las fechas civiles se formatean sin pasar por la zona horaria del dispositivo. */
export function validCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1000 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function dateLabel(value: string): string {
  if (!validCivilDate(value)) return value;
  return new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`));
}

export const periodLabel = (period: Pick<DashboardPeriod, 'from' | 'to'>) => `${dateLabel(period.from)} — ${dateLabel(period.to)}`;
/** Etiqueta compacta; el detalle conserva fechas completas. Siempre interpreta fechas civiles en UTC. */
export function compactPeriodLabel(period: Pick<DashboardPeriod, 'from' | 'to'>): string {
  const { from, to } = period;
  if (!validCivilDate(from) || !validCivilDate(to) || from.slice(0, 4) !== to.slice(0, 4)) return periodLabel(period);
  const label = (value: string) => new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00Z`));
  if (from === to) return label(from);
  return from.slice(0, 7) === to.slice(0, 7) ? `${Number(from.slice(-2))}–${label(to)}` : `${label(from)}–${label(to)}`;
}
export const groupingLabel = (value?: DashboardGrouping) => value === 'week' ? 'Semanal · lunes a domingo' : 'Mensual';
/** La cabecera de un reporte histórico siempre conserva el año. */
export function savedReportPeriodLabel(period: Pick<DashboardPeriod, 'from' | 'to'>): string {
  return validCivilDate(period.from) && validCivilDate(period.to) && period.from.slice(0, 4) === period.to.slice(0, 4)
    ? `${compactPeriodLabel(period)} ${period.to.slice(0, 4)}` : periodLabel(period);
}
export function savedReportTimeLabel(value: string, timeZone: string, now = new Date()): string {
  const saved = new Date(value);
  if (!Number.isFinite(saved.getTime())) return value || 'No registrado';
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = Number.isFinite(now.getTime()) && day.format(saved) === day.format(now);
  const time = new Intl.DateTimeFormat('es-CL', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(saved);
  const date = new Intl.DateTimeFormat('es-CL', { timeZone, day: 'numeric', month: 'short', year: 'numeric' }).format(saved);
  return `${today ? 'Hoy' : date} ${time}`;
}
export function savedReportListTimeLabel(value: string, timeZone: string, now = new Date()): string {
  const saved = new Date(value);
  if (!Number.isFinite(saved.getTime())) return value || 'No registrado';
  const year = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric' });
  return new Intl.DateTimeFormat('es-CL', { timeZone, day: 'numeric', month: 'short',
    year: year.format(saved) === year.format(now) ? undefined : 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(saved);
}
export const shortGroupingLabel = (value: DashboardGrouping) => value === 'week' ? 'Semanal' : 'Mensual';
export const savedReportLabel = (report: HistoricalReportSummary, position?: number) =>
  `${position ? `reporte ${position}, ` : 'reporte '}${shortGroupingLabel(report.grouping).toLocaleLowerCase('es')}, período ${periodLabel(report.period)}, ${report.scope.campusName}, guardado el ${savedTimestampLabel(report.generatedAt, report.period.timeZone)}`;
export function savedTimestampLabel(value: string, timeZone: string): string {
  if (!Number.isFinite(new Date(value).getTime())) return value || 'No registrado';
  return new Intl.DateTimeFormat('es-CL', { timeZone, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}
export const pickerValue = (value: string) => validCivilDate(value) ? value.split('-').reverse().join('/') : '';
export const civilValue = (value: string) => {
  const civil = /^\d{2}\/\d{2}\/\d{4}$/.test(value) ? value.split('/').reverse().join('-') : '';
  return validCivilDate(civil) ? civil : '';
};

export function timestampLabel(value: string, timeZone = ANALYTICS_ZONE): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value || 'No registrado';
  return new Intl.DateTimeFormat('es-CL', { timeZone, dateStyle: 'medium', timeStyle: 'medium', hourCycle: 'h23' }).format(date);
}

export function monthRange(previous = false, now = new Date()) {
  const civil = new Intl.DateTimeFormat('sv-SE', { timeZone: ANALYTICS_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  if (!previous) return { from: `${civil.slice(0, 7)}-01`, to: civil };
  const [year, month] = civil.split('-').map(Number);
  const end = new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
  return { from: `${end.slice(0, 7)}-01`, to: end };
}

export function rangeError(from: string, to: string, optional = false): string {
  if ((!optional || from) && !validCivilDate(from)) return 'Selecciona una fecha inicial válida.';
  if ((!optional || to) && !validCivilDate(to)) return 'Selecciona una fecha final válida.';
  if (from && to && from > to) return 'La fecha inicial debe ser anterior o igual a la final.';
  return '';
}
