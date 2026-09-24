import type { ObjectId } from 'mongodb';

export type CampusMapStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

/**
 * Representación mínima del documento `campus_maps` usada por el endpoint actual.
 *
 * `_id` es el identificador interno ObjectId de MongoDB. `campusId`, en cambio,
 * conserva el UUID de `public.campus.id` en Supabase como referencia lógica. No
 * existe una foreign key física entre ambos motores; el backend debe preservar
 * esa integridad cuando incorpore operaciones de escritura.
 *
 * Los edificios permanecen como `unknown[]` porque este checkpoint no necesita
 * tipar todavía toda la estructura anidada de pisos, transformaciones y POIs.
 */
export interface CampusMapDocument {
  _id?: ObjectId;
  campusId: string;
  version: number;
  status: CampusMapStatus;
  buildings: unknown[];
  createdAt: Date;
  updatedAt: Date;
}
