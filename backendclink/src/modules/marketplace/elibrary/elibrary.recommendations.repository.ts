import type { PoolClient } from 'pg';
import type { PaginationParams } from '../../../types/api.js';
import { DIGITAL_ACCESS_PROOF } from './elibrary.repository.js';
export interface DigitalRecommendationSignals {id:string;careerMatches:number;subjectMatches:number;ownView:boolean;ownRequest:boolean;activity:number;score:number}
export async function rankDigitalRecommendations(client:PoolClient,institutionId:string,userId:string,page:PaginationParams,weights:{career:number;subject:number;view:number;request:number;activity:number}) {
  return (await client.query<DigitalRecommendationSignals>(`WITH careers AS (
      SELECT c.id FROM public.usuario_carrera uc JOIN public.carrera c ON c.id=uc.carrera_id
      WHERE uc.perfil_usuario_id=$2 AND c.institucion_id=$1 AND c.activo), subjects AS (
      SELECT DISTINCT ca.asignatura_id FROM public.carrera_asignatura ca JOIN careers c ON c.id=ca.carrera_id JOIN public.asignatura s ON s.id=ca.asignatura_id WHERE s.activo),
    candidates AS (SELECT p.id,p.publicado_en,
      (SELECT count(*)::int FROM public.publicacion_carrera pc JOIN careers c ON c.id=pc.carrera_id WHERE pc.publicacion_id=p.id) AS "careerMatches",
      (SELECT count(*)::int FROM public.publicacion_asignatura pa JOIN subjects s ON s.asignatura_id=pa.asignatura_id WHERE pa.publicacion_id=p.id) AS "subjectMatches",
      EXISTS(SELECT 1 FROM public.interaccion_recurso v WHERE v.publicacion_id=p.id AND v.perfil_usuario_id=$2 AND v.tipo_interaccion='VISTA') AS "ownView",
      EXISTS(SELECT 1 FROM public.solicitud_recurso r WHERE r.publicacion_id=p.id AND r.solicitante_id=$2 AND r.estado_solicitud IN ('PENDIENTE','ACEPTADA')) AS "ownRequest",
      LEAST(5,(SELECT count(DISTINCT v.perfil_usuario_id)::int FROM public.interaccion_recurso v WHERE v.publicacion_id=p.id AND v.tipo_interaccion='VISTA')+
        (SELECT count(DISTINCT r.solicitante_id)::int FROM public.solicitud_recurso r WHERE r.publicacion_id=p.id AND r.estado_solicitud IN ('PENDIENTE','ACEPTADA'))) AS activity
      FROM public.publicacion_recurso p JOIN public.recurso_digital d ON d.publicacion_id=p.id JOIN public.campus c ON c.id=p.campus_id
      WHERE c.institucion_id=$1 AND p.tipo_recurso='DIGITAL' AND p.propietario_id<>$2 AND p.deleted_at IS NULL AND p.estado_publicacion='DISPONIBLE'
      AND EXISTS(SELECT 1 FROM public.archivo_publicacion f WHERE f.publicacion_id=p.id AND f.tipo_archivo='RECURSO' AND f.deleted_at IS NULL)
      AND NOT EXISTS(SELECT 1 FROM public.acceso_recurso_digital a JOIN public.transaccion_recurso t ON t.id=a.transaccion_id
        WHERE a.publicacion_id=p.id AND a.receptor_id=$2 AND t.propietario_id=p.propietario_id AND ${DIGITAL_ACCESS_PROOF}))
    SELECT *, (LEAST(3,"careerMatches")*$3+LEAST(3,"subjectMatches")*$4+CASE WHEN "ownView" THEN $5 ELSE 0 END+CASE WHEN "ownRequest" THEN $6 ELSE 0 END+activity*$7)::int AS score
    FROM candidates ORDER BY score DESC,publicado_en DESC,id DESC LIMIT $8 OFFSET $9`,
    [institutionId,userId,weights.career,weights.subject,weights.view,weights.request,weights.activity,page.limit+1,page.offset])).rows;
}
export async function insertDigitalView(client:PoolClient,institutionId:string,userId:string,id:string) {
  await client.query(`INSERT INTO public.interaccion_recurso(perfil_usuario_id,publicacion_id,tipo_interaccion)
    SELECT $2,p.id,'VISTA' FROM public.publicacion_recurso p JOIN public.recurso_digital d ON d.publicacion_id=p.id JOIN public.campus c ON c.id=p.campus_id
    WHERE p.id=$3 AND c.institucion_id=$1 AND p.tipo_recurso='DIGITAL' AND p.propietario_id<>$2 AND p.deleted_at IS NULL AND p.estado_publicacion='DISPONIBLE'
    AND NOT EXISTS(SELECT 1 FROM public.interaccion_recurso v WHERE v.publicacion_id=p.id AND v.perfil_usuario_id=$2 AND v.tipo_interaccion='VISTA' AND v.created_at>=now()-interval '24 hours')`,[institutionId,userId,id]);
}
