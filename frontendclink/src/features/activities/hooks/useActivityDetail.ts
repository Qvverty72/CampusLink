import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { fetchActivityDetail, fetchActivityParticipation, registerActivityParticipation, withdrawActivityParticipation } from '../api/activitiesApi';
import type { ActivityDetail, ActivityParticipation } from '../types/activity';

interface DetailState {
  key: string;
  detail: ActivityDetail | null;
  ownParticipation: ActivityParticipation | null;
  isLoading: boolean;
  pendingParticipation: 'JOINED' | 'LEFT' | null;
  error: string | null;
  participationError: string | null;
}

const unavailableMessage = 'Esta actividad ya no está disponible en el mapa.';

export function useActivityDetail(activityId: string) {
  const { identity, session, refreshIdentity } = useAuth();
  const campusId = identity?.campusId;
  const token = session?.access_token;
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const key = JSON.stringify([campusId, token, activityId, revision]);
  const request = useRef<AbortController | null>(null);
  const mutation = useRef<AbortController | null>(null);
  const [state, setState] = useState<DetailState>({ key: '', detail: null, ownParticipation: null,
    isLoading: false, pendingParticipation: null, error: null, participationError: null });

  useEffect(() => {
    if (!campusId || !token) return;
    const abort = new AbortController();
    request.current = abort;
    const initial: DetailState = { key, detail: null, ownParticipation: null, isLoading: false,
      pendingParticipation: null, error: null, participationError: null };
    setState({ ...initial, isLoading: true });
    void (async () => {
      try {
        const detail = await fetchActivityDetail(campusId, activityId, abort.signal);
        if (!abort.signal.aborted) setState({ ...initial, detail });
      } catch (reason) {
        if (abort.signal.aborted) return;
        if (reason instanceof AuthApiError && reason.status === 404) {
          try {
            const ownParticipation = await fetchActivityParticipation(campusId, activityId, abort.signal);
            if (!abort.signal.aborted) setState({ ...initial, ownParticipation, error: unavailableMessage });
            return;
          } catch (participationReason) {
            if (abort.signal.aborted) return;
            if (participationReason instanceof AuthApiError && [401, 403].includes(participationReason.status)) refreshIdentity();
          }
        }
        if (!abort.signal.aborted) setState({ ...initial, error: 'No se pudo cargar la ficha y tu participación. Reintenta.' });
        if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) refreshIdentity();
      }
    })();
    return () => { abort.abort(); if (request.current === abort) request.current = null; };
  }, [key, campusId, token, activityId, refreshIdentity]);

  const detail = state.key === key ? state.detail : null;
  const ownParticipation = state.key === key ? state.ownParticipation : null;
  useEffect(() => {
    if (!detail) return;
    const delay = Math.min(2_147_483_647, Math.max(1, Date.parse(detail.endAt) - Date.now() + 1));
    const expiry = setTimeout(refresh, delay);
    return () => clearTimeout(expiry);
  }, [detail, refresh]);

  const changeParticipation = async (target: 'JOINED' | 'LEFT') => {
    const abort = request.current;
    const status = detail?.participation.status ?? ownParticipation?.status;
    if (!campusId || !token || !abort || abort.signal.aborted || mutation.current === abort
      || state.key !== key || (target === 'JOINED' ? !detail?.participation.canJoin : status !== 'JOINED')) return;
    mutation.current = abort;
    setState(current => current.key === key ? { ...current, pendingParticipation: target, participationError: null } : current);
    try {
      if (target === 'JOINED') {
        const registered = await registerActivityParticipation(campusId, activityId, abort.signal);
        if (!abort.signal.aborted) setState(current => current.key === key
          ? { ...current, detail: registered, ownParticipation: null, pendingParticipation: null, participationError: null } : current);
      } else {
        const left = await withdrawActivityParticipation(campusId, activityId, abort.signal);
        if (!abort.signal.aborted) setState(current => current.key === key ? { ...current, ownParticipation: left,
          detail: current.detail ? { ...current.detail, participantCount: undefined,
            participation: { status: left.status, canJoin: left.status !== 'JOINED' } } : null,
          pendingParticipation: detail ? 'LEFT' : null, participationError: null } : current);
        // DELETE confirms own state, not the aggregate. Read the stored count again.
        if (detail && !abort.signal.aborted) {
          try {
            const updated = await fetchActivityDetail(campusId, activityId, abort.signal);
            if (!abort.signal.aborted) setState(current => current.key === key
              ? { ...current, detail: updated, pendingParticipation: null } : current);
          } catch (reason) {
            if (abort.signal.aborted) return;
            const unavailable = reason instanceof AuthApiError && reason.status === 404;
            setState(current => current.key === key ? { ...current, pendingParticipation: null,
              ...(unavailable ? { detail: null, error: unavailableMessage } : {}),
              participationError: unavailable ? null : 'Tu retiro fue confirmado. No se pudo actualizar el contador; actualiza la ficha.' } : current);
            if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) refreshIdentity();
          }
        }
      }
    } catch (reason) {
      if (abort.signal.aborted) return;
      setState(current => current.key === key ? { ...current, pendingParticipation: null,
        participationError: target === 'JOINED'
          ? 'No se pudo confirmar tu inscripción. Actualiza la ficha antes de reintentar.'
          : 'No se pudo confirmar el retiro. Actualiza la ficha antes de reintentar.' } : current);
      if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) refreshIdentity();
      if (reason instanceof AuthApiError && reason.status === 404) refresh();
    } finally { if (mutation.current === abort) mutation.current = null; }
  };

  return { detail, ownParticipation, isLoading: state.key !== key || state.isLoading,
    pendingParticipation: state.key === key ? state.pendingParticipation : null,
    isUpdatingParticipation: state.key === key && state.pendingParticipation !== null,
    error: state.key === key ? state.error : null,
    participationError: state.key === key ? state.participationError : null,
    refresh, join: () => changeParticipation('JOINED'), leave: () => changeParticipation('LEFT') };
}
