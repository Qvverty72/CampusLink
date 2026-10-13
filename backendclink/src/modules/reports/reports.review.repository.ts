import { ObjectId } from 'mongodb';
import { withPostgresTransaction } from '../../database/supabase/postgres.js';
import { getMongoDb } from '../../config/mongodb.js';
import { accessRepository } from '../users/access.repository.js';
import type { AccessConnection } from '../users/access.types.js';
import type { ActivityDocument } from '../activities/activities.types.js';
import type { AuthProfile } from '../auth/auth.types.js';
import type { ReviewQuery, ReviewRecord, ReviewSummary, ReviewPerson } from './reports.review.types.js';

const columns = `r.id,r.campus_id AS "campusId",r.entidad_tipo AS "targetType",r.entidad_id AS "targetId",
  coalesce(nullif(r.contenido_reportado_json->>'title',''),nullif(r.contenido_reportado_json->'publication'->>'title','')) AS title,
  r.motivo AS reason,r.estado_reporte AS status,
  to_char(r.reportado_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "reportedAt"`;
const publicationColumns = `p.id,p.campus_id AS "campusId",p.propietario_id AS "ownerId",p.tipo_recurso AS "resourceType",
  p.titulo AS title,p.descripcion AS description,p.modalidad AS modality,p.precio::text AS price,p.moneda AS currency,
  p.estado_publicacion AS status,p.publicado_en AS "publishedAt",p.updated_at AS "updatedAt",p.deleted_at AS "deletedAt"`;

export function withReviewTransaction<T>(operation: (repository: ReturnType<typeof reviewRepository>) => Promise<T>) {
  return withPostgresTransaction(client => operation(reviewRepository(client)));
}

// Reads have no public visibility filter: access is authorized by the service first.
// Every content lookup still includes its original campus; client text is never SQL.
export function reviewRepository(client: AccessConnection) {
  return {
    access: accessRepository(client),
    actor: async (id: string) => (await client.query<Pick<AuthProfile, 'id' | 'estado_cuenta' | 'deleted_at'>>(
      'SELECT id,estado_cuenta,deleted_at FROM public.perfil_usuario WHERE id=$1 FOR SHARE', [id])).rows[0],
    list: async (campusId: string, query: ReviewQuery) => {
      const values: unknown[] = [campusId];
      let where = 'r.campus_id=$1';
      if (query.status) { values.push(query.status); where += ` AND r.estado_reporte=$${values.length}`; }
      if (query.targetType) { values.push(query.targetType); where += ` AND r.entidad_tipo=$${values.length}`; }
      values.push(query.limit + 1, query.offset);
      return (await client.query<ReviewSummary>(`SELECT ${columns} FROM public.reporte_contenido r WHERE ${where}
        ORDER BY r.reportado_en DESC,r.id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values)).rows;
    },
    detail: async (campusId: string, reportId: string) => (await client.query<ReviewRecord>(`
      SELECT ${columns},r.descripcion AS description,r.reportante_id AS "reporterId",r.contenido_reportado_json AS snapshot
      FROM public.reporte_contenido r WHERE r.campus_id=$1 AND r.id=$2`, [campusId, reportId])).rows[0],
    people: async (ids: string[]) => (await client.query<ReviewPerson>(`
      SELECT id,nombre_completo AS name FROM public.perfil_usuario WHERE id=ANY($1::uuid[]) ORDER BY id`, [ids])).rows,
    publication: async (campusId: string, id: string, physical: boolean) => (await client.query<Record<string, unknown>>(`
      SELECT ${publicationColumns}${physical ? ',f.categoria_id AS "categoryId",f.estado_uso AS condition' : ''}
      FROM public.publicacion_recurso p ${physical ? 'LEFT JOIN public.recurso_fisico f ON f.publicacion_id=p.id' : ''}
      WHERE p.campus_id=$1 AND p.id=$2 AND p.tipo_recurso=$3`, [campusId, id, physical ? 'FISICO' : 'DIGITAL'])).rows[0] ?? null,
    exchange: async (campusId: string, id: string) => {
      const row = (await client.query<Record<string, unknown>>(`
        SELECT t.id,t.solicitud_id AS "requestId",t.publicacion_id AS "publicationId",t.propietario_id AS "ownerId",
          t.receptor_id AS "recipientId",t.estado_transaccion AS status,t.modalidad_acordada AS modality,
          t.monto_acordado::text AS amount,t.moneda AS currency,t.iniciada_en AS "startedAt",t.completada_en AS "completedAt",
          t.cancelada_en AS "cancelledAt",t.cancelada_por_id AS "cancelledById",t.motivo_cancelacion AS "cancellationReason",
          t.detalle_cancelacion AS "cancellationDetail",s.estado_solicitud AS "requestStatus",
          json_build_object('id',p.id,'campusId',p.campus_id,'ownerId',p.propietario_id,'resourceType',p.tipo_recurso,
            'title',p.titulo,'description',p.descripcion,'status',p.estado_publicacion,'deletedAt',p.deleted_at) AS publication,
          (SELECT coalesce(json_agg(json_build_object('userId',c.usuario_id,'role',c.rol_confirmante,'confirmedAt',c.confirmado_en)
            ORDER BY c.confirmado_en,c.id),'[]'::json) FROM public.confirmacion_transaccion c
            WHERE c.transaccion_id=t.id AND c.usuario_id IN (t.propietario_id,t.receptor_id)) AS confirmations
        FROM public.transaccion_recurso t JOIN public.publicacion_recurso p ON p.id=t.publicacion_id
        JOIN public.solicitud_recurso s ON s.id=t.solicitud_id AND s.publicacion_id=p.id
        WHERE p.campus_id=$1 AND t.id=$2`, [campusId, id])).rows[0];
      return row ?? null;
    },
  };
}

/** Admin-only lookup, never reused by the public detail/list services. */
export function findReportedActivity(campusId: string, id: string): Promise<ActivityDocument | null> {
  return getMongoDb().collection<ActivityDocument>('activities').findOne({ campusId, _id: new ObjectId(id) }, {
    projection: { _id: 1, campusId: 1, createdByUserId: 1, title: 1, description: 1, type: 1, status: 1,
      visibility: 1, startAt: 1, endAt: 1, location: 1, createdAt: 1, updatedAt: 1, deletedAt: 1,
      editRevision: 1, changeHistory: 1, category: 1, tags: 1 },
  });
}
