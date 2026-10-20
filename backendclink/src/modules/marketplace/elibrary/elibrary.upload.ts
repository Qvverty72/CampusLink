import busboy from 'busboy';
import type { Request } from 'express';
import { ApiError } from '../../../services/api-response.js';
import { DIGITAL_MAX_BYTES } from './elibrary.validation.js';
import type { DigitalUpload } from './elibrary.types.js';

/** Solo transporte multipart; autorización y validación del contenido permanecen en service. */
export function readDigitalUpload(request: Request): Promise<{ metadata: unknown; file?: DigitalUpload }> {
  if (!request.is('multipart/form-data') || Object.keys(request.query).length) return Promise.reject(
    new ApiError(400, 'VALIDATION_ERROR', 'Envía los datos y un archivo mediante multipart/form-data.'));
  const maxRequest = DIGITAL_MAX_BYTES + 32 * 1024;
  const tooLarge = () => new ApiError(413, 'PAYLOAD_TOO_LARGE', 'El archivo debe pesar como máximo 25 MB.');
  if (Number(request.headers['content-length']) > maxRequest) return Promise.reject(tooLarge());
  return new Promise((resolve, reject) => {
    let parser: ReturnType<typeof busboy>;
    try { parser = busboy({ headers: request.headers, preservePath: true, defParamCharset: 'utf8',
      limits: { files: 1, fields: 1, parts: 3, fileSize: DIGITAL_MAX_BYTES + 1, fieldSize: 20 * 1024, fieldNameSize: 50 } });
    } catch { reject(new ApiError(400, 'VALIDATION_ERROR', 'La carga multipart es inválida.')); return; }
    let error: Error | undefined, metadata: unknown, file: DigitalUpload | undefined, received = 0;
    const invalid = () => new ApiError(400, 'VALIDATION_ERROR', 'Envía solo metadata y un archivo PDF obligatorio.');
    const count = (chunk: Buffer) => {
      received += chunk.length;
      if (received > maxRequest) { error = tooLarge(); request.unpipe(parser); parser.destroy(); request.resume(); }
    };
    request.on('data', count);
    request.once('aborted', abort);
    function abort() { error = invalid(); parser.destroy(); }
    parser.on('field', (name, value, info) => {
      if (name !== 'metadata' || metadata !== undefined || info.valueTruncated || info.nameTruncated) { error = invalid(); return; }
      try { metadata = JSON.parse(value); } catch { error = invalid(); }
    });
    parser.on('file', (field, stream, info) => {
      const chunks: Buffer[] = []; let size = 0;
      if (field !== 'file') error = invalid();
      stream.on('limit', () => { error = tooLarge(); chunks.length = 0; });
      stream.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > DIGITAL_MAX_BYTES) { error = tooLarge(); chunks.length = 0; }
        if (!error) chunks.push(chunk);
      });
      stream.on('error', () => { error ??= invalid(); });
      stream.on('end', () => {
        if (!error) file = { name: info.filename ?? '', mimeType: info.mimeType, bytes: Buffer.concat(chunks, size) };
      });
    });
    for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit'] as const) parser.on(event, () => { error ??= invalid(); });
    parser.on('error', () => { error ??= invalid(); });
    parser.on('close', () => {
      request.off('data', count); request.off('aborted', abort);
      if (error) reject(error);
      else if (metadata === undefined) reject(invalid());
      else resolve({ metadata, file });
    });
    request.pipe(parser);
  });
}
