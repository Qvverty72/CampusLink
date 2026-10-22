import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { saveFile } from '@/lib/files/saveFile';
import { downloadReport, type ReportExportFormat } from '../api/reportExportApi';
import { canAccessAnalytics } from '../types/access';

export function useReportExport(reportId: string) {
  const auth = useAuth(), identity = auth.identity, allowed = canAccessAnalytics(identity);
  const key = JSON.stringify([reportId, identity?.userId, identity?.campusId, identity?.profile.institucion_id,
    identity?.roles, identity?.permissions, allowed]);
  const pending = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ key: string; format: ReportExportFormat | null; error: string } | null>(null);
  useEffect(() => {
    setState(null);
    return () => { pending.current?.abort(); pending.current = null; };
  }, [key]);
  const current = state?.key === key ? state : null;
  return { allowed, exporting: current?.format ?? null, error: current?.error ?? '',
    async exportFile(format: ReportExportFormat) {
      if (!allowed || pending.current) return;
      const controller = new AbortController(); pending.current = controller;
      setState({ key, format, error: '' });
      try {
        const { blob, file } = await downloadReport(reportId, format, controller.signal);
        if (!controller.signal.aborted) await saveFile(blob, file, controller.signal);
      } catch (reason) {
        if (!controller.signal.aborted) {
          if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) void auth.refreshIdentity();
          setState({ key, format: null, error: reason instanceof AuthApiError && reason.serverMessage
            ? reason.serverMessage : 'No se pudo exportar el reporte. Inténtalo nuevamente.' });
        }
      } finally {
        if (pending.current === controller) pending.current = null;
        if (!controller.signal.aborted) setState(previous => previous?.key === key ? { ...previous, format: null } : previous);
      }
    },
  };
}
