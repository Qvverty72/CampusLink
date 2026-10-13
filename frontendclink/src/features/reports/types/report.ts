export type ReportTargetType = 'PUBLICACION_FISICA' | 'PUBLICACION_DIGITAL' | 'ACTIVIDAD' | 'TRANSACCION';
export interface ReportTarget { targetType: ReportTargetType; targetId: string; campusId: string }
export interface ReportInput { reason: string; description?: string }
export interface ContentReportReceipt {
  id: string; targetType: ReportTargetType; targetId: string; campusId: string;
  status: 'PENDIENTE'; reportedAt: string;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isReportTarget(target: ReportTarget): boolean {
  return ['PUBLICACION_FISICA', 'PUBLICACION_DIGITAL', 'ACTIVIDAD', 'TRANSACCION'].includes(target.targetType)
    && uuid.test(target.campusId)
    && (target.targetType === 'ACTIVIDAD' ? /^[0-9a-f]{24}$/i : uuid).test(target.targetId);
}

export function isContentReportReceipt(value: unknown, target: ReportTarget): value is ContentReportReceipt {
  if (!value || typeof value !== 'object') return false;
  const receipt = value as ContentReportReceipt;
  return typeof receipt.id === 'string' && uuid.test(receipt.id)
    && receipt.campusId === target.campusId.toLowerCase() && receipt.targetType === target.targetType
    && receipt.targetId === target.targetId.toLowerCase() && receipt.status === 'PENDIENTE'
    && typeof receipt.reportedAt === 'string' && Number.isFinite(Date.parse(receipt.reportedAt));
}
