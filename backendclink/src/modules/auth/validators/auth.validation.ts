import { ApiError } from '../../../shared/errors/api-error.js';
import type { RegistrationInput } from '../types/auth.types.js';


/** Valida el cuerpo estricto de inicio o recuperación, normaliza email y limita el código OTP. */
export function credentials(body: unknown, recovery = false) {
  const invalid = () => new ApiError(400, 'VALIDATION_ERROR', 'Revisa el correo, la contraseña y el código cuando corresponda.');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid();
  const values = body as Record<string, unknown>;
  const keys = recovery ? ['email', 'password', 'code'] : ['email', 'password'];
  if (Object.keys(values).some(key => !keys.includes(key)) || keys.some(key => typeof values[key] !== 'string')) throw invalid();
  const email = (values.email as string).trim().toLowerCase();
  const password = values.password as string;
  const code = recovery ? (values.code as string).trim() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 4096
    || (recovery && !/^\d{6,10}$/.test(code))) throw invalid();
  return { email, password, code };
}


/** Valida un cuerpo de registro cerrado y normaliza email, nombre y UUID del campus. */
export function registrationInput(body: unknown): RegistrationInput {
  const invalid = () => new ApiError(400, 'INVALID_REGISTRATION', 'Revisa el correo, nombre, contraseña y campus.');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid();
  const values = body as Record<string, unknown>;
  const keys = ['email', 'password', 'fullName', 'campusId'];
  if (Object.keys(values).some(key => !keys.includes(key)) || keys.some(key => typeof values[key] !== 'string')) throw invalid();
  const input = values as unknown as RegistrationInput;
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !fullName || fullName.length > 200 || /[\u0000-\u001f\u007f]/.test(fullName)
    || !input.password || input.password.length > 4096
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.campusId)) throw invalid();
  return { email, fullName, password: input.password, campusId: input.campusId.toLowerCase() };
}


/** Valida correo y, para confirmación, el formato del código enviado por Auth. */
export function emailRequest(body: unknown, withCode = false): { email: string; code?: string } {
  const invalid = () => new ApiError(400, 'INVALID_VERIFICATION', 'Revisa el correo y el código de verificación.');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid();
  const values = body as Record<string, unknown>;
  const keys = withCode ? ['email', 'code'] : ['email'];
  if (Object.keys(values).some(key => !keys.includes(key)) || typeof values.email !== 'string') throw invalid();
  const email = values.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid();
  if (withCode && (typeof values.code !== 'string' || !/^\d{6,10}$/.test(values.code.trim()))) throw invalid();
  return { email, code: typeof values.code === 'string' ? values.code.trim() : undefined };
}
