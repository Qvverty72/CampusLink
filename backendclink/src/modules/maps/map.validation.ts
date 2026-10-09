import type { RequestParser, ValidationResult } from '../../types/api.js';

export interface ActiveMapRouteParams {
  campusId: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
