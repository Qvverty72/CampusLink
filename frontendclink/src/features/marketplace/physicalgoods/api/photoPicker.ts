import { launchImageLibraryAsync } from 'expo-image-picker';
import type { PublicationPhoto } from '../types/publication';

export async function pickPublicationPhotos(): Promise<PublicationPhoto[]> {
  // Called directly by a user action to preserve browser activation.
  const result = await launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, base64: true, quality: 1, exif: false });
  if (result.canceled) return [];
  return result.assets.map(asset => {
    const base64 = asset.base64;
    if (!base64) throw new Error('No se pudo leer una fotografía. Selecciona otra.');
    const bytes = base64.length * 3 / 4 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
    if (bytes > 5 * 1024 * 1024) throw new Error('Cada fotografía debe pesar como máximo 5 MB.');
    // Native pickers can convert the selected format; inspect the returned bytes.
    const mimeType = base64.startsWith('/9j/') ? 'image/jpeg' : base64.startsWith('iVBORw0KGgo') ? 'image/png'
      : base64.startsWith('UklGR') ? 'image/webp' : null;
    if (!mimeType) throw new Error('Selecciona fotografías JPEG, PNG o WebP.');
    return { name: asset.fileName || 'fotografia', mimeType, base64, uri: asset.uri };
  });
}
