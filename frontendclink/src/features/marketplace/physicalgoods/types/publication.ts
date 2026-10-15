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
export interface PhysicalgoodsRequest {
  id: string;
  publicationId: string;
  requesterId: string;
  ownerId: string;
  campusId: string;
  messageCode: string;
  status: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA' | 'CANCELADA';
  requestedAt: string;
}
export interface PhysicalgoodsRequestOptions {
  canRequest: boolean;
  activeRequest: PhysicalgoodsRequest | null;
  messages: { code:string; label:string }[];
}
export interface PhysicalgoodsReceivedRequest {
  id: string;
  publication: Pick<PhysicalgoodsResource,'id'|'title'|'status'|'modality'|'price'> & { canView:boolean;isWithdrawn:boolean };
  campus:{id:string;name:string};
  owner:{id:string;fullName:string};
  canResolve:boolean;
  requester: { id:string; fullName:string };
  message: string;
  messageCode: string;
  status: PhysicalgoodsRequest['status'];
  requestedAt: string;
  transaction: { id:string; status:'RESERVADA'|'PENDIENTE_CONFIRMACION'|'COMPLETADA'|'CANCELADA' } | null;
}
export interface PhysicalgoodsReceivedPage {
  data: PhysicalgoodsReceivedRequest[];
  meta: PhysicalgoodsPage['meta'];
}
export interface PhysicalgoodsTransactionTarget { publicationId:string; transactionId:string }
export interface PhysicalgoodsTransaction {
  id:string;
  publication:{id:string;title:string;status:string;isWithdrawn:boolean};
  campus:{id:string;name:string};
  owner:{id:string;fullName:string};
  receiver:{id:string;fullName:string};
  role:'PROPIETARIO'|'RECEPTOR';
  status:'RESERVADA'|'PENDIENTE_CONFIRMACION'|'COMPLETADA'|'CANCELADA';
  modality:'VENTA'|'DONACION';
  amount:number|null;
  currency:string;
  startedAt:string;
  completedAt:string|null;
  cancelledAt:string|null;
  cancelledById:string|null;
  confirmations:{userId:string;role:'PROPIETARIO'|'RECEPTOR';confirmedAt:string}[];
  canConfirm:boolean;
  canCancel:boolean;
}
export interface PhysicalgoodsCoordinationOptions { buildings:{id:string;name:string;floors:{id:string;name:string}[]}[] }
export interface PhysicalgoodsCoordinationMessage { id:string;senderId:string;recipientId:string;text:string;createdAt:string }
export interface PhysicalgoodsCoordinationPage {data:PhysicalgoodsCoordinationMessage[];meta:PhysicalgoodsPage['meta']}
export interface PhysicalgoodsOwnPublication extends PhysicalgoodsResource {
  campus:{id:string;name:string};
  isWithdrawn:boolean;
  canView:boolean;
  publishedAt:string;
}
export interface PhysicalgoodsOwnDetail extends PhysicalgoodsOwnPublication {
  description:string;
  images:PhysicalgoodsGallery['images'];
  expiresIn:number;
}
export type PhysicalgoodsTransactionSummary=Pick<PhysicalgoodsTransaction,'id'|'publication'|'campus'|'role'|'status'|'modality'|'amount'|'currency'|'startedAt'>;
export interface PhysicalgoodsOwnPage {data:PhysicalgoodsOwnPublication[];meta:PhysicalgoodsPage['meta']}
export interface PhysicalgoodsTransactionsPage {data:PhysicalgoodsTransactionSummary[];meta:PhysicalgoodsPage['meta']}
