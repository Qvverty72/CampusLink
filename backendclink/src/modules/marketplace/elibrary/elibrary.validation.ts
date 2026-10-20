import { PDFArray, PDFDict, PDFDocument, PDFName, PDFStream } from 'pdf-lib';
import { ApiError } from '../../../services/api-response.js';
import type { DigitalInput, DigitalUpload } from './elibrary.types.js';

export const DIGITAL_MAX_BYTES = 25 * 1024 * 1024;
export function invalidDigital(field: string, message: string): never {
  throw new ApiError(400, 'VALIDATION_ERROR', message, { details: [{ field, message }] });
}
export function digitalId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return invalidDigital('publicationId', 'Selecciona una publicación válida.');
  }
  return value.toLowerCase();
}
function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    return invalidDigital(field, `Completa este campo (máximo ${max} caracteres).`);
  }
  return value.trim();
}
export function parseDigitalInput(raw: unknown): DigitalInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalidDigital('metadata', 'Revisa los datos de la publicación.');
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).some(key => !['title', 'description', 'modality', 'price'].includes(key))) {
    return invalidDigital('metadata', 'La publicación contiene campos no admitidos.');
  }
  const title = text(body.title, 'title', 200), description = text(body.description, 'description', 4000);
  if (body.modality !== 'VENTA' && body.modality !== 'DONACION') return invalidDigital('modality', 'Elige venta o donación.');
  let price: number | null = null;
  if (body.modality === 'VENTA') {
    if (typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price <= 0 || body.price > Number.MAX_SAFE_INTEGER) {
      return invalidDigital('price', 'Ingresa un precio de venta mayor que cero.');
    }
    price = body.price;
  } else if (body.price !== undefined && body.price !== null) return invalidDigital('price', 'Una donación no tiene precio.');
  return { title, description, modality: body.modality, price };
}

/** Política inicial: PDF sin cifrado, acciones ni adjuntos. No define el catálogo final de F2.5-02. */
export async function validateDigitalFile(file: DigitalUpload | undefined): Promise<DigitalUpload> {
  if (!file || !Buffer.isBuffer(file.bytes) || !file.bytes.length) return invalidDigital('file', 'Selecciona un archivo PDF.');
  if (file.bytes.length > DIGITAL_MAX_BYTES) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'El archivo debe pesar como máximo 25 MB.');
  const name = text(file.name, 'file', 255);
  if (/[\\/\u0000-\u001f\u007f]/.test(name) || !/\.pdf$/i.test(name) || file.mimeType !== 'application/pdf') {
    return invalidDigital('file', 'Por ahora se admiten archivos PDF sin contraseña, acciones ni adjuntos.');
  }
  if (!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(file.bytes.toString('latin1', 0, 10)) ||
    !/%%EOF[\s]*$/.test(file.bytes.subarray(-1024).toString('latin1'))) {
    return invalidDigital('file', 'El contenido no corresponde a un PDF completo.');
  }
  try {
    const pdf = await PDFDocument.load(file.bytes, { throwOnInvalidObject: true, updateMetadata: false, capNumbers: true });
    if (pdf.isEncrypted || pdf.getPageCount() < 1) throw new Error('Invalid PDF');
    const forbidden = new Set(['A', 'AA', 'OpenAction', 'JS', 'JavaScript', 'EmbeddedFiles', 'EF', 'XFA', 'RichMediaContent']);
    const inspect = (object: unknown): void => {
      if (object instanceof PDFArray) { for (let i = 0; i < object.size(); i++) inspect(object.get(i)); return; }
      const dictionary = object instanceof PDFStream ? object.dict : object;
      if (!(dictionary instanceof PDFDict)) return;
      for (const [key, value] of dictionary.entries()) {
        if (forbidden.has(key.decodeText()) || (value instanceof PDFName &&
          ['JavaScript', 'Launch', 'EmbeddedFile', 'RichMedia', 'SubmitForm', 'ImportData', 'GoToR'].includes(value.decodeText()))) {
          throw new Error('Active PDF');
        }
        // Incluye diccionarios directos, no solo objetos indirectos del documento.
        inspect(value);
      }
    };
    for (const [, object] of pdf.context.enumerateIndirectObjects()) inspect(object);
    return { name, mimeType: 'application/pdf', bytes: file.bytes };
  } catch {
    return invalidDigital('file', 'El PDF es inválido, está protegido o contiene acciones o adjuntos. Exporta una copia simple e inténtalo nuevamente.');
  }
}
