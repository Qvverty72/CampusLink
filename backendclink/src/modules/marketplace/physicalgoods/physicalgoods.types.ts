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
  descripcion: string;
  updated_at: string;
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
export interface PhysicalgoodsDetailRow extends PhysicalgoodsMediaRow {
  descripcion: string;
  campus_nombre: string;
  propietario_nombre: string;
}
export interface PhysicalgoodsOwnRow extends PhysicalgoodsDetailRow {
  pending_requests: number;
  deleted_at: Date | null;
  publicado_en: string;
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
export interface PhysicalgoodsRequestRow {
  id: string;
  publicacion_id: string;
  solicitante_id: string;
  codigo_mensaje: string;
  estado_solicitud: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA' | 'CANCELADA';
  solicitada_en: string;
}
export interface PhysicalgoodsTransactionRow {
  id: string;
  solicitud_id: string;
  publicacion_id: string;
  propietario_id: string;
  receptor_id: string;
  estado_transaccion: 'RESERVADA' | 'PENDIENTE_CONFIRMACION' | 'COMPLETADA' | 'CANCELADA';
  modalidad_acordada: 'VENTA' | 'DONACION';
  monto_acordado: string | null;
  moneda: string;
}
export interface PhysicalgoodsReceivedRow extends PhysicalgoodsRequestRow {
  publicado_en: string;
  campus_id: string;
  campus_nombre: string;
  propietario_id: string;
  propietario_nombre: string;
  deleted_at: Date | null;
  titulo: string;
  estado_publicacion: string;
  modalidad: 'VENTA' | 'DONACION';
  precio: string | null;
  solicitante_nombre: string;
  solicitante_carreras: string[];
  mensaje: string;
  transaccion_id: string | null;
  estado_transaccion: PhysicalgoodsTransactionRow['estado_transaccion'] | null;
  modalidad_acordada: 'VENTA'|'DONACION'|null;
  monto_acordado: string|null;
  moneda_acordada: string|null;
}
export interface PhysicalgoodsTransactionDetailRow extends PhysicalgoodsTransactionRow {
  titulo: string;
  estado_publicacion: string;
  deleted_at: Date | null;
  campus_id: string;
  campus_nombre: string;
  propietario_nombre: string;
  receptor_nombre: string;
  iniciada_en: string;
  completada_en: string | null;
  cancelada_en: string | null;
  cancelada_por_id: string | null;
}
export interface PhysicalgoodsConfirmationRow {
  usuario_id: string;
  rol_confirmante: 'PROPIETARIO'|'RECEPTOR';
  confirmado_en: string;
}
export interface PhysicalgoodsCoordinationRow {
  id: string;
  destinatario_id: string;
  mensaje: string;
  created_at: string;
}
export interface PhysicalgoodsRatingRow {
  id:string;
  transaccion_id:string;
  evaluador_id:string;
  evaluado_id:string;
  puntuacion:number;
  created_at:string;
}
