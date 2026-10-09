import { ObjectId } from 'mongodb';
import { ApiError } from './apiError.js';
import { dependencyOperation } from './references.js';

export function documentObjectId(value: unknown, field = 'documentId'): ObjectId {
  if (!(value instanceof ObjectId)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid document identifier.', {
      details: [{ field, message: `${field} must be an ObjectId.` }],
    });
  }
  return value;
}

/** Translate known MongoDB constraint errors; never disclose the raw driver error. */
export function documentOperation<T>(operation: () => Promise<T>): Promise<T> {
  return dependencyOperation(async () => {
    try { return await operation(); }
    catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
      if (code === 11000) throw new ApiError(409, 'CONFLICT', 'The document conflicts with an existing record.');
      if (code === 121) throw new ApiError(400, 'VALIDATION_ERROR', 'The document does not match its schema.');
      throw error;
    }
  });
}
