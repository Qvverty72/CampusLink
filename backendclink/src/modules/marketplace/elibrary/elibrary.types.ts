import type { ModuleHealth } from '../../../types/api.types.js';

export type ElibraryHealth = ModuleHealth<'elibrary'>;

export interface DigitalInput {
  title: string;
  description: string;
  modality: 'VENTA' | 'DONACION';
  price: number | null;
}
export interface DigitalUpload { name: string; mimeType: string; bytes: Buffer }
export interface DigitalAttachment { id: string; name: string; mimeType: string; sizeBytes: number }
export interface DigitalPublication extends DigitalInput {
  id: string;
  ownerId: string;
  campusId: string;
  institutionId: string;
  campusName: string;
  status: 'DISPONIBLE';
  currency: 'CLP';
  files: DigitalAttachment[];
}
export interface DigitalResourceRow {
  id: string; campus_id: string; propietario_id: string; institucion_id: string;
  estado_publicacion: string; deleted_at: string | null;
}
export interface DigitalStoredFile {
  id: string; bucket_id: string; storage_path: string; nombre_original: string; mime_type: string; tamano_bytes: string;
}
