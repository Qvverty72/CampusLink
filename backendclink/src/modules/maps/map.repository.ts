import type { WithId } from 'mongodb';
import { inspectDependencies } from '../../database/health.js';
import { probeSupabaseTables } from '../../database/supabase/health.js';
import { supabaseTechnical } from '../../database/supabase/client.js';
import { probeMongoCollections } from '../../database/mongodb/health.js';
import type { DependencyChecks } from '../../types/api.types.js';

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

export function probeMapDependencies(): Promise<DependencyChecks> {
  return inspectDependencies({
    supabase: () => probeSupabaseTables([{ table: 'campus' }]),
    mongodb: () => probeMongoCollections(['campus_maps']),
  });
}

// Technical reference check only: this is not authorization by campus.
export async function isActiveCampus(campusId: string): Promise<boolean> {
  const { data, error } = await supabaseTechnical.from('campus')
    .select('id').eq('id', campusId).eq('activo', true).limit(1);
  if (error) throw new Error('Unable to verify campus reference');
  return Boolean(data?.length);
}
