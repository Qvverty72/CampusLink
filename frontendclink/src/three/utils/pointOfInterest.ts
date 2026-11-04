import { POI_IMAGES } from '../assets/poiImages.generated';

const POI_TYPE_LABELS: Record<string, string> = {
  AUDITORIUM: 'Auditorio', CAFETERIA: 'Cafetería', LIBRARY: 'Biblioteca',
  CHAPEL: 'Capilla', LAB: 'Laboratorio', OFFICE: 'Oficina', SPORTS: 'Deportes',
  SERVICE: 'Servicio', OTHER: 'Otro',
};

/** Etiquetas visibles para tipos conocidos; los valores nuevos se muestran tal cual. */
export function poiTypeLabel(type: string): string {
  return Object.hasOwn(POI_TYPE_LABELS, type) ? POI_TYPE_LABELS[type] : type;
}

/** Resuelve solo imágenes empaquetadas; la API no controla rutas `require` locales. */
export function poiImages(imageKeys?: string[]) {
  if (!Array.isArray(imageKeys)) return [];
  return [...new Set(imageKeys.filter((key): key is string => typeof key === 'string')
    .map(key => key.trim()).filter(key => Object.hasOwn(POI_IMAGES, key)))]
    .map(key => ({ key, source: POI_IMAGES[key] }));
}
