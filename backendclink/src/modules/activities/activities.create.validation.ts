import type { RequestParser, ValidationResult, ApiErrorDetail } from '../../types/api.js';
import type { CreateActivityInput } from './activities.types.js';

export const ACTIVITY_CONTENT_LIMITS = { title: 120, description: 2000, customLabel: 160 } as const;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** ISO UTC timestamps only: reject Date normalization of nonexistent calendar dates. */
function timestamp(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value.replace(/Z$/, value.includes('.') ? 'Z' : '.000Z') ? date : null;
}

export const parseCreateActivity: RequestParser = (input: unknown): ValidationResult<CreateActivityInput> => {
  const issues: ApiErrorDetail[] = [];
  if (!record(input)) return { success: false, issues: [{ field: 'body', message: 'An activity object is required.' }] };
  const allowed = ['title', 'description', 'startAt', 'endAt', 'location'];
  for (const key of Object.keys(input)) if (!allowed.includes(key)) issues.push({ field: key, message: 'Unsupported activity field.' });
  const text = (value: unknown, field: keyof typeof ACTIVITY_CONTENT_LIMITS, optional = false): string => {
    if (optional && value === undefined) return '';
    const result = typeof value === 'string' ? value.trim() : '';
    const controls = field === 'description' ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/ : /[\u0000-\u001F\u007F]/;
    if (!result || typeof value !== 'string' || value.length > ACTIVITY_CONTENT_LIMITS[field] || controls.test(value)) {
      issues.push({ field, message: `Text between 1 and ${ACTIVITY_CONTENT_LIMITS[field]} characters is required.` });
    }
    return result;
  };
  const title = text(input.title, 'title'); const description = text(input.description, 'description');
  const startAt = timestamp(input.startAt); const endAt = timestamp(input.endAt);
  if (!startAt) issues.push({ field: 'startAt', message: 'A valid UTC ISO timestamp is required.' });
  if (!endAt) issues.push({ field: 'endAt', message: 'A valid UTC ISO timestamp is required.' });
  if (startAt && endAt && endAt <= startAt) issues.push({ field: 'endAt', message: 'End must be after start.' });
  const location = record(input.location) ? input.location : {};
  if (!record(input.location)) issues.push({ field: 'location', message: 'A building and floor are required.' });
  for (const key of Object.keys(location)) if (!['buildingKey', 'floorKey', 'poiKey', 'customLabel'].includes(key)) {
    issues.push({ field: `location.${key}`, message: 'Unsupported location field.' });
  }
  for (const key of ['buildingKey', 'floorKey', 'poiKey'] as const) {
    if (key === 'poiKey' && location[key] === undefined) continue;
    if (typeof location[key] !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(location[key] as string)) {
      issues.push({ field: `location.${key}`, message: 'A valid domain location ID is required.' });
    }
  }
  const customLabel = text(location.customLabel, 'customLabel', true);
  return issues.length ? { success: false, issues } : { success: true, data: {
    title, description, startAt: startAt!, endAt: endAt!, location: {
      buildingKey: location.buildingKey as string, floorKey: location.floorKey as string,
      ...(location.poiKey !== undefined ? { poiKey: location.poiKey as string } : {}),
      ...(customLabel ? { customLabel } : {}),
    },
  } };
};
