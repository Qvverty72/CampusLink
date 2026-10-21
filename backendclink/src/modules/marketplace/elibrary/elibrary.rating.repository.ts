import type { PoolClient } from 'pg';
export async function findDigitalRating(client:PoolClient,id:string) {
  return (await client.query<{id:string;score:number;createdAt:Date|string}>('SELECT id,puntuacion AS score,created_at AS "createdAt" FROM public.valoracion WHERE transaccion_id=$1',[id])).rows[0]??null;
}
export async function insertDigitalRating(client:PoolClient,id:string,receiver:string,owner:string,score:number) {
  return (await client.query<{id:string;score:number;createdAt:Date|string}>(`INSERT INTO public.valoracion(transaccion_id,evaluador_id,evaluado_id,puntuacion)
    VALUES($1,$2,$3,$4) RETURNING id,puntuacion AS score,created_at AS "createdAt"`,[id,receiver,owner,score])).rows[0];
}
