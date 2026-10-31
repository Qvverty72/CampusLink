import type { PoolClient } from 'pg';
import type { VerifiedAuthConnection } from '../auth/types/auth.types.js';
import { withPhysicalgoodsHistory } from '../marketplace/physicalgoods/physicalgoods.history.service.js';
import { DIGITAL_ACCESS_PROOF } from '../marketplace/elibrary/elibrary.repository.js';
import { activityCounts } from '../marketplace/elibrary/elibrary.activity.repository.js';
import { countPhysicalgoodsRequests } from '../marketplace/physicalgoods/physicalgoods.requests.repository.js';
import { countOwnPhysicalgoodsTransactions } from '../marketplace/physicalgoods/physicalgoods.transactions.repository.js';

export interface ProfileOverview {
  activePublications: number;
  pendingRequests: number;
  transactions: number;
  acquiredResources: number;
}

/** Totales completos, independientes de la primera página y de los stores del cliente. */
export async function queryProfileOverview(client: PoolClient, userId: string, institutionId: string): Promise<ProfileOverview> {
  const result = await client.query<Pick<ProfileOverview,'activePublications'|'acquiredResources'>>(`SELECT
    (SELECT count(*)::int FROM public.publicacion_recurso p JOIN public.campus c ON c.id=p.campus_id
      WHERE p.propietario_id=$1 AND p.deleted_at IS NULL AND (
        (p.tipo_recurso='FISICO' AND EXISTS(SELECT 1 FROM public.recurso_fisico r WHERE r.publicacion_id=p.id)) OR
        (p.tipo_recurso='DIGITAL' AND c.institucion_id=$2 AND EXISTS(SELECT 1 FROM public.recurso_digital d WHERE d.publicacion_id=p.id)))
      AND p.estado_publicacion IN ('DISPONIBLE','RESERVADO')) AS "activePublications",
    (SELECT count(*)::int FROM public.publicacion_recurso p JOIN public.recurso_digital d ON d.publicacion_id=p.id
      JOIN public.campus c ON c.id=p.campus_id WHERE p.tipo_recurso='DIGITAL' AND c.institucion_id=$2
      AND EXISTS(SELECT 1 FROM public.acceso_recurso_digital a JOIN public.transaccion_recurso t ON t.id=a.transaccion_id
        WHERE a.publicacion_id=p.id AND a.receptor_id=$1 AND t.propietario_id=p.propietario_id AND ${DIGITAL_ACCESS_PROOF})
      AND EXISTS(SELECT 1 FROM public.archivo_publicacion f WHERE f.publicacion_id=p.id AND f.deleted_at IS NULL AND f.tipo_archivo='RECURSO')) AS "acquiredResources"`,
  [userId, institutionId]);
  const physicalRequests = await countPhysicalgoodsRequests(client,userId);
  const physicalTransactions = await countOwnPhysicalgoodsTransactions(client,userId);
  const digital = await activityCounts(client,institutionId,userId);
  return {...result.rows[0],pendingRequests:physicalRequests.pendingRequests+digital.pendingRequests,
    transactions:physicalTransactions.active+digital.pendingTransactions};
}

export function getProfileOverview(auth: VerifiedAuthConnection) {
  // Comparte la revalidación de cuenta, institución, campus y capacidades del historial.
  return withPhysicalgoodsHistory(auth, (client, current) => queryProfileOverview(client, current.userId, current.profile.institucion_id));
}
