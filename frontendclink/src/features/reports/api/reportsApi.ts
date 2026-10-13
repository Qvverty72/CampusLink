import { authenticatedEnvelopeRequest } from '@/lib/api/authenticated-request';
import { isReportTarget, isContentReportReceipt } from '../types/report';
import type { ReportInput, ReportTarget, ContentReportReceipt } from '../types/report';

export async function submitContentReport(target: ReportTarget, input: ReportInput,
  signal?: AbortSignal): Promise<ContentReportReceipt> {
  if (!isReportTarget(target)) throw new Error('Elemento de la denuncia inválido.');
  const response = await authenticatedEnvelopeRequest<ContentReportReceipt>('/api/v1/reports', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetType: target.targetType, targetId: target.targetId, reason: input.reason,
      ...(input.description !== undefined ? { description: input.description } : {}) }), signal,
  });
  if (!isContentReportReceipt(response.data, target)) throw new Error('No se pudo confirmar el envío de la denuncia.');
  return response.data;
}

export type ActivityReportInput = ReportInput;
export interface ActivityReportReceipt {
  id: string; activityId: string; campusId: string; status: 'PENDIENTE'; reportedAt: string;
}

export async function submitActivityReport(campusId: string, activityId: string, input: ActivityReportInput,
  signal?: AbortSignal): Promise<ActivityReportReceipt> {
  if (!/^[0-9a-f]{24}$/i.test(activityId)) throw new Error('Identificador de actividad inválido.');
  const response = await authenticatedEnvelopeRequest<ActivityReportReceipt>(`/api/v1/reports/activities/${activityId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal,
  });
  const receipt = response.data;
  if (!receipt || !/^[0-9a-f-]{36}$/i.test(receipt.id) || receipt.campusId !== campusId
    || receipt.activityId !== activityId.toLowerCase() || receipt.status !== 'PENDIENTE'
    || !Number.isFinite(Date.parse(receipt.reportedAt))) throw new Error('No se pudo confirmar el envío de la denuncia.');
  return receipt;
}
