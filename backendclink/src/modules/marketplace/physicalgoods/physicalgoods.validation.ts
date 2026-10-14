import { ApiError } from '../../../services/api-response.js';
import type { PhysicalgoodsCondition, PhysicalgoodsInput, PrincipalPhoto } from './physicalgoods.types.js';

export const PRINCIPAL_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid = (field: string, message: string): never => {
  throw new ApiError(400, 'VALIDATION_ERROR', message, { details: [{ field, message }] });
};
export function physicalgoodsId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !uuid.test(value)) return invalid(field, 'Selecciona una opción válida.');
  return value.toLowerCase();
}
function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    return invalid(field, `Completa este campo (máximo ${max} caracteres).`);
  }
  return value.trim();
}
export function parsePhysicalgoods(body: unknown): { input: PhysicalgoodsInput; photo: PrincipalPhoto } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid('body', 'Revisa los datos de la publicación.');
  const values = body as Record<string, unknown>;
  const keys = ['title', 'description', 'condition', 'categoryId', 'modality', 'price', 'careerId', 'subjectId', 'photo'];
  if (Object.keys(values).some(key => !keys.includes(key))) return invalid('body', 'La publicación contiene campos no admitidos.');
  const title = text(values.title, 'title', 200);
  const description = text(values.description, 'description', 4000);
  if (typeof values.condition !== 'string' || !['NUEVO', 'BUEN_ESTADO', 'USADO', 'DETERIORADO'].includes(values.condition)) return invalid('condition', 'Selecciona la condición del recurso.');
  if (values.modality !== 'VENTA' && values.modality !== 'DONACION') return invalid('modality', 'Elige venta o donación.');
  let price: number | null = null;
  if (values.modality === 'VENTA') {
    if (typeof values.price !== 'number' || !Number.isFinite(values.price) || values.price <= 0 || values.price > Number.MAX_SAFE_INTEGER) return invalid('price', 'Ingresa un precio de venta mayor que cero.');
    price = values.price;
  } else if (values.price !== undefined && values.price !== null) return invalid('price', 'Una donación no tiene precio de venta.');
  const categoryId = physicalgoodsId(values.categoryId, 'categoryId');
  const optionalId = (field: string) => values[field] == null ? null : physicalgoodsId(values[field], field);
  const input: PhysicalgoodsInput = { title, description, condition: values.condition as PhysicalgoodsCondition,
    categoryId, modality: values.modality, price, careerId: optionalId('careerId'), subjectId: optionalId('subjectId') };
  return { input, photo: parsePhysicalgoodsPhoto(values.photo) };
}

export function parsePhysicalgoodsPhoto(raw: unknown): PrincipalPhoto {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid('photo', 'Selecciona la fotografía principal.');
  const photo = raw as Record<string, unknown>;
  if (Object.keys(photo).some(key => !['name', 'mimeType', 'base64'].includes(key))) return invalid('photo', 'La fotografía contiene campos no admitidos.');
  const name = text(photo.name, 'photo', 255);
  if (/[\/\\]/.test(name)) return invalid('photo', 'El nombre de la fotografía no debe contener una ruta.');
  if (typeof photo.mimeType !== 'string' || !['image/jpeg', 'image/png', 'image/webp'].includes(photo.mimeType)) return invalid('photo', 'Usa una fotografía JPEG, PNG o WebP.');
  if (typeof photo.base64 !== 'string' || !photo.base64.length || photo.base64.length > Math.ceil(PRINCIPAL_PHOTO_MAX_BYTES / 3) * 4
    || photo.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(photo.base64)) return invalid('photo', 'La fotografía debe ser válida y pesar como máximo 5 MB.');
  const bytes = Buffer.from(photo.base64, 'base64');
  if (bytes.toString('base64') !== photo.base64) return invalid('photo', 'La fotografía no tiene una codificación válida.');
  if (!bytes.length || bytes.length > PRINCIPAL_PHOTO_MAX_BYTES) return invalid('photo', 'La fotografía debe pesar como máximo 5 MB.');
  const matches = photo.mimeType === 'image/jpeg' ? bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : photo.mimeType === 'image/png' ? bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!matches) return invalid('photo', 'El contenido de la fotografía no coincide con su tipo.');
  return { name, mimeType: photo.mimeType as PrincipalPhoto['mimeType'], bytes };
}

export function parsePhysicalgoodsPhotoUpload(body: unknown): PrincipalPhoto {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'photo')) return invalid('body', 'Envía una fotografía válida.');
  return parsePhysicalgoodsPhoto((body as Record<string, unknown>).photo);
}
export function parsePhysicalgoodsCategory(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'categoryId')) return invalid('body', 'Selecciona una categoría válida.');
  return physicalgoodsId((body as Record<string, unknown>).categoryId, 'categoryId');
}
