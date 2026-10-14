export const resourceConditions = [
  { value: 'NUEVO', label: 'Nuevo' }, { value: 'BUEN_ESTADO', label: 'Buen estado' },
  { value: 'USADO', label: 'Usado' }, { value: 'DETERIORADO', label: 'Deteriorado' },
] as const;
/** Foto local preparada para envío; el contrato omite URI y transmite base64 al API. */
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
/** Entrada de publicación; precio nulo representa donación y foto es la principal inicial. */
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

export interface PhysicalgoodsResource {
  id: string;
  title: string;
  category: { id: string; name: string };
  modality: 'VENTA' | 'DONACION';
  price: number | null;
  status: string;
  condition: typeof resourceConditions[number]['value'];
  imageUrl?: string | null;
}

export interface PhysicalgoodsSearchFilters {
  q: string;
  categoryId: string;
  modality: string;
  condition: string;
  careerId: string;
  subjectId: string;
  minPrice: string;
  maxPrice: string;
  mine: boolean;
}
export const emptyPhysicalgoodsFilters: PhysicalgoodsSearchFilters = {
  q: '', categoryId: '', modality: '', condition: '', careerId: '', subjectId: '', minPrice: '', maxPrice: '', mine: false,
};
export interface PhysicalgoodsGallery extends PhysicalgoodsResource {
  updatedAt: string;
  description: string;
  campus: { id: string; name: string };
  owner: { id: string; fullName: string };
  acceptsRequests: boolean;
  canEdit: boolean;
  images: { id: string; name: string; principal: boolean; url: string }[];
  expiresIn: number;
}
export interface PhysicalgoodsPage {
  data: PhysicalgoodsResource[];
  meta: { page: number; limit: number; hasMore: boolean };
}
