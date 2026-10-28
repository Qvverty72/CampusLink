import { formatPickerValue, pickerDate } from '@/features/activities/types/dateTime';

export interface AuditDateRange { from: string; to: string }
export const EMPTY_AUDIT_DATES: AuditDateRange = { from: '', to: '' };

function civilDate(value: string) {
  if (!value) return null;
  const date = pickerDate(value, 'date');
  return formatPickerValue(date, 'date') === value ? date : null;
}

export function auditDateRangeError(range: AuditDateRange): string {
  const from = civilDate(range.from), to = civilDate(range.to);
  if ((range.from && !from) || (range.to && !to)) return 'Selecciona fechas válidas.';
  if (from && to && from > to) return 'La fecha Desde debe ser anterior o igual a Hasta.';
  return '';
}

/** Días completos en la misma zona local que muestra el historial, incluso con cambios de horario. */
export function auditDateBounds(range: AuditDateRange) {
  const error = auditDateRangeError(range);
  if (error) throw new Error(error);
  const from = civilDate(range.from), to = civilDate(range.to);
  return {
    from: from ? new Date(from.getFullYear(), from.getMonth(), from.getDate()).toISOString() : undefined,
    before: to ? new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1).toISOString() : undefined,
  };
}

export function auditDateRangeLabel(range: AuditDateRange) {
  if (range.from && range.to) return range.from === range.to ? range.from : `${range.from} – ${range.to}`;
  if (range.from) return `Desde ${range.from}`;
  if (range.to) return `Hasta ${range.to}`;
  return 'Todas las fechas';
}
