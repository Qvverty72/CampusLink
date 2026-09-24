import type { WithId } from 'mongodb';

import { getMongoDb } from '../../config/mongodb.js';
import type { CampusMapDocument } from './map.types.js';

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
