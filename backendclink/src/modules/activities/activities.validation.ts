import type { RequestParser, ValidationResult, ApiErrorDetail } from '../../types/api.js';
import type { ActivityQuery } from './activities.types.js';

/** Only spatial filters are accepted. Campus and visibility come from server policy. */
export const parseActivityQuery: RequestParser = (input: unknown): ValidationResult<ActivityQuery> => {
  const query = typeof input === 'object' && input !== null
    ? input as Record<string, unknown> : {};
  const issues: ApiErrorDetail[] = [];
  const data: ActivityQuery = {};
  const keys = ['buildingKey', 'floorKey', 'poiKey'] as const;
  for (const key of Object.keys(query)) {
    if (!keys.includes(key as typeof keys[number])) {
      issues.push({ field: key, message: 'Unsupported activity filter.' });
    }
  }
  for (const key of keys) {
    if (query[key] === undefined) continue;
    const value = query[key];
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
      issues.push({ field: key, message: 'A valid spatial key is required.' });
    } else data[key] = value;
  }
  if (data.floorKey && !data.buildingKey) {
    issues.push({ field: 'buildingKey', message: 'A floor filter requires its building.' });
  }
  if (data.poiKey && !data.floorKey) {
    issues.push({ field: 'floorKey', message: 'A POI filter requires its floor.' });
  }
  return issues.length ? { success: false, issues } : { success: true, data };
};
