import { inspectDependencies } from '../../database/health.js';
import { probeSupabaseTables } from '../../database/supabase/health.js';
import { probeMongoCollections } from '../../database/mongodb/health.js';
import type { DependencyChecks } from '../../types/api.types.js';

export function probeAnalyticsDependencies(): Promise<DependencyChecks> {
  return inspectDependencies({
    supabase: () => probeSupabaseTables([{"table":"interaccion_recurso"},{"table":"reporte"}]),
    mongodb: () => probeMongoCollections(["activities","activity_interactions"]),
  });
}

/**
 * Cuenta eventos ocurridos en `[from, until)` para un campus.
 * Usa el registro histórico de interacciones, no el estado JOINED actual como métrica pasada.
 */
export async function countActivityInteractions(campusId: string, from: Date, until: Date) {
  if (!campusId || !Number.isFinite(from.getTime()) || !Number.isFinite(until.getTime()) || until <= from) throw new Error('Invalid metric scope.');
  const { getMongoDb } = await import('../../config/mongodb.js');
  const counts = await getMongoDb().collection('activity_interactions').aggregate<{ _id: string; count: number; legacy: number }>([
    { $match: { campusId, occurredAt: { $gte: from, $lt: until }, type: { $in: ['VIEWED', 'JOINED', 'LEFT'] } } },
    { $group: { _id: '$type', count: { $sum: 1 }, legacy: { $sum: { $cond: [{ $eq: ['$provenance', 'LEGACY_STATE'] }, 1, 0] } } } },
  ]).toArray();
  return { viewed: counts.find(row => row._id === 'VIEWED')?.count ?? 0,
    joined: counts.find(row => row._id === 'JOINED')?.count ?? 0, left: counts.find(row => row._id === 'LEFT')?.count ?? 0,
    legacyEvents: counts.reduce((total, row) => total + row.legacy, 0) };
}
