export const DIGITAL_MAX_BYTES = 25 * 1024 * 1024;
export interface DigitalFilters { q: string; careerId: string; subjectId: string; modality: '' | 'VENTA' | 'DONACION' }
export interface DigitalPage { page: number; limit: number; hasMore: boolean }
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
export interface DigitalFile { name: string; uri: string; sizeBytes: number; webFile?: File }
export interface DigitalAttachment { id: string; name: string; mimeType: string; sizeBytes: number }
export interface DigitalPublication extends DigitalInput {
  id: string;
  ownerId: string;
  campusId: string;
  campusName: string;
  institutionId: string;
  status: string;
  currency: 'CLP';
  files: DigitalAttachment[];
  careers: DigitalAcademicOption[];
  subjects: DigitalAcademicOption[];
  updatedAt: string;
  acquired: boolean;
  isWithdrawn: boolean;
  deletedAt: string | null;
  acquisition: { transactionId:string;acquiredAt:string;modality:string;amount:number|null;currency:string } | null;
}
