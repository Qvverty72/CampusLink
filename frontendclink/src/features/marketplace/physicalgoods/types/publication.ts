export const resourceConditions = [
  { value: 'NUEVO', label: 'Nuevo' }, { value: 'BUEN_ESTADO', label: 'Buen estado' },
  { value: 'USADO', label: 'Usado' }, { value: 'DETERIORADO', label: 'Deteriorado' },
] as const;
export interface PublicationPhoto {
  name: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  base64: string;
  uri: string;
}
export interface PublicationOptions {
  campus: { id: string; name: string };
  categories: { id: string; name: string }[];
  careers: { id: string; name: string }[];
  subjects: { id: string; name: string; careerIds: string[] }[];
}
export interface PublicationInput {
  title: string;
  description: string;
  condition: typeof resourceConditions[number]['value'];
  categoryId: string;
  modality: 'VENTA' | 'DONACION';
  price: number | null;
  careerId: string | null;
  subjectId: string | null;
  photo: Pick<PublicationPhoto, 'name' | 'mimeType' | 'base64'>;
}
export interface PublicationCreated extends Omit<PublicationInput, 'photo'> {
  id: string;
  campusId: string;
  ownerId: string;
  status: 'DISPONIBLE';
  currency: 'CLP';
}
