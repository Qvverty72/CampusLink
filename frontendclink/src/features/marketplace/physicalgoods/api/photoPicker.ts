import { launchImageLibraryAsync } from 'expo-image-picker';
import { PHYSICALGOODS_MAX_IMAGES, type PublicationPhoto } from '../types/publication';

/** Limita la selección a los cupos restantes y valida tamaño y firma MIME de cada foto. */
export async function pickPublicationPhotos(availableSlots = PHYSICALGOODS_MAX_IMAGES): Promise<PublicationPhoto[]> {
  if (availableSlots <= 0) throw new Error(`Cada publicación admite un máximo de ${PHYSICALGOODS_MAX_IMAGES} imágenes. Quita una antes de agregar otra.`);
  const selectionLimit = Math.min(availableSlots, PHYSICALGOODS_MAX_IMAGES);
  // Se invoca directamente desde la acción del usuario para conservar la activación web.
  const result = await launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit, base64: true, quality: 1, exif: false });
  if (result.canceled) return [];
  // Web no aplica selectionLimit: rechaza el lote completo sin descartar selecciones anteriores.
  if (result.assets.length > selectionLimit) throw new Error(`Puedes seleccionar hasta ${selectionLimit} ${selectionLimit === 1 ? 'imagen más' : 'imágenes más'} (máximo ${PHYSICALGOODS_MAX_IMAGES} por publicación).`);
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
