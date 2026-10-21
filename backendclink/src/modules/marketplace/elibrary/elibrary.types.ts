import type { ModuleHealth } from '../../../types/api.types.js';

export type ElibraryHealth = ModuleHealth<'elibrary'>;

export interface DigitalInput {
  title: string;
  description: string;
  modality: 'VENTA' | 'DONACION';
  price: number | null;
  careerIds: string[];
  subjectIds: string[];
}
export interface DigitalAcademicOption { id: string; name: string; code: string | null }
export interface DigitalAcademicCatalog {
  careers: DigitalAcademicOption[];
  subjects: (DigitalAcademicOption & { careerIds: string[] })[];
}
export interface DigitalUpload { name: string; mimeType: string; bytes: Buffer }
export interface DigitalAttachment { id: string; name: string; mimeType: string; sizeBytes: number }
export interface DigitalPublication extends DigitalInput {
  id: string;
  ownerId: string;
  campusId: string;
  institutionId: string;
  campusName: string;
  status: string;
  currency: 'CLP';
  files: DigitalAttachment[];
  careers: DigitalAcademicOption[];
  subjects: DigitalAcademicOption[];
  updatedAt: string;
  acquired: boolean;
  isWithdrawn: boolean;
  acquisition: { transactionId:string;acquiredAt:string;modality:string;amount:number|null;currency:string } | null;
}
export interface DigitalResourceRow {
  id: string; campus_id: string; propietario_id: string; institucion_id: string;
  title: string;
  estado_publicacion: string; deleted_at: string | null;
}
export interface DigitalStoredFile {
  id: string; bucket_id: string; storage_path: string; nombre_original: string; mime_type: string; tamano_bytes: string;
}
export interface DigitalTradeRow {
  id: string; publicacion_id: string; solicitud_id: string; propietario_id: string; receptor_id: string;
  estado_transaccion: 'RESERVADA' | 'PENDIENTE_CONFIRMACION' | 'COMPLETADA' | 'CANCELADA';
  modalidad_acordada: 'VENTA' | 'DONACION'; monto_acordado: string | null; moneda: string;
  iniciada_en: string | Date; completada_en: string | Date | null; cancelada_en: string | Date | null;
}
export interface DigitalRequestRow {
  id: string; publicacion_id: string; solicitante_id: string; estado_solicitud: string; codigo_mensaje: string;
  solicitada_en: string | Date; title: string; ownerId: string; requesterName: string; message: string;
  transactionId: string | null; transactionStatus: string | null;
}
