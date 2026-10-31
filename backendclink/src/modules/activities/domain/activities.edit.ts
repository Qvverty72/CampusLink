import { ApiError } from '../../../shared/errors/api-error.js';

/** Protege también llamadas directas frente a clientes antiguos. */
export function requireIndividualEdit(scope: unknown): void {
  if (scope !== 'ONE') throw new ApiError(400, 'VALIDATION_ERROR', 'Solo se permite editar una actividad u ocurrencia individual.');
}
