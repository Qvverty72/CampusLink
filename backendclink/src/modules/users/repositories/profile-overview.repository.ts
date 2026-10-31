import type { PoolClient } from 'pg';
import { DIGITAL_ACCESS_PROOF } from '../../marketplace/elibrary/repositories/elibrary.repository.js';
import { activityCounts } from '../../marketplace/elibrary/repositories/elibrary.activity.repository.js';
import { countPhysicalgoodsRequests } from '../../marketplace/physicalgoods/repositories/physicalgoods.requests.repository.js';
import { countOwnPhysicalgoodsTransactions } from '../../marketplace/physicalgoods/repositories/physicalgoods.transactions.repository.js';
import type { ProfileOverview } from '../types/profile-overview.types.js';


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
