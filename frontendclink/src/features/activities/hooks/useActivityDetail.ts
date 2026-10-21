import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { fetchActivityDetail, fetchActivityParticipation, registerActivityParticipation, withdrawActivityParticipation, deleteActivity } from '../api/activitiesApi';
import type { ActivityDetail, ActivityParticipation } from '../types/activity';
import { activityOperationId } from '../types/interaction';

interface DetailState {
  key: string;
  detail: ActivityDetail | null;
  ownParticipation: ActivityParticipation | null;
  isLoading: boolean;
  pendingParticipation: 'JOINED' | 'LEFT' | null;
  error: string | null;
  participationError: string | null;
  pendingDeletion: boolean;
  deletionError: string | null;
}

const unavailableMessage = 'Esta actividad ya no está disponible en el mapa.';

/** Carga ficha y participación propia; serializa mutaciones y conserva claves idempotentes al reintentar. */
export function useActivityDetail(activityId: string) {
  const { identity, refreshIdentity } = useAuth();
  const campusId = identity?.campusId;
  const userId = identity?.userId;
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const key = JSON.stringify([campusId, userId, activityId, revision]);
  const request = useRef<AbortController | null>(null);
  const mutation = useRef<AbortController | null>(null);
  const interactionIntent = useRef<{ key: string; id: string } | null>(null);
  const [state, setState] = useState<DetailState>({ key: '', detail: null, ownParticipation: null,
    isLoading: false, pendingParticipation: null, error: null, participationError: null, pendingDeletion: false, deletionError: null });

  useEffect(() => {
    if (!campusId || !userId) return;
    const abort = new AbortController();
    request.current = abort;
    const initial: DetailState = { key, detail: null, ownParticipation: null, isLoading: false,
      pendingParticipation: null, error: null, participationError: null, pendingDeletion: false, deletionError: null };
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
  }, [key, campusId, userId, activityId, refreshIdentity]);

  const detail = state.key === key ? state.detail : null;
  const ownParticipation = state.key === key ? state.ownParticipation : null;
  useEffect(() => {
    if (!detail) return;
    const delay = Math.min(2_147_483_647, Math.max(1, Date.parse(detail.endAt) - Date.now() + 1));
    const expiry = setTimeout(refresh, delay);
    return () => clearTimeout(expiry);
  }, [detail, refresh]);

  /** Evita mutaciones duplicadas y confirma en servidor la inscripción o el retiro. */
  const changeParticipation = async (target: 'JOINED' | 'LEFT') => {
    const abort = request.current;
    const status = detail?.participation.status ?? ownParticipation?.status;
    const canLeave = detail?.participation.canLeave ?? ownParticipation?.canLeave ?? false;
    if (!campusId || !userId || !abort || abort.signal.aborted || mutation.current === abort
      || state.key !== key || (target === 'JOINED' ? !detail?.participation.canJoin : status !== 'JOINED' || !canLeave)) return;
    mutation.current = abort;
    const intentKey = JSON.stringify([campusId, identity?.profile.id, activityId, target]);
    if (interactionIntent.current?.key !== intentKey) interactionIntent.current = { key: intentKey, id: activityOperationId() };
    const operationId = interactionIntent.current.id;
    setState(current => current.key === key ? { ...current, pendingParticipation: target, participationError: null } : current);
    try {
      if (target === 'JOINED') {
        const registered = await registerActivityParticipation(campusId, activityId, abort.signal, operationId);
        interactionIntent.current = null;
        if (!abort.signal.aborted) setState(current => current.key === key
          ? { ...current, detail: registered, ownParticipation: null, pendingParticipation: null, participationError: null } : current);
      } else {
        const left = await withdrawActivityParticipation(campusId, activityId, abort.signal, operationId);
        interactionIntent.current = null;
        if (!abort.signal.aborted) setState(current => current.key === key ? { ...current, ownParticipation: left,
          detail: current.detail ? { ...current.detail, participantCount: undefined,
            participation: { status: left.status, canJoin: left.status !== 'JOINED', canLeave: left.canLeave } } : null,
          pendingParticipation: detail ? 'LEFT' : null, participationError: null } : current);
        // DELETE confirma el estado propio, no el total; vuelve a leer el contador agregado.
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

  /** Retira la publicación con la revisión cargada e informa si el servidor confirmó la baja. */
  const remove = async (): Promise<boolean> => {
    const abort = request.current;
    if (!campusId || !userId || !abort || abort.signal.aborted || mutation.current === abort
      || state.key !== key || !detail?.editing) return false;
    mutation.current = abort;
    setState(current => current.key === key ? { ...current, pendingDeletion: true, deletionError: null } : current);
    try {
      await deleteActivity(campusId, activityId, detail.editing.revision, abort.signal);
      return !abort.signal.aborted;
    } catch (reason) {
      if (abort.signal.aborted) return false;
      const conflict = reason instanceof AuthApiError && reason.status === 409;
      setState(current => current.key === key ? { ...current, deletionError: conflict
        ? 'La actividad cambió. Actualiza la ficha antes de eliminar.' : 'No se pudo confirmar la eliminación. Actualiza la ficha antes de reintentar.' } : current);
      if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) refreshIdentity();
      if (reason instanceof AuthApiError && reason.status === 404) refresh();
      return false;
    } finally {
      if (!abort.signal.aborted) setState(current => current.key === key ? { ...current, pendingDeletion: false } : current);
      if (mutation.current === abort) mutation.current = null;
    }
  };

  return { detail, ownParticipation, isLoading: state.key !== key || state.isLoading,
    isDeleting: state.key === key && state.pendingDeletion,
    deletionError: state.key === key ? state.deletionError : null, remove,
    pendingParticipation: state.key === key ? state.pendingParticipation : null,
    isUpdatingParticipation: state.key === key && state.pendingParticipation !== null,
    error: state.key === key ? state.error : null,
    participationError: state.key === key ? state.participationError : null,
    refresh, join: () => changeParticipation('JOINED'), leave: () => changeParticipation('LEFT') };
}
