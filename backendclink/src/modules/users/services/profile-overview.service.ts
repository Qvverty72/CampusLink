import type { VerifiedAuthConnection } from '../../auth/types/auth.types.js';
import { withPhysicalgoodsHistory } from '../../marketplace/physicalgoods/public.js';
import { queryProfileOverview } from '../repositories/profile-overview.repository.js';


export function getProfileOverview(auth: VerifiedAuthConnection) {
  // Comparte la revalidación de cuenta, institución, campus y capacidades del historial.
  return withPhysicalgoodsHistory(auth, (client, current) => queryProfileOverview(client, current.userId, current.profile.institucion_id));
}
