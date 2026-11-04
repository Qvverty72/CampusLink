import type { WithId } from 'mongodb';
import { inspectDependencies } from '../../../database/health.js';
import { probeSupabaseTables } from '../../../database/supabase/health.js';
import { createServerSupabaseClient } from '../../../database/supabase/client.js';
import { probeMongoCollections } from '../../../database/mongodb/health.js';
import type { DependencyChecks } from '../../../shared/health/health.types.js';

import { getMongoDB as getMongoDb } from '../../../database/mongodb/client.js';
import type { CampusMapDocument } from '../types/map.types.js';
import { ApiError } from '../../../shared/errors/api-error.js';

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

/** Comprueba tablas y colección que necesita la consulta del mapa activo. */
export function probeMapDependencies(): Promise<DependencyChecks> {
  return inspectDependencies({
    supabase: () => probeSupabaseTables([{ table: 'campus' }]),
    mongodb: () => probeMongoCollections(['campus_maps']),
  });
}

// Comprueba la referencia técnica; esta consulta por sí sola no autoriza acceso al campus.
/** Indica si existe un campus activo en Supabase; no comprueba permisos del usuario. */
export async function isActiveCampus(campusId: string): Promise<boolean> {
  const { data, error } = await createServerSupabaseClient().from('campus')
    .select('id').eq('id', campusId).eq('activo', true).limit(1);
  if (error) throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Unable to verify campus reference');
  return Boolean(data?.length);
}
