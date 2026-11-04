import type { PoolClient } from 'pg';
export async function digitalReportSnapshot(client:PoolClient,id:string,institutionId:string) {
  return (await client.query(`SELECT p.id,p.campus_id,p.propietario_id,p.tipo_recurso,p.titulo,p.descripcion,p.modalidad,p.precio,p.moneda,p.estado_publicacion,p.deleted_at,
    to_char(p.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at,
    COALESCE((SELECT json_agg(json_build_object('id',x.id,'name',x.nombre,'code',x.codigo)) FROM public.publicacion_carrera pc JOIN public.carrera x ON x.id=pc.carrera_id WHERE pc.publicacion_id=p.id),'[]'::json) AS careers,
    COALESCE((SELECT json_agg(json_build_object('id',x.id,'name',x.nombre,'code',x.codigo)) FROM public.publicacion_asignatura pa JOIN public.asignatura x ON x.id=pa.asignatura_id WHERE pa.publicacion_id=p.id),'[]'::json) AS subjects,
    COALESCE((SELECT json_agg(json_build_object('id',f.id,'name',f.nombre_original,'mimeType',f.mime_type,'sizeBytes',f.tamano_bytes)) FROM public.archivo_publicacion f WHERE f.publicacion_id=p.id AND f.tipo_archivo='RECURSO' AND f.deleted_at IS NULL),'[]'::json) AS files
    FROM public.publicacion_recurso p JOIN public.recurso_digital d ON d.publicacion_id=p.id JOIN public.campus c ON c.id=p.campus_id
    WHERE p.id=$1 AND c.institucion_id=$2 AND p.tipo_recurso='DIGITAL'`,[id,institutionId])).rows[0]??null;
}
