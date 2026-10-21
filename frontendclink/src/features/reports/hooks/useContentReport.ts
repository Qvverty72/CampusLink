import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { fetchOwnActivityReport,submitActivityReport,submitPhysicalgoodsReport,submitDigitalReport } from '../api/reportsApi';
import type { ContentReportInput, ContentReportReceipt, ContentReportTarget } from '../types/contentReport';
import type { ActivityReportReceipt } from '@/features/activities/types/activityReport';

/** Aísla el envío por identidad/elemento y aborta la denuncia al cambiar o desmontar el formulario. */
export function useContentReport(target:ContentReportTarget) {
  const { identity, session, refreshIdentity } = useAuth();
  const campusId = identity?.campusId;
  const activityId = target.type === 'ACTIVIDAD' ? target.activityId : null;
  const hasSession = Boolean(session);
  const key = JSON.stringify([identity?.userId, campusId, target]);
  const activeKey = useRef(key); activeKey.current = key;
  const request = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ key: string; busy: boolean; error: string | null; receipt: ContentReportReceipt | ActivityReportReceipt | null }>({ key, busy: false, error: null, receipt: null });
  const [lookupAttempt, setLookupAttempt] = useState(0);
  const [lookup, setLookup] = useState({ key, loading: activityId !== null, checked: activityId === null, error: null as string | null });
  useEffect(() => {
    const abort = new AbortController();
    setState({ key, busy: false, error: null, receipt: null });
    setLookup({ key, loading: activityId !== null, checked: activityId === null, error: null });
    if (activityId) {
      if (!campusId || !hasSession) {
        setLookup({ key, loading: false, checked: false, error: 'Actualiza tu sesión para consultar tu denuncia.' });
      } else {
        void fetchOwnActivityReport(campusId, activityId, abort.signal).then(receipt => {
          if (abort.signal.aborted || activeKey.current !== key) return;
          setState({ key, busy: false, error: null, receipt });
          setLookup({ key, loading: false, checked: true, error: null });
        }).catch(reason => {
          if (abort.signal.aborted || activeKey.current !== key) return;
          setLookup({ key, loading: false, checked: false, error: 'No se pudo consultar si ya denunciaste esta actividad. Reintenta para continuar.' });
          if (reason instanceof AuthApiError && [401,403].includes(reason.status)) refreshIdentity();
        });
      }
    }
    return () => { abort.abort(); request.current?.abort(); request.current = null; };
  }, [key, activityId, campusId, hasSession, lookupAttempt, refreshIdentity]);

  /** Envía una sola denuncia por intento activo y expone el recibo únicamente para su clave vigente. */
  const submit = async (input: ContentReportInput) => {
    if (!campusId || !session || request.current || state.key !== key || state.receipt) return;
    if (activityId && (lookup.key !== key || !lookup.checked || lookup.loading)) return;
    const abort = new AbortController(); request.current = abort;
    setState({ key, busy: true, error: null, receipt: null });
    try {
      const receipt = target.type==='ACTIVIDAD'?await submitActivityReport(campusId,target.activityId,input,abort.signal)
        :target.type==='PUBLICACION_DIGITAL'||target.type==='TRANSACCION_DIGITAL'?await submitDigitalReport(target,input,abort.signal)
          :await submitPhysicalgoodsReport(campusId,target,input,abort.signal);
      if (!abort.signal.aborted && activeKey.current === key) setState({ key, busy: false, error: null, receipt });
    } catch (error) {
      if (abort.signal.aborted || activeKey.current !== key) return;
      const message = error instanceof AuthApiError && error.status === 404
        ? target.type==='ACTIVIDAD'?'Esta actividad ya no está disponible para denunciar. Vuelve a la ficha y actualízala.'
          :'Este elemento ya no está disponible para denunciar. Vuelve al detalle y actualízalo.'
        : error instanceof AuthApiError && [401, 403].includes(error.status)
          ? 'Tu sesión o campus cambió. Actualiza la sesión para continuar.'
          : error instanceof AuthApiError && error.status === 400 ? 'Revisa el motivo y la descripción.'
            : activityId ? 'No se pudo confirmar el envío. Reintenta: si ya se guardó, se recuperará la confirmación anterior.'
              : 'No se pudo confirmar el envío. Si hubo una interrupción, la denuncia podría haberse guardado; reenviarla puede crear otra denuncia.';
      setState({ key, busy: false, error: message, receipt: null });
      if (error instanceof AuthApiError && [401, 403].includes(error.status)) refreshIdentity();
    } finally { if (request.current === abort) request.current = null; }
  };
  return { submit, busy: state.key === key && state.busy, error: state.key === key ? state.error : null,
    receipt: state.key === key ? state.receipt : null,
    checking: activityId !== null && (lookup.key !== key || lookup.loading),
    lookupError: lookup.key === key ? lookup.error : null,
    retryLookup: () => setLookupAttempt(attempt => attempt + 1) };
}
