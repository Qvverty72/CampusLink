import type { ObjectId } from 'mongodb';

export type CampusMapStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

/**
 * Representación mínima del documento `campus_maps` usado por el endpoint actual.
 *
 * `_id` es el ObjectId interno de MongoDB. `campusId` conserva el UUID de
 * `public.campus.id` en Supabase como referencia lógica. No hay una foreign key
 * entre motores; cualquier operación de escritura futura deberá preservar esa integridad.
 *
 * Los edificios son `unknown[]` porque este endpoint aún no tipa su estructura
 * anidada de pisos, transformaciones y puntos de interés.
 */
export interface CampusMapDocument {
  _id?: ObjectId;
  campusId: string;
  version: number;
  status: CampusMapStatus;
  buildings: unknown[];
  createdAt: Date;
  updatedAt: Date;
  /** Serializa transaccionalmente el límite de publicaciones comunitarias; no versiona el contenido del mapa. */
  communityActivityCreationRevision?: number;
}

import type { ModuleHealth } from '../../../shared/health/health.types.js';
export type MapHealth = ModuleHealth<'maps'>;
