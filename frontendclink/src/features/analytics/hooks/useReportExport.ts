import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
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
  const [state, setState] = useState<{ key: string; format: ReportExportFormat | null; error: string; phase?: 'preparing' | 'delivery'; notice?: string } | null>(null);
  useEffect(() => {
    setState(null);
    return () => { pending.current?.abort(); pending.current = null; };
  }, [key]);
  const current = state?.key === key ? state : null;
  return { allowed, exporting: current?.format ?? null, error: current?.error ?? '', phase: current?.phase, notice: current?.notice ?? '',
    async exportFile(format: ReportExportFormat) {
      if (!allowed || pending.current) return;
      const controller = new AbortController(); pending.current = controller;
      setState({ key, format, error: '', phase: 'preparing' });
      try {
        const { blob, file } = await downloadReport(reportId, format, controller.signal);
        if (controller.signal.aborted) return;
        setState({ key, format, error: '', phase: 'delivery' });
        await saveFile(blob, file, controller.signal);
        if (!controller.signal.aborted) setState({ key, format: null, error: '', notice: Platform.OS === 'web'
          ? 'Descarga iniciada; revisa tu carpeta de descargas.' : 'Si lo guardaste, búscalo en el lugar que elegiste.' });
      } catch (reason) {
        if (!controller.signal.aborted) {
          if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) void auth.refreshIdentity();
          const message = reason instanceof AuthApiError ? reason.status === 401 ? 'Tu sesión venció. Vuelve a iniciar sesión e inténtalo de nuevo.'
            : reason.status === 404 ? 'Este reporte ya no está disponible.'
            : reason.serverMessage || (reason.status === 403 ? 'Ya no tienes permiso sobre todos los campus de este reporte.' : '')
            : reason instanceof Error && reason.message === 'Este dispositivo no permite guardar o compartir archivos desde la aplicación.' ? reason.message : '';
          setState({ key, format: null, error: message || 'No se pudo exportar el reporte. Inténtalo nuevamente.' });
        }
      } finally {
        if (pending.current === controller) pending.current = null;
        if (!controller.signal.aborted) setState(previous => previous?.key === key ? { ...previous, format: null, phase: undefined } : previous);
      }
    },
  };
}
