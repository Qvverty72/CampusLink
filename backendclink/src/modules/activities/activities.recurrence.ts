import { Temporal } from '@js-temporal/polyfill';
import { createHash } from 'node:crypto';
import { ApiError } from '../../services/apiError.js';
import type { ActivityRecurrencePreview, CreateActivitySeriesInput, ActivityType } from './activities.types.js';

export const RECURRENCE_LIMITS = { occurrences: 200, interval: 52, years: 2 } as const;

/** Calendar steps keep start/end wall clocks, including multi-day occurrences, in the saved IANA zone. */
export function expandActivityRecurrence(input: CreateActivitySeriesInput, campusId: string, type: ActivityType,
  now: Date): ActivityRecurrencePreview {
  const rule = input.recurrence;
  const start = Temporal.Instant.from(input.startAt.toISOString()).toZonedDateTimeISO(rule.timeZone);
  const end = Temporal.Instant.from(input.endAt.toISOString()).toZonedDateTimeISO(rule.timeZone);
  const firstDate = start.toPlainDate(); const until = Temporal.PlainDate.from(rule.until);
  if (Temporal.PlainDate.compare(until, firstDate) < 0 || Temporal.PlainDate.compare(until, firstDate.add({ years: RECURRENCE_LIMITS.years })) > 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'La fecha final debe estar entre el inicio y los próximos dos años.');
  }
  const daySpan = firstDate.until(end.toPlainDate()).days;
  const occurrences: ActivityRecurrencePreview['occurrences'] = []; const skipped: ActivityRecurrencePreview['skipped'] = [];
  const exclusions = new Set(rule.excludedDates); const candidateDates = new Set<string>();
  const inZone = (date: Temporal.PlainDate, clock: Temporal.PlainTime) => date.toPlainDateTime(clock)
    .toZonedDateTime(rule.timeZone, { disambiguation: 'reject' });
  for (let period = 0; period <= 732; period++) {
    let date: Temporal.PlainDate;
    if (rule.frequency === 'MONTHLY') {
      const month = firstDate.toPlainYearMonth().add({ months: period * rule.interval });
      const requested = `${month.toString()}-${String(firstDate.day).padStart(2, '0')}`;
      const comparison = Temporal.PlainYearMonth.compare(month, until.toPlainYearMonth());
      if (comparison > 0 || (comparison === 0 && firstDate.day > until.day)) break;
      if (firstDate.day > month.daysInMonth) { skipped.push({ date: requested, reason: 'INVALID_MONTH_DAY' }); continue; }
      date = month.toPlainDate({ day: firstDate.day });
    } else {
      date = firstDate.add(rule.frequency === 'DAILY' ? { days: period * rule.interval } : { weeks: period * rule.interval });
      if (Temporal.PlainDate.compare(date, until) > 0) break;
    }
    candidateDates.add(date.toString());
    if (exclusions.has(date.toString())) { skipped.push({ date: date.toString(), reason: 'EXCLUDED' }); continue; }
    let occurrenceStart: Temporal.ZonedDateTime; let occurrenceEnd: Temporal.ZonedDateTime;
    try {
      occurrenceStart = inZone(date, start.toPlainTime()); occurrenceEnd = inZone(date.add({ days: daySpan }), end.toPlainTime());
    } catch {
      throw new ApiError(400, 'VALIDATION_ERROR', `La hora del ${date.toString()} no existe o es ambigua en ${rule.timeZone}. Cambia la hora o excluye esa fecha.`);
    }
    if (occurrenceEnd.epochMilliseconds <= occurrenceStart.epochMilliseconds || occurrenceEnd.epochMilliseconds <= now.getTime()) {
      throw new ApiError(400, 'VALIDATION_ERROR', `La ocurrencia del ${date.toString()} debe terminar después de su inicio y seguir vigente.`);
    }
    occurrences.push({ index: occurrences.length + 1, startAt: new Date(occurrenceStart.epochMilliseconds).toISOString(),
      endAt: new Date(occurrenceEnd.epochMilliseconds).toISOString() });
    if (occurrences.length > RECURRENCE_LIMITS.occurrences) throw new ApiError(400, 'VALIDATION_ERROR', 'La serie admite hasta 200 ocurrencias. Reduce la vigencia o aumenta el intervalo.');
  }
  if (!occurrences.length) throw new ApiError(400, 'VALIDATION_ERROR', 'La regla debe generar al menos una ocurrencia no excluida.');
  if (rule.excludedDates.some(date => !candidateDates.has(date))) throw new ApiError(400, 'VALIDATION_ERROR', 'Cada fecha excluida debe coincidir con un inicio de la regla.');
  const fingerprint = { campusId, type, title: input.title, description: input.description, startAt: input.startAt.toISOString(),
    endAt: input.endAt.toISOString(), location: input.location, recurrence: rule, occurrences, skipped };
  return { campusId, type, recurrence: rule, occurrences, skipped,
    previewHash: createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex') };
}
