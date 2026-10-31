import { withPostgresTransaction } from '../../database/supabase/postgres.js';
import { ApiError } from '../../shared/errors/api-error.js';
import type { VerifiedAuthConnection } from '../auth/types/auth.types.js';
import { digitalId } from '../marketplace/elibrary/elibrary.validation.js';
import { hideReportedActivity } from '../activities/repositories/activities.management.repository.js';
import { authorizedReview } from './reports.review.service.js';
import { findReportReview, readReportBackground, readReportPeople } from './reports.review.repository.js';
import { auditReportResolution, finishActivityReport, hideReportPublication, lockReportPublication, saveReportDecision } from './reports.resolution.repository.js';
import { parseReportResolution } from './reports.validation.js';
import type { ReportReviewDetail, ReportResolutionInput } from './reports.types.js';

const conflict = (message: string) => new ApiError(409, 'CONFLICT', message);

async function pendingReport(client: Parameters<typeof findReportReview>[0], campusId: string, id: string) {
  const report = await findReportReview(client, campusId, id, true);
  if (!report) throw new ApiError(404, 'NOT_FOUND', 'La denuncia no está disponible en este campus.');
  if (!['PENDIENTE', 'EN_REVISION'].includes(report.status)) throw conflict('La denuncia ya fue resuelta. Recarga el caso para consultar la decisión.');
  return report;
}

function sameDecision(report: ReportReviewDetail, input: ReportResolutionInput) {
  if (report.resolution && (input.decision !== 'ACOGER' || report.resolution.measure !== 'OCULTAR'
    || !report.resolution.resolvedById || !Number.isFinite(Date.parse(report.resolution.resolvedAt))
    || report.resolution.justification !== input.justification)) {
    throw conflict('Esta denuncia tiene una decisión en curso. Recarga el caso y completa esa misma resolución.');
  }
}

/** Publicaciones y auditoría comparten transacción; Mongo usa una decisión durable antes del ocultamiento. */
export async function resolveReport(auth: VerifiedAuthConnection, rawCampusId: unknown, rawId: unknown, raw: unknown,
  transaction = withPostgresTransaction, hideActivity = hideReportedActivity) {
  const campusId = digitalId(rawCampusId, 'campusId'), id = digitalId(rawId, 'reportId');
  const parsed = parseReportResolution(raw);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Revisa la resolución y su justificación.', { details: parsed.issues });
  const input = parsed.data;
  const result = await authorizedReview(auth, campusId, async (client, institutionId) => {
    const before = await pendingReport(client, campusId, id);
    sameDecision(before, input);
    if (input.decision === 'ACOGER' && before.entityType === 'ACTIVIDAD') {
      if (!/^[0-9a-f]{24}$/i.test(before.entityId)) throw conflict('La actividad vinculada no tiene un identificador válido.');
      if (!before.resolution) await saveReportDecision(client, before, auth.userId, input.justification, 'OCULTAR', 'EN_REVISION');
      return { activity: true as const };
    }
    if (before.resolution) throw conflict('La denuncia tiene una resolución en curso.');
    if (input.decision === 'ACOGER') {
      if (!['PUBLICACION_FISICA', 'PUBLICACION_DIGITAL', 'TRANSACCION'].includes(before.entityType)) throw conflict('Este caso no tiene contenido compatible con la medida de ocultamiento.');
      digitalId(before.entityId, 'entityId');
      const publication = await lockReportPublication(client, before);
      if (!publication || (before.entityType === 'PUBLICACION_FISICA' && publication.tipo_recurso !== 'FISICO')
        || (before.entityType === 'PUBLICACION_DIGITAL' && publication.tipo_recurso !== 'DIGITAL')) {
        throw conflict('No se encontró la publicación vinculada en este campus.');
      }
      // Retirada lógica previa ya impide visibilidad; no reactivar ni alterar su estado terminal.
      if (!publication.deleted_at && publication.estado_publicacion !== 'OCULTO') await hideReportPublication(client, publication.id);
    }
    await saveReportDecision(client, before, auth.userId, input.justification,
      input.decision === 'ACOGER' ? 'OCULTAR' : 'NINGUNA', input.decision === 'ACOGER' ? 'RESUELTO' : 'DESESTIMADO');
    const after = (await findReportReview(client, campusId, id))!;
    await auditReportResolution(client, institutionId, before, after, input.decision === 'ACOGER' ? 'RESOLVER_DENUNCIA' : 'DESESTIMAR_DENUNCIA');
    return { activity: false as const, detail: { ...after, ...await readReportBackground(client, after), people: await readReportPeople(client, after) } };
  }, transaction);
  if (!result.activity) return result.detail;
  // La segunda transacción revalida permisos y serializa reintentos de la misma decisión.
  return authorizedReview(auth, campusId, async (client, institutionId) => {
    const before = await pendingReport(client, campusId, id);
    sameDecision(before, input);
    if (!before.resolution) throw conflict('Recarga la denuncia antes de continuar.');
    await hideActivity(campusId, before.entityId);
    await finishActivityReport(client, before);
    const after = (await findReportReview(client, campusId, id))!;
    await auditReportResolution(client, institutionId, before, after, 'RESOLVER_DENUNCIA');
    return { ...after, ...await readReportBackground(client, after), people: await readReportPeople(client, after) };
  }, transaction);
}
