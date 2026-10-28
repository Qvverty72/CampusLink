import type { AnalyticalReport } from './analytics.types.js';

/** Vocabulario de presentación; pruebas lo contrastan con ANALYTICS_COPY del cliente. */
export const REPORT_KPIS = {
  activeUsers: { title: 'Cuentas activas', help: 'Cuentas con estado activo al cierre del período, según la auditoría disponible: no son personas conectadas ni inicios de sesión. Es un saldo y no se suma entre períodos.' },
  resourceDemand: { title: 'Recursos vistos y pedidos', help: 'Suma de vistas y solicitudes de recursos durante el período; no son recursos únicos. Vistas y solicitudes se muestran por separado.' },
  subjectDemand: { title: 'Interés por asignaturas', help: 'Vistas y solicitudes de recursos asociados a asignaturas. Un recurso puede contar en varias: los resultados por asignatura no son conjuntos exclusivos.' },
  activityParticipation: { title: 'Inscripciones a actividades', help: 'Inscripciones históricas registradas, incluidas reinscripciones y el creador según las reglas vigentes; no es asistencia presencial ni participantes actuales. Un retiro posterior no borra la inscripción histórica.' },
} as const;
export const REPORT_STATES: Record<string, string> = {
  partial: 'Captura histórica parcial: no se garantiza que estén todos los registros',
  summary: 'Resumen de todo el período', recorded: 'Registrado', unavailable: 'No disponible', no_activity: 'Sin actividad en el período',
};
export const reportPeriodLabel = (period: { from: string; to: string }) => {
  const date = (value: string) => new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
  return `${date(period.from)} - ${date(period.to)}`;
};
export const reportSavedLabel = (report: AnalyticalReport) => new Intl.DateTimeFormat('es-CL', {
  timeZone: report.period.timeZone, dateStyle: 'long', timeStyle: 'medium', hourCycle: 'h23',
}).format(new Date(report.generatedAt));

/** Único propietario del nombre; sólo ASCII seguro para Content-Disposition y sistemas de archivos. */
export function reportFilename(report: AnalyticalReport, format: 'pdf' | 'xlsx'): string {
  const slug = report.scope.campuses.length > 1 ? 'multi-campus' : report.scope.campuses[0]?.name ?? 'campus';
  const safe = slug.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'campus';
  const prefix = `CampusLink_Reporte_${report.grouping === 'week' ? 'Semanal' : 'Mensual'}_${report.period.from}_${report.period.to}_`;
  const suffix = `_${report.id.slice(0, 8)}.${format}`;
  return `${prefix}${safe.slice(0, 120 - prefix.length - suffix.length)}${suffix}`;
}
