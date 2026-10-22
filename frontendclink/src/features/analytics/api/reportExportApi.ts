import { authenticatedResponseRequest } from '@/lib/api/authenticated-request';
import type { DownloadFile } from '@/lib/files/saveFile';

export type ReportExportFormat = 'pdf' | 'xlsx';

/** Siempre solicita los bytes al backend; no exporta cifras de la pantalla ni genera otro reporte. */
export async function downloadReport(id: string, format: ReportExportFormat, signal: AbortSignal): Promise<{ blob: Blob; file: DownloadFile }> {
  const response = await authenticatedResponseRequest(`/api/v1/analytics/reports/${encodeURIComponent(id)}/export/${format}`, { signal });
  const mimeType = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (response.headers.get('content-type')?.split(';')[0] !== mimeType) throw new Error('Formato de archivo inesperado.');
  return { blob: await response.blob(), file: { id, name: `campuslink-reporte-${id}.${format}`, extension: format, mimeType,
    uti: format === 'pdf' ? 'com.adobe.pdf' : 'org.openxmlformats.spreadsheetml.sheet' } };
}
