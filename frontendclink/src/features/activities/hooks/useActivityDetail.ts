import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { fetchActivityDetail, registerActivityParticipation } from '../api/activitiesApi';
import type { ActivityDetail } from '../types/activity';

interface DetailState {
  key: string;
  detail: ActivityDetail | null;
  isLoading: boolean;
  isJoining: boolean;
  error: string | null;
  joinError: string | null;
}

export function useActivityDetail(activityId: string) {
  const { identity, session, refreshIdentity } = useAuth();
  const campusId = identity?.campusId;
  const token = session?.access_token;
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const key = JSON.stringify([campusId, token, activityId, revision]);
  const request = useRef<AbortController | null>(null);
  const joining = useRef<AbortController | null>(null);
  const [state, setState] = useState<DetailState>({ key: '', detail: null, isLoading: false,
    isJoining: false, error: null, joinError: null });

  useEffect(() => {
    if (!campusId || !token) return;
    const abort = new AbortController();
    request.current = abort;
    setState({ key, detail: null, isLoading: true, isJoining: false, error: null, joinError: null });
    void fetchActivityDetail(campusId, activityId, abort.signal).then(detail => {
      if (!abort.signal.aborted) setState({ key, detail, isLoading: false, isJoining: false, error: null, joinError: null });
    }).catch(reason => {
      if (abort.signal.aborted) return;
      setState({ key, detail: null, isLoading: false, isJoining: false, joinError: null,
        error: reason instanceof AuthApiError && reason.status === 404
          ? 'Esta actividad ya no está disponible en el mapa.' : 'No se pudo cargar la ficha. Reintenta.' });
      if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) refreshIdentity();
    });
    return () => { abort.abort(); if (request.current === abort) request.current = null; };
  }, [key, campusId, token, activityId, refreshIdentity]);

  const detail = state.key === key ? state.detail : null;
  useEffect(() => {
    if (!detail) return;
    const delay = Math.min(2_147_483_647, Math.max(1, Date.parse(detail.endAt) - Date.now() + 1));
    const expiry = setTimeout(refresh, delay);
    return () => clearTimeout(expiry);
  }, [detail, refresh]);

  const join = async () => {
    const abort = request.current;
    if (!campusId || !token || !abort || abort.signal.aborted || joining.current === abort
      || state.key !== key || !detail?.participation.canJoin) return;
    joining.current = abort;
    setState(current => current.key === key ? { ...current, isJoining: true, joinError: null } : current);
    try {
      const registered = await registerActivityParticipation(campusId, activityId, abort.signal);
      if (!abort.signal.aborted) setState(current => current.key === key
        ? { ...current, detail: registered, isJoining: false, joinError: null } : current);
    } catch (reason) {
      if (abort.signal.aborted) return;
      const unavailable = reason instanceof AuthApiError && reason.status === 404;
      setState(current => current.key === key ? { ...current, isJoining: false,
        detail: unavailable ? null : current.detail,
        error: unavailable ? 'Esta actividad ya no está disponible en el mapa.' : current.error,
        joinError: unavailable ? null : 'No se pudo confirmar tu inscripción. Reintenta.' } : current);
      if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) refreshIdentity();
    } finally { if (joining.current === abort) joining.current = null; }
  };

  return { detail, isLoading: state.key !== key || state.isLoading,
    isJoining: state.key === key && state.isJoining, error: state.key === key ? state.error : null,
    joinError: state.key === key ? state.joinError : null, refresh, join };
}
