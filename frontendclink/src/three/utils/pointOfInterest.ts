import { POI_IMAGES } from '../assets/poiImages.generated';

const POI_TYPE_LABELS: Record<string, string> = {
  AUDITORIUM: 'Auditorio', CAFETERIA: 'Cafetería', LIBRARY: 'Biblioteca',
  CHAPEL: 'Capilla', LAB: 'Laboratorio', OFFICE: 'Oficina', SPORTS: 'Deportes',
  SERVICE: 'Servicio', OTHER: 'Otro',
};

export function poiTypeLabel(type: string): string {
  return Object.hasOwn(POI_TYPE_LABELS, type) ? POI_TYPE_LABELS[type] : type;
}

/** Only registered local files can be displayed; Mongo never supplies require paths. */
export function poiImages(imageKeys?: string[]) {
  if (!Array.isArray(imageKeys)) return [];
  return [...new Set(imageKeys.filter((key): key is string => typeof key === 'string')
    .map(key => key.trim()).filter(key => Object.hasOwn(POI_IMAGES, key)))]
    .map(key => ({ key, source: POI_IMAGES[key] }));
}
