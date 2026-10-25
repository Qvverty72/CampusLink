import type {PoolClient} from 'pg';

export interface PhysicalgoodsTerms {modality:'VENTA'|'DONACION';amount:number|null;currency:string}
interface TermsRow {id:string;modalidad:string;precio:string|null;moneda:string}
function terms(row:TermsRow):PhysicalgoodsTerms|null {
  if(!['VENTA','DONACION'].includes(row.modalidad)||!/^[A-Z]{3}$/.test(row.moneda))return null;
  const amount=row.modalidad==='DONACION'?null:row.precio===null?NaN:Number(row.precio);
  if(amount!==null&&(!Number.isFinite(amount)||amount<=0||amount>Number.MAX_SAFE_INTEGER))return null;
  return {modality:row.modalidad as PhysicalgoodsTerms['modality'],amount,currency:row.moneda};
}

/** Solo IDs previamente autorizados por el servicio. No devuelve el contenido de la auditoría. */
export async function findPhysicalgoodsRequestTerms(client:PoolClient,requestIds:string[]) {
  if(!requestIds.length)return new Map<string,PhysicalgoodsTerms>();
  const rows=(await client.query<TermsRow>(`SELECT s.id,
    historical.data->>'modalidad' AS modalidad,historical.data->>'precio' AS precio,historical.data->>'moneda' AS moneda
    FROM public.solicitud_recurso s JOIN public.publicacion_recurso p ON p.id=s.publicacion_id
    JOIN LATERAL (
      SELECT version.data FROM (
        SELECT to_jsonb(p) AS data
        UNION ALL
        SELECT snapshot.data FROM public.auditoria a
          CROSS JOIN LATERAL (VALUES(a.datos_antes),(a.datos_despues)) AS snapshot(data)
          WHERE a.entidad_tipo='publicacion_recurso' AND a.entidad_id=p.id::text AND a.campus_id=p.campus_id
            AND snapshot.data->>'id'=p.id::text AND snapshot.data->>'tipo_recurso'='FISICO'
      ) version
      WHERE version.data->>'updated_at' IS NOT NULL
        AND (version.data->>'updated_at')::timestamptz<=s.solicitada_en
        AND version.data->>'modalidad' IN ('VENTA','DONACION')
      ORDER BY (version.data->>'updated_at')::timestamptz DESC LIMIT 1
    ) historical ON true
    WHERE s.id=ANY($1::uuid[]) AND p.tipo_recurso='FISICO'`,[requestIds])).rows;
  const result=new Map<string,PhysicalgoodsTerms>();
  for(const row of rows){const value=terms(row);if(value)result.set(row.id,value);}
  return result;
}

/** Precio de alta verificable; no llama «original» al estado actual de una publicación antigua sin evidencia. */
export async function findPhysicalgoodsOriginalTerms(client:PoolClient,publicationId:string):Promise<PhysicalgoodsTerms|null> {
  const row=(await client.query<TermsRow>(`SELECT p.id,a.datos_despues->>'modalidad' AS modalidad,
      a.datos_despues->>'precio' AS precio,a.datos_despues->>'moneda' AS moneda
    FROM public.publicacion_recurso p JOIN public.auditoria a ON a.entidad_id=p.id::text
      AND a.entidad_tipo='publicacion_recurso' AND a.campus_id=p.campus_id AND a.accion='PUBLICAR_PUBLICACION'
      AND a.datos_despues->>'id'=p.id::text AND a.datos_despues->>'tipo_recurso'='FISICO'
    WHERE p.id=$1 AND p.tipo_recurso='FISICO' ORDER BY a.created_at,a.id LIMIT 1`,[publicationId])).rows[0];
  return row?terms(row):null;
}
