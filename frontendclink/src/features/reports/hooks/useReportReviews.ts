import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { canManageAccess } from '@/features/users/types/access';
import { loadAccessCampuses } from '@/features/users/api/accessApi';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { saveFile } from '@/lib/files/saveFile';
import { downloadReportedFile, loadReportReview, loadReportReviews, submitReportResolution, loadReportResolutions, loadReportResolution } from '../api/reportsApi';
import type { ReportResolutionInput, ReportReviewDetail, ReportResolutionDetail, ReviewPage } from '../types/review';

/** Mantiene evidencia solo en memoria y descarta respuestas al cambiar cuenta, sede o caso. */
export function useReportReviews() {
  const auth = useAuth();
  const allowed = auth.status === 'ready' && canManageAccess(auth.identity?.roles ?? []);
  const identityKey = JSON.stringify([auth.status, auth.identity?.userId, auth.identity?.campusId, auth.identity?.roles, auth.identity?.profile.estado_cuenta]);
  const [history, setHistory] = useState(false);
  const [catalog, setCatalog] = useState<{ key: string; rows: { id: string; name: string }[]; error: string } | null>(null);
  const [query, setQuery] = useState<{ identity: string; campusId: string; page: number; revision: number } | null>(null);
  const [listing, setListing] = useState<{ key: string; result: ReviewPage | null; error: string } | null>(null);
  const [selection, setSelection] = useState<{ key: string; id: string; revision: number } | null>(null);
  const [detail, setDetail] = useState<{ key: string; value: ReportReviewDetail | ReportResolutionDetail | null; error: string } | null>(null);
  const [fileState, setFileState] = useState<{ key: string; busy: boolean; error: string } | null>(null);
  const [accessError, setAccessError] = useState<{ key: string; message: string } | null>(null);
  const fileRequest = useRef<AbortController | null>(null);
  const resolutionRequest = useRef<AbortController | null>(null);
  const [draft, setDraft] = useState<{ key: string; input: ReportResolutionInput; confirming: boolean } | null>(null);
  const [resolutionState, setResolutionState] = useState<{ key: string; busy: boolean; error: string; needsReload: boolean } | null>(null);
  const [reload, setReload] = useState(0);
  const campuses = allowed && catalog?.key === identityKey ? catalog.rows : [];
  const currentQuery = query?.identity === identityKey ? query : null;
  const campusId = currentQuery?.campusId ?? campuses[0]?.id ?? '';
  const page = currentQuery?.page ?? 1;
  const listKey = JSON.stringify([identityKey, campusId, page, currentQuery?.revision, reload, history]);
  const selected = selection?.key === listKey ? selection : null;
  const detailKey = JSON.stringify([listKey, selected]);
  const denied = (reason: unknown) => reason instanceof AuthApiError && [401, 403].includes(reason.status);
  const fail = (reason: unknown) => {
    const message = reason instanceof AuthApiError && reason.serverMessage ? reason.serverMessage : 'No se pudo completar la consulta. Inténtalo nuevamente.';
    if (denied(reason)) {
      setListing(null); setSelection(null); setDetail(null); setCatalog(null);
      setAccessError({ key: identityKey, message }); auth.refreshIdentity();
    }
    return message;
  };

  useEffect(() => {
    const controller = new AbortController(); setCatalog(null);
    if (allowed) void loadAccessCampuses(controller.signal).then(rows => {
      if (!controller.signal.aborted) setCatalog({ key: identityKey, rows, error: '' });
    }).catch(reason => { if (!controller.signal.aborted) setCatalog({ key: identityKey, rows: [], error: fail(reason) }); });
    return () => controller.abort();
  }, [identityKey, reload]);

  useEffect(() => {
    const controller = new AbortController(); setListing(null);
    const load = history ? loadReportResolutions : loadReportReviews;
    if (allowed && campusId) void load(campusId, page, controller.signal).then(result => {
      if (!controller.signal.aborted) setListing({ key: listKey, result, error: '' });
    }).catch(reason => { if (!controller.signal.aborted) setListing({ key: listKey, result: null, error: fail(reason) }); });
    return () => controller.abort();
  }, [listKey, allowed]);

  useEffect(() => {
    const controller = new AbortController(); setDetail(null);
    const load = history ? loadReportResolution : loadReportReview;
    if (allowed && selected) void load(campusId, selected.id, controller.signal).then(value => {
      if (!controller.signal.aborted) setDetail({ key: detailKey, value, error: '' });
    }).catch(reason => { if (!controller.signal.aborted) setDetail({ key: detailKey, value: null, error: fail(reason) }); });
    return () => controller.abort();
  }, [detailKey, allowed]);

  useEffect(() => {
    fileRequest.current?.abort(); setFileState(null);
    resolutionRequest.current?.abort(); resolutionRequest.current = null; setResolutionState(null); setDraft(null);
    return () => fileRequest.current?.abort();
  }, [detailKey]);

  useEffect(() => () => resolutionRequest.current?.abort(), []);

  const result = allowed && listing?.key === listKey ? listing : null;
  const currentDetail = allowed && detail?.key === detailKey ? detail : null;
  const deniedMessage = accessError?.key === identityKey ? accessError.message : '';
  const inProgress = !history && currentDetail?.value?.status === 'EN_REVISION' && !!currentDetail.value.resolution;
  const input: ReportResolutionInput = inProgress ? { decision: 'ACOGER', justification: currentDetail!.value!.resolution!.justification ?? '' }
    : draft?.key === detailKey ? draft.input : { decision: 'DESESTIMAR', justification: '' };
  const action = resolutionState?.key === detailKey ? resolutionState : null;
  const canResolve = !history && !!currentDetail?.value && ['PENDIENTE', 'EN_REVISION'].includes(currentDetail.value.status);
  return {
    history,
    showHistory(value: boolean) {
      setHistory(value); setQuery({ identity: identityKey, campusId, page: 1, revision: 0 }); setSelection(null);
    },
    allowed, campuses, campusId, page, selectedId: selected?.id, detail: currentDetail?.value ?? null,
    entries: result?.result?.data ?? [], hasMore: result?.result?.meta.hasMore ?? false,
    error: deniedMessage || (catalog?.key === identityKey ? catalog.error : '') || result?.error || currentDetail?.error || (fileState?.key === detailKey ? fileState.error : ''),
    loading: allowed && !deniedMessage && (!catalog || Boolean(campusId && !result) || Boolean(selected && !currentDetail)),
    downloading: fileState?.key === detailKey && fileState.busy,
    canResolve, resolutionInput: input, resolutionInProgress: inProgress, resolving: !!action?.busy,
    resolutionError: action?.error ?? '', resolutionNeedsReload: !!action?.needsReload,
    confirmingResolution: draft?.key === detailKey && draft.confirming,
    editResolution(change: Partial<ReportResolutionInput>) {
      if (inProgress || resolutionRequest.current || action?.needsReload) return;
      setDraft({ key: detailKey, input: { ...input, ...change }, confirming: false });
    },
    requestResolution() {
      if (!canResolve || resolutionRequest.current || action?.needsReload) return;
      if (!input.justification.trim() || input.justification.trim().length > 2000 || input.justification.includes('\u0000')) {
        setResolutionState({ key: detailKey, busy: false, needsReload: false, error: 'Escribe una justificación válida de entre 1 y 2000 caracteres.' }); return;
      }
      setResolutionState(null); setDraft({ key: detailKey, input, confirming: true });
    },
    cancelResolution() { if (!resolutionRequest.current) setDraft({ key: detailKey, input, confirming: false }); },
    async confirmResolution() {
      if (!canResolve || !selected || resolutionRequest.current || draft?.key !== detailKey || !draft.confirming) return;
      const controller = new AbortController(); resolutionRequest.current = controller;
      setResolutionState({ key: detailKey, busy: true, error: '', needsReload: false });
      try {
        const value = await submitReportResolution(campusId, selected.id, draft.input, controller.signal);
        if (!controller.signal.aborted) {
          setDetail({ key: detailKey, value, error: '' });
          setListing(current => current?.key === listKey && current.result ? { ...current, result: { ...current.result,
            data: current.result.data.map(row => row.id === value.id ? { ...row, status: value.status } : row) } } : current);
          setDraft(null); setResolutionState(null);
        }
      } catch (reason) {
        if (!controller.signal.aborted) {
          setDraft({ key: detailKey, input: draft.input, confirming: false });
          setResolutionState({ key: detailKey, busy: false, error: fail(reason), needsReload: true });
        }
      } finally { if (resolutionRequest.current === controller) resolutionRequest.current = null; }
    },
    chooseCampus(id: string) { setQuery({ identity: identityKey, campusId: id, page: 1, revision: 0 }); setSelection(null); },
    changePage(next: number) { setQuery({ identity: identityKey, campusId, page: next, revision: 0 }); setSelection(null); },
    open(id: string) { setSelection({ key: listKey, id, revision: (selected?.revision ?? 0) + 1 }); },
    close() { setSelection(null); },
    retry() {
      if (deniedMessage) { setAccessError(null); setQuery(null); setSelection(null); setReload(value => value + 1); }
      else if (selected) setSelection({ ...selected, revision: selected.revision + 1 });
      else setReload(value => value + 1);
    },
    async download(fileId: string, name: string) {
      if (history || !selected || fileState?.busy) return;
      fileRequest.current?.abort(); const controller = new AbortController(); fileRequest.current = controller;
      setFileState({ key: detailKey, busy: true, error: '' });
      try {
        const blob = await downloadReportedFile(campusId, selected.id, fileId, controller.signal);
        if (!controller.signal.aborted) await saveFile(blob, { id: fileId, name, extension: 'pdf', mimeType: 'application/pdf', uti: 'com.adobe.pdf' }, controller.signal);
      } catch (reason) { if (!controller.signal.aborted) setFileState({ key: detailKey, busy: false, error: fail(reason) }); }
      finally { if (!controller.signal.aborted) setFileState(current => current?.key === detailKey ? { ...current, busy: false } : current); }
    },
  };
}
