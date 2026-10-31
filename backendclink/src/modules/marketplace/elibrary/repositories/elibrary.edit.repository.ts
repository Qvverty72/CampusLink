import type { PoolClient } from 'pg';
import type { DigitalInput } from '../types/elibrary.types.js';
export async function updateDigitalContent(client:PoolClient,id:string,input:Pick<DigitalInput,'title'|'description'|'modality'|'price'>) {
  await client.query(`UPDATE public.publicacion_recurso SET titulo=$2,descripcion=$3,modalidad=$4,precio=$5,
    updated_at=GREATEST(clock_timestamp(),updated_at+interval '1 microsecond') WHERE id=$1`,[id,input.title,input.description,input.modality,input.price]);
}
export async function retireDigitalPublication(client:PoolClient,id:string) {
  await client.query(`UPDATE public.publicacion_recurso SET deleted_at=clock_timestamp(),updated_at=GREATEST(clock_timestamp(),updated_at+interval '1 microsecond') WHERE id=$1`,[id]);
}
