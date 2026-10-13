import { authenticatedEnvelopeRequest } from '@/lib/api/authenticated-request';

export interface ActivityReportInput { reason: string; description?: string }
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
