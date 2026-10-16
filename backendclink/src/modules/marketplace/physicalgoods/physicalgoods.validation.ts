import { ApiError } from '../../../services/api-response.js';
import type { PhysicalgoodsCondition, PhysicalgoodsInput, PrincipalPhoto } from './physicalgoods.types.js';

export const PRINCIPAL_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHYSICALGOODS_MAX_IMAGES = 3;
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
function content(values: Record<string, unknown>): Pick<PhysicalgoodsInput,'title'|'description'|'condition'|'modality'|'price'> {
  const title = text(values.title, 'title', 200);
  const description = text(values.description, 'description', 4000);
  if (typeof values.condition !== 'string' || !['NUEVO', 'BUEN_ESTADO', 'USADO', 'DETERIORADO'].includes(values.condition)) return invalid('condition', 'Selecciona la condición del recurso.');
  if (values.modality !== 'VENTA' && values.modality !== 'DONACION') return invalid('modality', 'Elige venta o donación.');
  let price: number | null = null;
  if (values.modality === 'VENTA') {
    if (typeof values.price !== 'number' || !Number.isFinite(values.price) || values.price <= 0 || values.price > Number.MAX_SAFE_INTEGER) return invalid('price', 'Ingresa un precio de venta mayor que cero.');
    price = values.price;
  } else if (values.price !== undefined && values.price !== null) return invalid('price', 'Una donación no tiene precio de venta.');
  return { title, description, condition: values.condition as PhysicalgoodsCondition, modality: values.modality, price };
}
export function parsePhysicalgoods(body: unknown): { input: PhysicalgoodsInput; photo: PrincipalPhoto } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid('body', 'Revisa los datos de la publicación.');
  const values = body as Record<string, unknown>;
  const keys = ['title', 'description', 'condition', 'categoryId', 'modality', 'price', 'careerId', 'subjectId', 'photo'];
  if (Object.keys(values).some(key => !keys.includes(key))) return invalid('body', 'La publicación contiene campos no admitidos.');
  const categoryId = physicalgoodsId(values.categoryId, 'categoryId');
  const optionalId = (field: string) => values[field] == null ? null : physicalgoodsId(values[field], field);
  const input: PhysicalgoodsInput = { ...content(values), categoryId, careerId: optionalId('careerId'), subjectId: optionalId('subjectId') };
  return { input, photo: parsePhysicalgoodsPhoto(values.photo) };
}
/** Acepta los campos mutables y la versión vigente; rechaza campos de identidad o estado. */
export function parsePhysicalgoodsVersion(body: unknown, editing = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid('body', 'Revisa los datos de la publicación.');
  const values = body as Record<string, unknown>;
  const keys = editing ? ['title','description','condition','modality','price','updatedAt'] : ['updatedAt'];
  if (Object.keys(values).some(key => !keys.includes(key)) || typeof values.updatedAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(values.updatedAt)) return invalid('updatedAt', 'Recarga el detalle de la publicación.');
  return { values, updatedAt: values.updatedAt };
}
export function parsePhysicalgoodsUpdate(body: unknown) {
  const { values, updatedAt } = parsePhysicalgoodsVersion(body, true);
  return { ...content(values), updatedAt };
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

/** Valida el sobre de carga de imagen y delega la comprobación de tamaño y contenido. */
export function parsePhysicalgoodsPhotoUpload(body: unknown): PrincipalPhoto {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'photo')) return invalid('body', 'Envía una fotografía válida.');
  return parsePhysicalgoodsPhoto((body as Record<string, unknown>).photo);
}
export function parsePhysicalgoodsCategory(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'categoryId')) return invalid('body', 'Selecciona una categoría válida.');
  return physicalgoodsId((body as Record<string, unknown>).categoryId, 'categoryId');
}
export function parsePhysicalgoodsDecision(body: unknown): 'ACEPTAR' | 'RECHAZAR' {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'decision')) return invalid('body', 'Elige aceptar o rechazar la solicitud.');
  const value = (body as Record<string, unknown>).decision;
  if (value !== 'ACEPTAR' && value !== 'RECHAZAR') return invalid('decision', 'Elige aceptar o rechazar la solicitud.');
  return value;
}
export function parsePhysicalgoodsEmptyAction(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) return invalid('body', 'La acción no admite campos adicionales.');
}
/** La valoración solo acepta la puntuación; identidad, acuerdo y fecha proceden del servidor. */
export function parsePhysicalgoodsRating(body:unknown):number {
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>key!=='score'))return invalid('body','Selecciona una puntuación de 1 a 5.');
  const score=(body as Record<string,unknown>).score;
  if(typeof score!=='number'||!Number.isInteger(score)||score<1||score>5)return invalid('score','La puntuación debe ser un entero de 1 a 5.');
  return score;
}
export function parsePhysicalgoodsCoordination(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['buildingId','floorId'].includes(key))) return invalid('body','Selecciona un edificio y un piso.');
  const values = body as Record<string,unknown>;
  const buildingId = text(values.buildingId,'buildingId',120),floorId = text(values.floorId,'floorId',120);
  if (![buildingId,floorId].every(value => /^[a-zA-Z0-9_-]+$/.test(value))) return invalid('location','Selecciona una ubicación válida.');
  return { buildingId,floorId };
}
/** Acepta exclusivamente un código de catálogo; el solicitante y el contexto los determina el servidor. */
export function parsePhysicalgoodsRequest(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'messageCode')) return invalid('body','Selecciona un mensaje predefinido.');
  const code = (body as Record<string,unknown>).messageCode;
  if (typeof code !== 'string' || !code.trim() || /[\u0000-\u001f\u007f]/.test(code)) return invalid('messageCode','Selecciona un mensaje predefinido.');
  return code.trim();
}
