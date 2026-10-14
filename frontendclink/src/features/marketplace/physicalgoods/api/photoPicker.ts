import { launchImageLibraryAsync } from 'expo-image-picker';
import type { PublicationPhoto } from '../types/publication';

/** Abre el selector del dispositivo y valida tamaño y firma MIME de cada foto. */
export async function pickPublicationPhotos(): Promise<PublicationPhoto[]> {
  // Se invoca directamente desde la acción del usuario para conservar la activación web.
  const result = await launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, base64: true, quality: 1, exif: false });
  if (result.canceled) return [];
  return result.assets.map(asset => {
    const base64 = asset.base64;
    if (!base64) throw new Error('No se pudo leer una fotografía. Selecciona otra.');
    const bytes = base64.length * 3 / 4 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
    if (bytes > 5 * 1024 * 1024) throw new Error('Cada fotografía debe pesar como máximo 5 MB.');
    // El selector nativo puede convertir el formato; se inspecciona la firma de los bytes devueltos.
    const mimeType = base64.startsWith('/9j/') ? 'image/jpeg' : base64.startsWith('iVBORw0KGgo') ? 'image/png'
      : base64.startsWith('UklGR') ? 'image/webp' : null;
    if (!mimeType) throw new Error('Selecciona fotografías JPEG, PNG o WebP.');
    return { name: asset.fileName || 'fotografia', mimeType, base64, uri: asset.uri };
  });
}
