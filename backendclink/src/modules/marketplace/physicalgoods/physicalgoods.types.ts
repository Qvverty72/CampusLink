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
