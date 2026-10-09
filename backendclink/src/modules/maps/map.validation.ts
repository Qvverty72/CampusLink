import type { RequestParser, ValidationResult } from '../../types/api.js';
import { UUID_PATTERN } from '../../services/references.js';

export interface ActiveMapRouteParams {
  campusId: string;
}

export const parseActiveMapParams: RequestParser = (
  input: unknown,
): ValidationResult<ActiveMapRouteParams> => {
  const params = typeof input === 'object' && input !== null
    ? input as Record<string, unknown>
    : {};
  const campusId = typeof params.campusId === 'string'
    ? params.campusId.trim()
    : '';

  if (!UUID_PATTERN.test(campusId)) {
    return {
      success: false,
      issues: [{ field: 'campusId', message: 'campusId must be a valid UUID.' }],
    };
  }

  return { success: true, data: { campusId } };
};
