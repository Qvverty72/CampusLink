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
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (signal?.aborted) return;
  const local = new LocalFile(Paths.cache, `campuslink-${file.id}.${file.extension}`);
  try {
    await local.write(bytes);
    if (signal?.aborted) return;
    await shareAsync(local.uri, { mimeType: file.mimeType, dialogTitle: file.name, UTI: file.uti });
  } finally { if (local.exists) local.delete(); }
}
