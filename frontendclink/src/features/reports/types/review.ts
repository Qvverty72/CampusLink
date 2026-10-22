export interface ReportReviewSummary {
  id: string; campusId: string; entityType: string; entityId: string;
  title: string | null; reason: string; status: string; reportedAt: string;
}
export interface ReportReviewDetail extends ReportReviewSummary {
  resolution: { justification: string; measure: string; resolvedById: string; resolvedAt: string } | null;
  description: string | null; reporter: { id: string; name: string | null };
  snapshot: Record<string, unknown> | null;
  currentPublication: { id: string; title: string; status: string; deletedAt: string | null } | null;
  currentTransaction: Record<string, unknown> | null;
}
export interface ReportResolutionInput { decision: 'DESESTIMAR' | 'ACOGER'; justification: string }
export interface ReviewPage { data: ReportReviewSummary[]; meta: { page: number; limit: number; hasMore: boolean } }
export const reviewLabels: Record<string, string> = {
  PUBLICACION_FISICA: 'Publicación física', PUBLICACION_DIGITAL: 'Publicación digital', TRANSACCION: 'Transacción', ACTIVIDAD: 'Actividad',
  PENDIENTE: 'Pendiente', EN_REVISION: 'En revisión', RESUELTO: 'Resuelto', DESESTIMADO: 'Desestimado',
};
