import { Platform } from 'react-native';
import { File as LocalFile, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import type { DigitalAttachment } from '../types/publication';

/** Entrega al sistema bytes ya autorizados; nunca abre una URL privada de Storage. */
export async function saveDigitalFile(blob: Blob, file: DigitalAttachment) {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    try { link.href = url; link.download = file.name; document.body.appendChild(link); link.click(); }
    finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    return;
  }
  if (!await isAvailableAsync()) throw new Error('Este dispositivo no permite guardar o compartir archivos desde la aplicación.');
  const local = new LocalFile(Paths.cache, `campuslink-${file.id}.pdf`);
  try {
    local.write(new Uint8Array(await blob.arrayBuffer()));
    await shareAsync(local.uri, { mimeType: 'application/pdf', dialogTitle: file.name, UTI: 'com.adobe.pdf' });
  } finally { if (local.exists) local.delete(); }
}
