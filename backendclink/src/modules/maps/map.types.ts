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
  schemaVersion?: number;
  model?: CampusMapModel;
  activatedAt?: Date | null;
  archivedAt?: Date | null;
}

export interface CampusMapModel {
  key: string;
  assetPath: string;
  dataSource: string;
  sourceHash: string;
}

/** Full write contract from the existing campus_maps bootstrap, with server-owned dates/id. */
export type NewCampusMap = Omit<CampusMapDocument, '_id' | 'createdAt' | 'updatedAt'> & {
  schemaVersion: number;
  model: CampusMapModel;
};
export type CampusMapChanges = Partial<Pick<CampusMapDocument,
  'status' | 'buildings' | 'model' | 'activatedAt' | 'archivedAt'>>;

export interface MapRepository {
  findActiveMapByCampusId(campusId: string): Promise<CampusMapDocument | null>;
  findMapById(id: ObjectId, campusId: string): Promise<CampusMapDocument | null>;
  insertMap(document: Omit<CampusMapDocument, '_id'>): Promise<CampusMapDocument>;
  updateMap(id: ObjectId, campusId: string, changes: CampusMapChanges & { updatedAt: Date }): Promise<CampusMapDocument | null>;
}

import type { ModuleHealth } from '../../types/api.types.js';
export type MapHealth = ModuleHealth<'maps'>;
