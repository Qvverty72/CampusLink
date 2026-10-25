import type {PoolClient} from 'pg';

export interface OwnerRatingSummary {averageRating:number|null;ratingCount:number}
type RatingScope={resourceType:'FISICO';campusId:string}|{resourceType:'DIGITAL';institutionId:string};

/** IDs come from an already authorized request list. No evaluator identities leave this projection. */
export async function findOwnerRatings(client:PoolClient,ownerIds:string[],scope:RatingScope){
  const ids=[...new Set(ownerIds)];
  const ratings=new Map<string,OwnerRatingSummary>();
  if(!ids.length)return ratings;
  const rows=(await client.query<OwnerRatingSummary&{ownerId:string}>(`SELECT agreement.propietario_id AS "ownerId",
    avg(rating.puntuacion)::float8 AS "averageRating",count(rating.id)::int AS "ratingCount"
    FROM public.transaccion_recurso agreement
    JOIN public.publicacion_recurso resource ON resource.id=agreement.publicacion_id
    JOIN public.campus origin ON origin.id=resource.campus_id
    JOIN public.valoracion rating ON rating.transaccion_id=agreement.id
      AND rating.evaluado_id=agreement.propietario_id AND rating.evaluador_id=agreement.receptor_id
      AND rating.puntuacion BETWEEN 1 AND 5
    WHERE agreement.propietario_id=ANY($1::uuid[]) AND resource.propietario_id=agreement.propietario_id
      AND resource.tipo_recurso=$2 AND (resource.campus_id=$3::uuid OR origin.institucion_id=$4::uuid)
      AND agreement.estado_transaccion='COMPLETADA'
      AND EXISTS(SELECT 1 FROM public.confirmacion_transaccion confirmation WHERE confirmation.transaccion_id=agreement.id
        AND confirmation.usuario_id=agreement.propietario_id AND confirmation.rol_confirmante='PROPIETARIO')
      AND EXISTS(SELECT 1 FROM public.confirmacion_transaccion confirmation WHERE confirmation.transaccion_id=agreement.id
        AND confirmation.usuario_id=agreement.receptor_id AND confirmation.rol_confirmante='RECEPTOR')
    GROUP BY agreement.propietario_id`,[ids,scope.resourceType,scope.resourceType==='FISICO'?scope.campusId:null,scope.resourceType==='DIGITAL'?scope.institutionId:null])).rows;
  for(const id of ids)ratings.set(id,{averageRating:null,ratingCount:0});
  for(const row of rows)ratings.set(row.ownerId,{averageRating:row.averageRating,ratingCount:row.ratingCount});
  return ratings;
}
