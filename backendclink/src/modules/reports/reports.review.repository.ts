import type { PoolClient } from 'pg';
import type { PaginationParams } from '../../types/api.js';
import type { DigitalStoredFile } from '../marketplace/elibrary/elibrary.types.js';
import type { ReportReviewDetail, ReportReviewSummary } from './reports.types.js';

const summaryProjection = `r.id,r.campus_id AS "campusId",r.entidad_tipo AS "entityType",r.entidad_id AS "entityId",
  COALESCE(r.contenido_reportado_json->'publication'->>'titulo',r.contenido_reportado_json->>'title') AS title,
  r.motivo AS reason,r.estado_reporte AS status,
  to_char(r.reportado_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "reportedAt"`;

/** El campus se aplica en SQL antes de paginar o buscar un identificador. */
export async function readReportReviews(client: PoolClient, campusId: string, pagination: PaginationParams) {
  return (await client.query<ReportReviewSummary>(`SELECT ${summaryProjection} FROM public.reporte_contenido r
    WHERE r.campus_id=$1 ORDER BY r.reportado_en DESC,r.id DESC LIMIT $2 OFFSET $3`,
    [campusId, pagination.limit + 1, pagination.offset])).rows;
}

export async function findReportReview(client: PoolClient, campusId: string, id: string, lock = false) {
  return (await client.query<ReportReviewDetail>(`SELECT ${summaryProjection},r.descripcion AS description,
    jsonb_build_object('id',r.reportante_id,'name',u.nombre_completo) AS reporter,
    r.contenido_reportado_json AS snapshot,
    CASE WHEN r.resuelto_por_id IS NULL THEN NULL ELSE jsonb_build_object(
      'justification',r.fundamento_resolucion,'measure',r.medida_aplicada,'resolvedById',r.resuelto_por_id,
      'resolvedAt',to_char(r.resuelto_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) END AS resolution
    FROM public.reporte_contenido r LEFT JOIN public.perfil_usuario u ON u.id=r.reportante_id
    WHERE r.id=$1 AND r.campus_id=$2 ${lock ? 'FOR UPDATE OF r' : ''}`, [id, campusId])).rows[0] ?? null;
}

/** Antecedentes actuales complementan, sin sustituir, la evidencia del envío. Incluye retirada lógica. */
export async function readReportBackground(client: PoolClient, report: ReportReviewDetail) {
  const publicationId = report.snapshot?.publication?.id;
  if (typeof publicationId !== 'string') return { currentPublication: null, currentTransaction: null };
  const publication = (await client.query<NonNullable<ReportReviewDetail['currentPublication']>>(
    `SELECT id,titulo AS title,estado_publicacion AS status,deleted_at AS "deletedAt"
     FROM public.publicacion_recurso WHERE id=$1 AND campus_id=$2`, [publicationId, report.campusId])).rows[0] ?? null;
  const transaction = report.entityType === 'TRANSACCION' && publication
    ? (await client.query<Record<string, unknown>>(`SELECT t.id,t.estado_transaccion AS status,
      t.modalidad_acordada AS modality,t.monto_acordado AS amount,t.moneda AS currency,
      t.iniciada_en AS "startedAt",t.completada_en AS "completedAt",t.cancelada_en AS "cancelledAt",
      jsonb_build_object('id',t.propietario_id,'name',o.nombre_completo) AS owner,
      jsonb_build_object('id',t.receptor_id,'name',u.nombre_completo) AS receiver,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('userId',f.usuario_id,'role',f.rol_confirmante,'confirmedAt',f.confirmado_en))
        FROM public.confirmacion_transaccion f WHERE f.transaccion_id=t.id),'[]'::jsonb) AS confirmations
      FROM public.transaccion_recurso t LEFT JOIN public.perfil_usuario o ON o.id=t.propietario_id
      LEFT JOIN public.perfil_usuario u ON u.id=t.receptor_id WHERE t.id=$1 AND t.publicacion_id=$2`,
      [report.entityId, publicationId])).rows[0] ?? null : null;
  return { currentPublication: publication, currentTransaction: transaction };
}

/** Los originales retirados se conservan para evidencia; no se amplía la descarga pública. */
export async function findReportedDigitalFile(client: PoolClient, publicationId: string, fileId: string) {
  return (await client.query<DigitalStoredFile>(`SELECT id,bucket_id,storage_path,nombre_original,mime_type,tamano_bytes
    FROM public.archivo_publicacion WHERE id=$1 AND publicacion_id=$2 AND tipo_archivo='RECURSO' FOR SHARE`,
    [fileId, publicationId])).rows[0] ?? null;
}
