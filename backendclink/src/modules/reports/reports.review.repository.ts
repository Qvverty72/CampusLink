import type { PoolClient } from 'pg';
import type { PaginationParams } from '../../types/api.js';
import type { DigitalStoredFile } from '../marketplace/elibrary/elibrary.types.js';
import type { ReportPeople, ReportPerson, ReportResolutionDetail, ReportResolutionSummary, ReportReviewDetail, ReportReviewSummary, ReportStatus } from './reports.types.js';

const summaryProjection = `r.id,r.campus_id AS "campusId",r.entidad_tipo AS "entityType",r.entidad_id AS "entityId",
  COALESCE(r.contenido_reportado_json->'publication'->>'titulo',r.contenido_reportado_json->>'title') AS title,
  r.motivo AS reason,r.estado_reporte AS status,
  to_char(r.reportado_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "reportedAt"`;

const resolutionProjection = `jsonb_build_object('justification',r.fundamento_resolucion,
  'measure',r.medida_aplicada,'resolvedById',r.resuelto_por_id,
  'resolvedAt',to_char(r.resuelto_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) AS resolution`;
const finalResolution = `r.estado_reporte IN ('RESUELTO','DESESTIMADO')`;

/** Solo decisiones definitivas: EN_REVISION puede tener una medida todavía sin completar. */
export async function readReportResolutions(client: PoolClient, campusId: string, pagination: PaginationParams) {
  return (await client.query<ReportResolutionSummary>(`SELECT ${summaryProjection},${resolutionProjection}
    FROM public.reporte_contenido r WHERE r.campus_id=$1 AND ${finalResolution}
    ORDER BY r.resuelto_en DESC NULLS LAST,r.id DESC LIMIT $2 OFFSET $3`,
    [campusId, pagination.limit + 1, pagination.offset])).rows;
}

/** Historia independiente del estado y la existencia operacional del contenido o de sus cuentas. */
export async function findReportResolution(client: PoolClient, campusId: string, id: string) {
  return (await client.query<ReportResolutionDetail>(`SELECT ${summaryProjection},${resolutionProjection},
    r.descripcion AS description,r.contenido_reportado_json AS snapshot,
    jsonb_build_object('id',r.reportante_id,'name',NULL) AS reporter,
    NULL AS "currentPublication",NULL AS "currentTransaction"
    FROM public.reporte_contenido r WHERE r.campus_id=$1 AND r.id=$2 AND ${finalResolution}`,
    [campusId, id])).rows[0] ?? null;
}

/** El campus se aplica en SQL antes de paginar o buscar un identificador. */
export async function readReportReviews(client: PoolClient, campusId: string, pagination: PaginationParams, status?: ReportStatus) {
  return (await client.query<ReportReviewSummary>(`SELECT ${summaryProjection},
    CASE WHEN ${finalResolution} THEN jsonb_build_object('measure',r.medida_aplicada,
      'resolvedById',r.resuelto_por_id,'resolvedAt',to_char(r.resuelto_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ELSE NULL END AS resolution
    FROM public.reporte_contenido r WHERE r.campus_id=$1 ${status ? 'AND r.estado_reporte=$4' : ''}
    ORDER BY r.reportado_en DESC,r.id DESC LIMIT $2 OFFSET $3`,
    status ? [campusId, pagination.limit + 1, pagination.offset, status] : [campusId, pagination.limit + 1, pagination.offset])).rows;
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

/** Sólo IDs ya vinculados al caso autorizado; no reconstruye participantes desde contenido vivo. */
export async function readReportPeople(client: PoolClient, report: ReportReviewDetail | ReportResolutionDetail): Promise<ReportPeople> {
  const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) ? value.toLowerCase() : null;
  const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const snapshot = record(report.snapshot), publication = record(snapshot.publication), agreement = record(snapshot.transaction);
  const reporterId = uuid(report.reporter?.id), decisionId = uuid(report.resolution?.resolvedById);
  let reportedId: string | null = null;
  if (report.entityType === 'ACTIVIDAD') reportedId = uuid(snapshot.createdByUserId);
  else if (['PUBLICACION_FISICA', 'PUBLICACION_DIGITAL'].includes(report.entityType)) reportedId = uuid(publication.propietario_id);
  else if (report.entityType === 'TRANSACCION') {
    const owner = uuid(agreement.propietario_id), receiver = uuid(agreement.receptor_id);
    if (owner && receiver && owner !== receiver) {
      if (reporterId === owner) reportedId = receiver;
      else if (reporterId === receiver) reportedId = owner;
    }
  }
  const ids = [...new Set([reporterId, reportedId, decisionId].filter((id): id is string => !!id))];
  const rows = ids.length ? (await client.query<ReportPerson>(`SELECT p.id,NULLIF(btrim(p.nombre_completo),'') AS name,
    NULLIF(btrim(u.email),'') AS email FROM public.perfil_usuario p LEFT JOIN auth.users u ON u.id=p.id
    WHERE p.id=ANY($1::uuid[])`, [ids])).rows : [];
  const byId = new Map(rows.map(row => [row.id, row]));
  const person = (id: string | null) => id ? byId.get(id) ?? { id, name: null, email: null } : null;
  return { source: 'CURRENT_PROFILE', reporter: person(reporterId), reported: person(reportedId), decisionMaker: person(decisionId) };
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
