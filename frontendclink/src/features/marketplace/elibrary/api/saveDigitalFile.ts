import { saveFile } from '@/lib/files/saveFile';
import type { DigitalAttachment } from '../types/publication';

/** Entrega al sistema bytes ya autorizados; nunca abre una URL privada de Storage. */
export async function saveDigitalFile(blob: Blob, file: DigitalAttachment) {
  return saveFile(blob, { ...file, extension: 'pdf', mimeType: 'application/pdf', uti: 'com.adobe.pdf' });
}
