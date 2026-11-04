import { loadPhysicalgoodsRequests } from './physicalgoodsApi';
import type { PhysicalgoodsTransactionTarget } from '../types/publication';

/** Buscar bajo demanda por el acuerdo exacto; nunca adivinar una solicitud por título/publicación. */
export async function findAgreementRequest(target: PhysicalgoodsTransactionTarget, received: boolean, signal: AbortSignal) {
  const visited = new Set<string>();
  for (let page = 1; !signal.aborted; page++) {
    const result = await loadPhysicalgoodsRequests(page, received, signal);
    if (signal.aborted) return null;
    const match = result.data.find(row => row.publication.id === target.publicationId && row.transaction?.id === target.transactionId);
    if (match) return { publicationId: match.publication.id, requestId: match.id };
    const signature = result.data.map(row => row.id).join(',');
    if (!result.meta.hasMore || !signature || visited.has(signature)) return null;
    visited.add(signature);
  }
  return null;
}
