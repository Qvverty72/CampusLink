import type { RequestParser, ValidationResult, ApiErrorDetail } from '../../types/api.js';
import { parseCreateActivity } from './activities.create.validation.js';
import type { CreateActivityInput } from './activities.types.js';
import type { EditActivityInput } from './activities.edit.types.js';

export function editActivityParser(save = false): RequestParser {
  return (input: unknown): ValidationResult<EditActivityInput> => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { success: false, issues: [{ field: 'body', message: 'Define los cambios de la actividad.' }] };
    const { scope, expectedRevision, previewHash, ...fields } = input as Record<string, unknown>;
    const base = parseCreateActivity(fields); const issues: ApiErrorDetail[] = base.success ? [] : [...base.issues];
    if (!['ONE', 'UPCOMING'].includes(scope as string)) issues.push({ field: 'scope', message: 'Elige esta ocurrencia o esta y las próximas.' });
    if (!Number.isSafeInteger(expectedRevision) || (expectedRevision as number) < 0) issues.push({ field: 'expectedRevision', message: 'Vuelve a cargar la ficha antes de editar.' });
    if (save ? typeof previewHash !== 'string' || !/^[0-9a-f]{64}$/.test(previewHash) : previewHash !== undefined) {
      issues.push({ field: 'previewHash', message: 'Revisa una vista previa actual antes de guardar.' });
    }
    return issues.length ? { success: false, issues } : { success: true, data: { ...(base as { data: CreateActivityInput }).data,
      scope: scope as EditActivityInput['scope'], expectedRevision: expectedRevision as number, ...(save ? { previewHash: previewHash as string } : {}) } };
  };
}
