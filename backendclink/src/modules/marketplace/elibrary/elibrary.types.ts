import type { ModuleHealth } from '../../../types/api.types.js';

export type ElibraryHealth = ModuleHealth<'elibrary'>;

export interface DigitalInput {
  title: string;
  description: string;
  modality: 'VENTA' | 'DONACION';
  price: number | null;
}
export interface DigitalUpload { name: string; mimeType: string; bytes: Buffer }
export interface DigitalPublication extends DigitalInput {
  id: string;
  ownerId: string;
  campusId: string;
  institutionId: string;
  campusName: string;
  status: 'DISPONIBLE';
  currency: 'CLP';
  files: { name: string; mimeType: string; sizeBytes: number }[];
}
