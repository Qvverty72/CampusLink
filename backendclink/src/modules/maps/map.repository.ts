import type { ObjectId, WithId } from 'mongodb';
import { inspectDependencies } from '../../database/health.js';
import { probeSupabaseTables } from '../../database/supabase/health.js';
import { probeMongoCollections } from '../../database/mongodb/health.js';
import type { DependencyChecks } from '../../types/api.types.js';

import { getMongoDb } from '../../config/mongodb.js';
import type { CampusMapChanges, CampusMapDocument } from './map.types.js';

const CAMPUS_MAPS_COLLECTION = 'campus_maps';

/**
 * Busca el único mapa ACTIVE asociado al UUID de un campus de Supabase.
 *
 * Esta es la única capa del módulo que conoce MongoDB y el nombre de la colección.
 * La consulta coincide con el índice parcial que impide más de un mapa ACTIVE por
 * campus, por lo que `findOne` expresa el contrato de persistencia esperado.
 */
export async function findActiveMapByCampusId(
  campusId: string,
): Promise<WithId<CampusMapDocument> | null> {
  return getMongoDb()
    .collection<CampusMapDocument>(CAMPUS_MAPS_COLLECTION)
    .findOne({ campusId, status: 'ACTIVE' });
}

export function probeMapDependencies(): Promise<DependencyChecks> {
  return inspectDependencies({
    supabase: () => probeSupabaseTables([{ table: 'campus' }]),
    mongodb: () => probeMongoCollections(['campus_maps']),
  });
}

export function findMapById(id: ObjectId, campusId: string): Promise<WithId<CampusMapDocument> | null> {
  return getMongoDb().collection<CampusMapDocument>(CAMPUS_MAPS_COLLECTION).findOne({ _id: id, campusId });
}

export async function insertMap(document: Omit<CampusMapDocument, '_id'>): Promise<WithId<CampusMapDocument>> {
  const result = await getMongoDb().collection<CampusMapDocument>(CAMPUS_MAPS_COLLECTION).insertOne(document);
  if (!result.acknowledged) throw new Error('Map write was not acknowledged');
  return { ...document, _id: result.insertedId };
}

export function updateMap(id: ObjectId, campusId: string, changes: CampusMapChanges & { updatedAt: Date }) {
  return getMongoDb().collection<CampusMapDocument>(CAMPUS_MAPS_COLLECTION)
    .findOneAndUpdate({ _id: id, campusId }, { $set: changes }, { returnDocument: 'after' });
}
