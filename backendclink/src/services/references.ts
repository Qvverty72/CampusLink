import { ApiError } from './apiError.js';
import type { DocumentReferences, ReferenceRepository } from '../types/references.js';

// Same UUID versions and variants as the existing map parser/documental bootstrap.
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function referenceUuid(input: unknown, field: string): string {
  if (typeof input !== 'string' || !UUID_PATTERN.test(input.trim())) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid reference identifier.', {
      details: [{ field, message: `${field} must be a valid UUID.` }],
    });
  }
  return input.trim().toLowerCase();
}

/** Fail closed without exposing provider errors or retrying an uncertain write. */
export async function dependencyOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'A required dependency is unavailable.');
  }
}

const defaultRepository: ReferenceRepository = {
  findCampus: async id => (await import('../database/supabase/references.repository.js')).findCampusReference(id),
  findUser: async id => (await import('../database/supabase/references.repository.js')).findUserReference(id),
};

/** Integrity only. Callers still have to authenticate and authorize each operation. */
export function createReferenceValidator(repository: ReferenceRepository = defaultRepository) {
  async function assertReferences(references: DocumentReferences): Promise<DocumentReferences> {
    // Validate all identifiers before making any external request.
    const campusId = referenceUuid(references.campusId, 'campusId');
    const users = references.users?.map(user => ({ ...user, id: referenceUuid(user.id, user.field) }));
    const campus = await dependencyOperation(() => repository.findCampus(campusId));
    const invalid = (field: string): never => {
      throw new ApiError(409, 'CONFLICT', 'A referenced entity is missing, inactive or inconsistent.', {
        details: [{ field, message: 'The reference must be current and belong to the operation campus.' }],
      });
    };
    if (!campus || typeof campus.id !== 'string' || campus.id.toLowerCase() !== campusId
      || typeof campus.institucion_id !== 'string' || !campus.institucion_id || campus.activo !== true) {
      return invalid('campusId');
    }
    for (const user of users ?? []) {
      const profile = await dependencyOperation(() => repository.findUser(user.id));
      if (!profile || typeof profile.id !== 'string' || profile.id.toLowerCase() !== user.id
        || profile.estado_cuenta !== 'ACTIVA' || profile.deleted_at !== null
        || typeof profile.campus_id !== 'string' || profile.campus_id.toLowerCase() !== campusId
        || typeof profile.institucion_id !== 'string'
        || profile.institucion_id.toLowerCase() !== campus.institucion_id.toLowerCase()) invalid(user.field);
    }
    return { campusId, ...(users ? { users } : {}) };
  }

  async function areReferencesCurrent(references: DocumentReferences): Promise<boolean> {
    try {
      await assertReferences(references);
      return true;
    } catch (error) {
      // Invalid references are invisible in operational reads; dependency failure is not absence.
      if (error instanceof ApiError && (error.status === 400 || error.status === 409)) return false;
      throw error;
    }
  }

  return { assertReferences, areReferencesCurrent };
}

export type ReferenceValidator = ReturnType<typeof createReferenceValidator>;
