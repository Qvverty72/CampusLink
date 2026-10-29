import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFObject, PDFStream, PDFString } from 'pdf-lib';
import { ApiError } from '../../../services/api-response.js';
import type { DigitalAcademicCatalog, DigitalInput, DigitalUpload } from './elibrary.types.js';

export const DIGITAL_MAX_BYTES = 25 * 1024 * 1024;
export function invalidDigital(field: string, message: string): never {
  throw new ApiError(400, 'VALIDATION_ERROR', message, { details: [{ field, message }] });
}
export function digitalId(value: unknown, field = 'publicationId'): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return invalidDigital(field, field === 'fileId' ? 'Selecciona un archivo válido.'
      : field === 'careerIds' ? 'Selecciona una carrera válida.' : field === 'subjectIds' ? 'Selecciona una asignatura válida.'
        : 'Selecciona una publicación válida.');
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
  if (Object.keys(body).some(key => !['title', 'description', 'modality', 'price', 'careerIds', 'subjectIds'].includes(key))) {
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
  return { title, description, modality: body.modality, price,
    careerIds: academicIds(body.careerIds === undefined ? [] : body.careerIds, 'careerIds'),
    subjectIds: academicIds(body.subjectIds === undefined ? [] : body.subjectIds, 'subjectIds') };
}

function academicIds(raw: unknown, field: string): string[] {
  if (!Array.isArray(raw)) return invalidDigital(field, 'Selecciona carreras y asignaturas válidas.');
  const ids = raw.map(value => digitalId(value, field)).sort();
  if (new Set(ids).size !== ids.length) return invalidDigital(field, 'No repitas una carrera o asignatura.');
  return ids;
}
export function parseDigitalAcademics(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalidDigital('body', 'Revisa las asociaciones académicas.');
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).some(key => !['careerIds', 'subjectIds', 'updatedAt'].includes(key))) {
    return invalidDigital('body', 'La solicitud contiene campos no admitidos.');
  }
  if (typeof body.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(body.updatedAt)) {
    return invalidDigital('updatedAt', 'Recarga el detalle de la publicación.');
  }
  return { careerIds: academicIds(body.careerIds, 'careerIds'), subjectIds: academicIds(body.subjectIds, 'subjectIds'), updatedAt: body.updatedAt };
}
export function validateDigitalAcademics(input: Pick<DigitalInput, 'careerIds' | 'subjectIds'>, catalog: DigitalAcademicCatalog) {
  if (input.careerIds.some(id => !catalog.careers.some(row => row.id === id))) {
    invalidDigital('careerIds', 'Selecciona carreras activas de tu institución.');
  }
  if (input.subjectIds.some(id => !catalog.subjects.some(row => row.id === id))) {
    invalidDigital('subjectIds', 'Selecciona asignaturas activas del catálogo de tu institución.');
  }
}

const pdfActions = new Set(['GoTo', 'GoToR', 'GoToE', 'Launch', 'Thread', 'URI', 'Sound', 'Movie', 'Hide', 'Named',
  'SubmitForm', 'ResetForm', 'ImportData', 'JavaScript', 'SetOCGState', 'Rendition', 'Trans', 'GoTo3DView', 'RichMediaExecute']);

/** Valida destinos sin abrirlos ni enviarlos a servicios externos. */
function validatePdfLink(value: PDFObject | undefined): void {
  if (!(value instanceof PDFString || value instanceof PDFHexString)) {
    invalidDigital('file', 'El PDF contiene un enlace inválido. Corrígelo y vuelve a exportar el documento.');
  }
  const uri = value.decodeText();
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(uri)?.[1].toLowerCase();
  if (scheme === 'http') invalidDigital('file', 'El PDF contiene un enlace HTTP. Cámbialo a HTTPS y vuelve a exportar el documento.');
  if (!scheme || !['https', 'mailto', 'tel'].includes(scheme)) {
    invalidDigital('file', 'El PDF contiene un enlace no permitido. Solo se admiten enlaces HTTPS, correo y teléfono.');
  }
  try {
    if (/[\s\\\u0000-\u001f\u007f]/.test(uri)) throw new Error();
    const url = new URL(uri), destination = decodeURIComponent(url.pathname);
    if (/[\u0000-\u001f\u007f]/.test(destination)) throw new Error();
    if (scheme === 'https' && (!/^https:\/\//i.test(uri) || !url.hostname)) throw new Error();
    if (scheme === 'mailto' && !destination.split(',').every(address => /^[^@\s]+@[^@\s]+$/.test(address))) throw new Error();
    if (scheme === 'tel' && (!/\d/.test(destination) || !/^\+?[\d(). -]+(?:;[a-z\d-]+=[a-z\d.+-]+)*$/i.test(destination))) throw new Error();
  } catch {
    invalidDigital('file', 'El PDF contiene un enlace inválido. Corrígelo y vuelve a exportar el documento.');
  }
}

/** Recorre objetos directos/indirectos, incluidos streams comprimidos, sin confundir /A de estructura con acciones. */
function inspectDigitalPdf(pdf: PDFDocument): void {
  const resolve = (value: PDFObject | undefined) => pdf.context.lookup(value);
  const name = (dict: PDFDict, key: string) => {
    const value = resolve(dict.get(PDFName.of(key)));
    return value instanceof PDFName ? value.decodeText() : undefined;
  };
  const inspectAction = (value: PDFObject | undefined) => {
    if (!(value instanceof PDFDict)) invalidDigital('file', 'El PDF contiene una acción inválida. Vuelve a exportarlo sin acciones interactivas.');
    const kind = name(value, 'S');
    if (kind === 'JavaScript') invalidDigital('file', 'El PDF contiene JavaScript. Exporta una copia sin scripts.');
    if (kind !== 'URI') invalidDigital('file', 'El PDF contiene una acción no permitida. Solo se admiten enlaces HTTPS, correo y teléfono.');
    if (value.has(PDFName.of('Next'))) invalidDigital('file', 'El PDF contiene acciones encadenadas. Exporta una copia sin esas acciones.');
    validatePdfLink(resolve(value.get(PDFName.of('URI'))));
  };
  const pending: PDFObject[] = pdf.context.enumerateIndirectObjects().map(([, object]) => object);
  const visited = new Set<PDFObject>();
  while (pending.length) {
    const object = resolve(pending.pop());
    if (!object || visited.has(object)) continue;
    visited.add(object);
    if (object instanceof PDFArray) { for (const value of object.asArray()) pending.push(value); continue; }
    const dict = object instanceof PDFStream ? object.dict : object;
    if (!(dict instanceof PDFDict)) continue;
    const has = (key: string) => dict.has(PDFName.of(key));
    const type = name(dict, 'Type'), subtype = name(dict, 'Subtype'), action = name(dict, 'S');
    if (has('JS') || has('JavaScript')) invalidDigital('file', 'El PDF contiene JavaScript. Exporta una copia sin scripts.');
    if (has('EmbeddedFiles') || has('EF') || type === 'EmbeddedFile' || subtype === 'FileAttachment') {
      invalidDigital('file', 'El PDF contiene archivos adjuntos incrustados. Exporta una copia sin adjuntos.');
    }
    if (has('OpenAction') || has('AA')) invalidDigital('file', 'El PDF contiene acciones automáticas. Exporta una copia sin acciones al abrirlo o interactuar con él.');
    if (has('XFA')) invalidDigital('file', 'El PDF contiene un formulario XFA no admitido. Exporta una copia PDF estática.');
    if (has('RichMediaContent') || has('RichMediaSettings') || ['RichMedia', '3D', 'Movie', 'Sound', 'Screen'].includes(subtype ?? '')) {
      invalidDigital('file', 'El PDF contiene contenido multimedia no admitido. Exporta una copia sin multimedia.');
    }
    if (type === 'Action' || (action && pdfActions.has(action))) inspectAction(dict);
    if (has('A')) {
      const value = resolve(dict.get(PDFName.of('A')));
      // /A también contiene atributos de listas/layout y nombres de glifos. Solo los slots
      // de anotación/marcador o los diccionarios de acción se interpretan como acciones.
      const actionSlot = type === 'Annot' || ['Link', 'Widget'].includes(subtype ?? '') || (has('Title') && has('Parent'));
      if (actionSlot || (value instanceof PDFDict && (name(value, 'S') || name(value, 'Type') === 'Action'))) inspectAction(value);
    }
    for (const [, value] of dict.entries()) pending.push(value);
  }
}

/** Política aprobada en QA-02: PDF sin cifrado/adjuntos/scripts; enlaces HTTPS, correo y teléfono. */
export async function validateDigitalFile(file: DigitalUpload | undefined): Promise<DigitalUpload> {
  if (!file || !Buffer.isBuffer(file.bytes)) return invalidDigital('file', 'Selecciona un archivo PDF.');
  if (!file.bytes.length) return invalidDigital('file', 'El archivo está vacío. Selecciona un PDF con contenido.');
  if (file.bytes.length > DIGITAL_MAX_BYTES) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'El archivo debe pesar como máximo 25 MB.');
  if (typeof file.name !== 'string' || !file.name.trim()) return invalidDigital('file', 'El archivo no tiene un nombre válido. Renómbralo y vuelve a seleccionarlo.');
  const name = file.name.trim();
  if (name.length > 255) return invalidDigital('file', 'El nombre del archivo supera los 255 caracteres. Acórtalo y vuelve a seleccionarlo.');
  if (/[\\/\u0000-\u001f\u007f]/.test(name)) return invalidDigital('file', 'El nombre del archivo contiene una ruta o caracteres no admitidos. Renómbralo y vuelve a seleccionarlo.');
  if (!/\.pdf$/i.test(name)) return invalidDigital('file', 'Solo se admiten archivos PDF con extensión .pdf.');
  const mimeType = typeof file.mimeType === 'string' ? file.mimeType.split(';')[0].trim().toLowerCase() : '';
  if (!['', 'application/pdf', 'application/x-pdf', 'application/octet-stream'].includes(mimeType)) {
    return invalidDigital('file', 'El tipo del archivo no corresponde a un PDF. Selecciona un documento PDF.');
  }
  if (!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(file.bytes.toString('latin1', 0, 10)) ||
    !/%%EOF[\s]*$/.test(file.bytes.subarray(-1024).toString('latin1'))) {
    return invalidDigital('file', 'El contenido no corresponde a un PDF completo.');
  }
  try {
    // Carga el catálogo para identificar cifrado y rechazarlo antes de leer páginas u objetos.
    const pdf = await PDFDocument.load(file.bytes, { ignoreEncryption: true, throwOnInvalidObject: true, updateMetadata: false, capNumbers: true });
    if (pdf.isEncrypted) invalidDigital('file', 'El PDF está cifrado o protegido con contraseña. Exporta una copia sin protección.');
    if (pdf.getPageCount() < 1) invalidDigital('file', 'El PDF no tiene páginas. Selecciona un documento con al menos una página.');
    inspectDigitalPdf(pdf);
    return { name, mimeType: 'application/pdf', bytes: file.bytes };
  } catch (reason) {
    if (reason instanceof ApiError) throw reason;
    return invalidDigital('file', 'No se pudo leer el PDF: está dañado o su estructura no es válida. Vuelve a exportarlo e inténtalo nuevamente.');
  }
}
