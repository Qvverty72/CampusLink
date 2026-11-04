import { Platform } from 'react-native';
import { File as LocalFile, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

export interface DownloadFile {
  id: string;
  name: string;
  extension: 'pdf' | 'xlsx';
  mimeType: string;
  uti: string;
}

/** Guarda bytes ya autorizados. El archivo temporal nativo se retira al cerrar compartir. */
export async function saveFile(blob: Blob, file: DownloadFile, signal?: AbortSignal) {
  if (signal?.aborted) return;
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    try { link.href = url; link.download = file.name; document.body.appendChild(link); link.click(); }
    finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    return;
  }
  if (!await isAvailableAsync()) throw new Error('Este dispositivo no permite guardar o compartir archivos desde la aplicación.');
  const bytes = new Uint8Array(await readBlobBytes(blob, signal));
  if (signal?.aborted) return;
  const local = new LocalFile(Paths.cache, `campuslink-${file.id}.${file.extension}`);
  try {
    await local.write(bytes);
    if (signal?.aborted) return;
    await shareAsync(local.uri, { mimeType: file.mimeType, dialogTitle: file.name, UTI: file.uti });
  } finally { if (local.exists) local.delete(); }
}

/** React Native Blob no incluye arrayBuffer; FileReader usa el puente binario nativo. */
async function readBlobBytes(blob: Blob, signal?: AbortSignal): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cleanup = () => {
      signal?.removeEventListener('abort', abort);
      reader.onload = reader.onerror = reader.onabort = null;
    };
    const abort = () => {
      cleanup();
      reader.abort();
      const error = new Error('Lectura de archivo cancelada.');
      error.name = 'AbortError';
      reject(error);
    };
    reader.onload = () => {
      const result = reader.result;
      cleanup();
      if (result === null || typeof result === 'string') reject(new Error('No se pudieron leer los bytes del archivo.'));
      else resolve(result);
    };
    reader.onerror = () => {
      const error = reader.error;
      cleanup();
      reject(error ?? new Error('No se pudo leer el archivo descargado.'));
    };
    reader.onabort = abort;
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    try { reader.readAsArrayBuffer(blob); }
    catch (error) { cleanup(); reject(error); }
  });
}
