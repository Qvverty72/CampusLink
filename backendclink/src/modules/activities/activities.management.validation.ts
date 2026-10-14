import type { RequestParser, ApiErrorDetail } from '../../types/api.js';

/** Acepta únicamente página y tamaño de página, con topes para mantener acotada la consulta. */
export const parseActivityParticipantsQuery: RequestParser = input => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { success: false, issues: [{ field: 'query', message: 'Invalid pagination.' }] };
  }
  const query = input as Record<string, unknown>;
  const issues: ApiErrorDetail[] = [];
  const data = { page: 1, pageSize: 5 };
  for (const key of Object.keys(query)) {
    if (key !== 'page' && key !== 'pageSize') issues.push({ field: key, message: 'Unsupported participant filter.' });
  }
  for (const key of ['page', 'pageSize'] as const) {
    if (query[key] === undefined) continue;
    const value = query[key];
    const max = key === 'page' ? 100000 : 20;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) {
      issues.push({ field: key, message: `An integer from 1 to ${max} is required.` });
    } else data[key] = Number(value);
  }
  return issues.length ? { success: false, issues } : { success: true, data };
};

/** Exige solo la revisión esperada para que la retirada no borre una versión distinta. */
export const parseActivityDeletion: RequestParser = input => {
  const body = typeof input === 'object' && input !== null && !Array.isArray(input) ? input as Record<string, unknown> : null;
  return body && Object.keys(body).length === 1 && Number.isSafeInteger(body.expectedRevision)
    && (body.expectedRevision as number) >= 0 && (body.expectedRevision as number) < Number.MAX_SAFE_INTEGER
    ? { success: true, data: { expectedRevision: body.expectedRevision } }
    : { success: false, issues: [{ field: 'expectedRevision', message: 'Only a valid expected revision is accepted.' }] };
};
