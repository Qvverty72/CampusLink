import { AuthApiError, authenticatedRequest } from '@/lib/api/authenticated-request';

import type { AcademicOptions, AcademicProfile } from '../types/profile';

export const loadAcademicProfile = (signal: AbortSignal) =>
  authenticatedRequest<AcademicProfile>('/api/v1/users/me/profile', { signal });
export const loadAcademicOptions = (signal: AbortSignal) =>
  authenticatedRequest<AcademicOptions>('/api/v1/users/me/profile-options', { signal });
export async function saveAcademicProfile(input: { fullName: string; campusId: string; careerIds: string[]; updatedAt: string }, signal: AbortSignal) {
  try {
    return await authenticatedRequest('/api/v1/users/me/profile', { method: 'PATCH', signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 400) throw new Error('Revisa el nombre (máximo 200 caracteres), el campus y sus carreras disponibles.');
    if (!signal.aborted && (!(error instanceof AuthApiError) || error.status >= 500)) throw new Error('No se pudo guardar el perfil. Revisa tu conexión e inténtalo nuevamente.');
    throw error;
  }
}
