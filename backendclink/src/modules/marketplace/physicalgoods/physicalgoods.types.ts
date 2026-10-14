import type { ModuleHealth } from '../../../types/api.types.js';

export type PhysicalgoodsHealth = ModuleHealth<'physicalgoods'>;

export type PhysicalgoodsCondition = 'NUEVO' | 'BUEN_ESTADO' | 'USADO' | 'DETERIORADO';
export interface PhysicalgoodsInput {
  title: string;
  description: string;
  condition: PhysicalgoodsCondition;
  categoryId: string;
  modality: 'VENTA' | 'DONACION';
  price: number | null;
  careerId: string | null;
  subjectId: string | null;
}
export interface PrincipalPhoto {
  name: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  bytes: Buffer;
}
export interface PhysicalgoodsCatalog {
  campus: { id: string; nombre: string; institucion_id: string; activo: boolean } | null;
  categories: { id: string; name: string }[];
  careers: { id: string; name: string }[];
  subjects: { id: string; name: string; careerIds: string[] }[];
}
export interface PhysicalgoodsCreated extends PhysicalgoodsInput {
  id: string;
  campusId: string;
  ownerId: string;
  status: 'DISPONIBLE';
  currency: 'CLP';
}

export interface PhysicalgoodsMediaRow {
  id: string;
  campus_id: string;
  propietario_id: string;
  titulo: string;
  categoria_id: string;
  categoria_nombre: string;
  modalidad: 'VENTA' | 'DONACION';
  precio: string | null;
  estado_publicacion: string;
  estado_uso: PhysicalgoodsCondition;
}

export interface PhysicalgoodsSearchFilters {
  q: string;
  categoryId: string | null;
  modality: 'VENTA' | 'DONACION' | null;
  condition: PhysicalgoodsCondition | null;
  careerId: string | null;
  subjectId: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  mine: boolean;
}
export interface PhysicalgoodsSearchRow extends PhysicalgoodsMediaRow {
  photo_bucket_id: string | null;
  photo_storage_path: string | null;
}
export interface PhysicalgoodsImageRow {
  id: string;
  bucket_id: string;
  storage_path: string;
  nombre_original: string;
  mime_type: string;
  tamano_bytes: string;
  orden: number;
}
