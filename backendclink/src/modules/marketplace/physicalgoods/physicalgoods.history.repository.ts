import type { PoolClient } from 'pg';
import type { VerifiedAuthConnection } from '../../auth/auth.types.js';

export async function physicalgoodsSnapshot(client: PoolClient, id: string) {
  const row = (await client.query(`SELECT p.id,p.campus_id,p.propietario_id,p.tipo_recurso,p.titulo,p.descripcion,p.modalidad,p.precio,p.moneda,
    p.estado_publicacion,p.deleted_at,to_char(p.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at,
    r.categoria_id,r.estado_uso FROM public.publicacion_recurso p JOIN public.recurso_fisico r ON r.publicacion_id=p.id WHERE p.id=$1`, [id])).rows[0];
  const images = (await client.query(`SELECT id,nombre_original,mime_type,tamano_bytes,orden,deleted_at FROM public.archivo_publicacion
    WHERE publicacion_id=$1 AND tipo_archivo='IMAGEN' ORDER BY orden,created_at,id`, [id])).rows;
  return { ...row, images };
}
export async function auditPhysicalgoods(client: PoolClient, auth: VerifiedAuthConnection, id: string,
  action: 'PUBLICAR_PUBLICACION' | 'EDITAR_PUBLICACION' | 'RETIRAR_PUBLICACION', before: unknown, after: unknown) {
  await client.query(`INSERT INTO public.auditoria(actor_usuario_id,institucion_id,campus_id,entidad_tipo,entidad_id,accion,datos_antes,datos_despues)
    VALUES($1,$2,$3,'publicacion_recurso',$4,$5,$6::jsonb,$7::jsonb)`,
    [auth.userId,auth.profile.institucion_id,auth.campusId,id,action,JSON.stringify(before),JSON.stringify(after)]);
}
