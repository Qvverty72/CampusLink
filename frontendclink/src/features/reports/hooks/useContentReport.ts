import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { submitContentReport } from '../api/reportsApi';
import type { ReportInput, ReportTarget, ContentReportReceipt } from '../types/report';

export function useContentReport(target: ReportTarget) {
  const { identity, session, refreshIdentity } = useAuth();
  const key = JSON.stringify([identity?.userId, identity?.campusId, session?.access_token,
    target.targetType, target.targetId, target.campusId]);
  const activeKey = useRef(key); activeKey.current = key;
  const request = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ key: string; busy: boolean; error: string | null; receipt: ContentReportReceipt | null }>({
    key, busy: false, error: null, receipt: null,
  });
  useEffect(() => {
    setState({ key, busy: false, error: null, receipt: null });
    return () => { request.current?.abort(); request.current = null; };
  }, [key]);

  const submit = async (input: ReportInput) => {
    if (!identity || !session || request.current || state.key !== key || state.receipt) return;
    const abort = new AbortController(); request.current = abort;
    setState({ key, busy: true, error: null, receipt: null });
    try {
      const receipt = await submitContentReport(target, input, abort.signal);
      if (!abort.signal.aborted && activeKey.current === key) setState({ key, busy: false, error: null, receipt });
    } catch (error) {
      if (abort.signal.aborted || activeKey.current !== key) return;
      const message = error instanceof AuthApiError && error.status === 404
        ? 'Este contenido ya no está disponible para denunciar. Vuelve al detalle y actualízalo.'
        : error instanceof AuthApiError && [401, 403].includes(error.status)
          ? 'Tu sesión o campus cambió. Actualiza la sesión para continuar.'
          : error instanceof AuthApiError && error.status === 400 ? 'Revisa el motivo y la descripción.'
            : 'No se pudo confirmar el envío. Si hubo una interrupción, la denuncia podría haberse guardado; reenviarla puede crear otra denuncia.';
      setState({ key, busy: false, error: message, receipt: null });
      if (error instanceof AuthApiError && [401, 403].includes(error.status)) refreshIdentity();
    } finally { if (request.current === abort) request.current = null; }
  };
  return { submit, busy: state.key === key && state.busy, error: state.key === key ? state.error : null,
    receipt: state.key === key ? state.receipt : null };
}
