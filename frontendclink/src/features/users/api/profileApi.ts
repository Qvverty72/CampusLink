import { AuthApiError, authenticatedRequest } from '@/lib/api/authenticated-request';

import type { AcademicOptions, AcademicProfile } from '../types/profile';

/** Carga el perfil académico de la identidad de la sesión. */
export const loadAcademicProfile = (signal: AbortSignal) =>
  authenticatedRequest<AcademicProfile>('/api/v1/users/me/profile', { signal });
/** Carga campus y carreras disponibles para validar la edición del perfil. */
export const loadAcademicOptions = (signal: AbortSignal) =>
  authenticatedRequest<AcademicOptions>('/api/v1/users/me/profile-options', { signal });
/** Guarda el perfil con `updatedAt` como control de concurrencia optimista. */
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
