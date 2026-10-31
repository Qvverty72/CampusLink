import type { PoolClient } from 'pg';

const eligible=`p.tipo_recurso='FISICO' AND p.deleted_at IS NULL AND p.estado_publicacion IN ('DISPONIBLE','RESERVADO')
  AND p.publicado_en <= $1::timestamptz`;
const undelivered=`NOT EXISTS (SELECT 1 FROM public.notificacion n WHERE n.publicacion_id=p.id
  AND n.destinatario_id=p.propietario_id AND n.tipo_notificacion='PHYSICAL_PUBLICATION_CLOSE_REMINDER')`;

/** Incluye avisos eliminados en la comprobación: eliminarlos no reinicia el plazo ni permite duplicarlos. */
export async function findPhysicalgoodsReminderCandidates(client:PoolClient,before:Date) {
  return (await client.query<{id:string;propietario_id:string}>(`SELECT p.id,p.propietario_id FROM public.publicacion_recurso p
    JOIN public.recurso_fisico r ON r.publicacion_id=p.id JOIN public.perfil_usuario u ON u.id=p.propietario_id
    WHERE ${eligible} AND ${undelivered} AND u.estado_cuenta='ACTIVA' AND u.deleted_at IS NULL
    AND (u.verificado_en IS NOT NULL OR EXISTS(SELECT 1 FROM public.usuario_rol ur JOIN public.rol role ON role.id=ur.rol_id
      WHERE ur.perfil_usuario_id=u.id AND ur.campus_id=u.campus_id AND ur.revocado_en IS NULL AND role.nombre IN ('ADMINISTRADOR','USUARIO_AUTORIZADO')))
    ORDER BY p.publicado_en,p.id LIMIT 100`,[before])).rows;
}
export async function lockPhysicalgoodsReminder(client:PoolClient,before:Date,id:string,ownerId:string) {
  return (await client.query<{id:string;titulo:string;propietario_id:string}>(`SELECT p.id,p.titulo,p.propietario_id
    FROM public.publicacion_recurso p JOIN public.recurso_fisico r ON r.publicacion_id=p.id
    WHERE p.id=$2 AND p.propietario_id=$3 AND ${eligible} FOR UPDATE OF p,r`,[before,id,ownerId])).rows[0]??null;
}
/** Se invoca después del lock de publicación en una sentencia nueva, para ver entregas concurrentes ya confirmadas. */
export async function insertPhysicalgoodsReminder(client:PoolClient,before:Date,id:string,title:string,message:string) {
  return (await client.query(`INSERT INTO public.notificacion(destinatario_id,publicacion_id,tipo_notificacion,titulo,mensaje,created_at)
    SELECT p.propietario_id,p.id,'PHYSICAL_PUBLICATION_CLOSE_REMINDER',$3,$4,clock_timestamp()
    FROM public.publicacion_recurso p WHERE p.id=$2 AND ${eligible} AND ${undelivered} RETURNING id`,
    [before,id,title,message])).rows.length===1;
}
