import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { canManageAccess } from '@/features/users/types/access';
import { loadAccessCampuses } from '@/features/users/api/accessApi';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { saveFile } from '@/lib/files/saveFile';
import { downloadReportedFile, loadReportReview, loadReportReviews, submitReportResolution } from '../api/reportsApi';
import type { ReportResolutionInput, ReportReviewDetail, ReportResolutionDetail, ReportStatusFilter, ReviewPage } from '../types/review';

/** Estado de edición local: el contrato HTTP sigue exigiendo una decisión concreta. */
export interface ReportResolutionDraft { decision: ReportResolutionInput['decision'] | null; justification: string }

/** Mantiene evidencia solo en memoria y descarta respuestas al cambiar cuenta, sede o caso. */
export function useReportReviews() {
  const auth = useAuth();
  const allowed = auth.status === 'ready' && canManageAccess(auth.identity?.roles ?? []);
  const identityKey = JSON.stringify([auth.status, auth.identity?.userId, auth.identity?.campusId, auth.identity?.roles, auth.identity?.profile.estado_cuenta]);
  const [catalog, setCatalog] = useState<{ key: string; rows: { id: string; name: string }[]; error: string } | null>(null);
  const [query, setQuery] = useState<{ identity: string; campusId: string; status: ReportStatusFilter; page: number; revision: number } | null>(null);
  const [listing, setListing] = useState<{ key: string; result: ReviewPage | null; error: string } | null>(null);
  const [selection, setSelection] = useState<{ key: string; id: string; revision: number } | null>(null);
  const [detail, setDetail] = useState<{ key: string; value: ReportReviewDetail | ReportResolutionDetail | null; error: string } | null>(null);
  const [fileState, setFileState] = useState<{ key: string; fileId: string; busy: boolean; error: string } | null>(null);
  const [accessError, setAccessError] = useState<{ key: string; message: string } | null>(null);
  const fileRequest = useRef<AbortController | null>(null);
  const resolutionRequest = useRef<AbortController | null>(null);
  const [draft, setDraft] = useState<{ key: string; input: ReportResolutionDraft; confirming: boolean } | null>(null);
  const [resolutionState, setResolutionState] = useState<{ key: string; busy: boolean; error: string; needsReload: boolean } | null>(null);
  const [reload, setReload] = useState(0);
  const campuses = allowed && catalog?.key === identityKey ? catalog.rows : [];
  const currentQuery = query?.identity === identityKey ? query : null;
  const campusId = currentQuery?.campusId ?? campuses[0]?.id ?? '';
  const page = currentQuery?.page ?? 1;
  const statusFilter = currentQuery?.status ?? '';
  const listKey = JSON.stringify([identityKey, campusId, statusFilter, page, currentQuery?.revision, reload]);
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
    if (allowed && campusId) void loadReportReviews(campusId, page, controller.signal, statusFilter).then(result => {
      if (!controller.signal.aborted) setListing({ key: listKey, result, error: '' });
    }).catch(reason => { if (!controller.signal.aborted) setListing({ key: listKey, result: null, error: fail(reason) }); });
    return () => controller.abort();
  }, [listKey, allowed]);

  useEffect(() => {
    const controller = new AbortController(); setDetail(null);
    if (allowed && selected) void loadReportReview(campusId, selected.id, controller.signal).then(value => {
      if (!controller.signal.aborted) setDetail({ key: detailKey, value, error: '' });
    }).catch(reason => { if (!controller.signal.aborted) setDetail({ key: detailKey, value: null, error: fail(reason) }); });
    return () => controller.abort();
  }, [detailKey, allowed]);

  useEffect(() => {
    fileRequest.current?.abort(); fileRequest.current = null; setFileState(null);
    resolutionRequest.current?.abort(); resolutionRequest.current = null; setResolutionState(null); setDraft(null);
    return () => fileRequest.current?.abort();
  }, [detailKey]);

  useEffect(() => () => resolutionRequest.current?.abort(), []);

  const result = allowed && listing?.key === listKey ? listing : null;
  const currentDetail = allowed && detail?.key === detailKey ? detail : null;
  const deniedMessage = accessError?.key === identityKey ? accessError.message : '';
  const inProgress = currentDetail?.value?.status === 'EN_REVISION' && !!currentDetail.value.resolution;
  const input: ReportResolutionDraft = inProgress ? { decision: 'ACOGER', justification: currentDetail!.value!.resolution!.justification ?? '' }
    : draft?.key === detailKey ? draft.input : { decision: null, justification: '' };
  const action = resolutionState?.key === detailKey ? resolutionState : null;
  const canResolve = !!currentDetail?.value && ['PENDIENTE', 'EN_REVISION'].includes(currentDetail.value.status);
  const catalogError = catalog?.key === identityKey ? catalog.error : '';
  const catalogLoading = allowed && !deniedMessage && (!catalog || catalog.key !== identityKey);
  const listLoading = allowed && !deniedMessage && !catalogLoading && Boolean(campusId && !result);
  const detailLoading = allowed && !deniedMessage && Boolean(selected && !currentDetail);
  const currentFile = fileState?.key === detailKey ? fileState : null;
  return {
    identityKey,
    statusFilter,
    applyFilters(filters: { campusId: string; status: ReportStatusFilter }) {
      if (resolutionRequest.current || !campuses.some(campus => campus.id === filters.campusId)) return;
      setQuery({ identity: identityKey, campusId: filters.campusId, status: filters.status, page: 1, revision: (currentQuery?.revision ?? 0) + 1 }); setSelection(null);
    },
    allowed, campuses, campusId, page, selectedId: selected?.id, detail: currentDetail?.value ?? null,
    entries: result?.result?.data ?? [], hasMore: result?.result?.meta.hasMore ?? false,
    // Estados agregados conservados para consumidores existentes del hook.
    error: deniedMessage || catalogError || result?.error || currentDetail?.error || currentFile?.error || '',
    loading: catalogLoading || listLoading || detailLoading,
    catalogLoading, listLoading, detailLoading, catalogError,
    listError: result?.error ?? '', detailError: currentDetail?.error ?? '',
    accessDenied: deniedMessage,
    downloadError: currentFile?.error ?? '', downloadFileId: currentFile?.fileId,
    downloading: !!currentFile?.busy,
    hasResolutionDraft: !inProgress && (input.decision !== null || !!input.justification.trim()),
    canResolve, resolutionInput: input, resolutionInProgress: inProgress, resolving: !!action?.busy,
    resolutionError: action?.error ?? '', resolutionNeedsReload: !!action?.needsReload,
    confirmingResolution: draft?.key === detailKey && draft.confirming,
    editResolution(change: Partial<ReportResolutionInput>) {
      if (inProgress || resolutionRequest.current || action?.needsReload) return;
      setResolutionState(null);
      setDraft({ key: detailKey, input: { ...input, ...change }, confirming: false });
    },
    requestResolution() {
      if (!canResolve || resolutionRequest.current || action?.needsReload) return;
      if (!input.decision) {
        setResolutionState({ key: detailKey, busy: false, needsReload: false, error: 'Selecciona una decisión para continuar.' }); return;
      }
      if (!input.justification.trim() || input.justification.trim().length > 2000 || input.justification.includes('\u0000')) {
        setResolutionState({ key: detailKey, busy: false, needsReload: false, error: 'Escribe una justificación válida de entre 1 y 2000 caracteres.' }); return;
      }
      setResolutionState(null); setDraft({ key: detailKey, input, confirming: true });
    },
    cancelResolution() { if (!resolutionRequest.current) setDraft({ key: detailKey, input, confirming: false }); },
    async confirmResolution() {
      if (!canResolve || !selected || resolutionRequest.current || draft?.key !== detailKey || !draft.confirming || !draft.input.decision) return;
      const controller = new AbortController(); resolutionRequest.current = controller;
      setResolutionState({ key: detailKey, busy: true, error: '', needsReload: false });
      try {
        const value = await submitReportResolution(campusId, selected.id,
          { decision: draft.input.decision, justification: draft.input.justification.trim() }, controller.signal);
        if (!controller.signal.aborted) {
          setDetail({ key: detailKey, value, error: '' });
          setListing(current => current?.key === listKey && current.result ? { ...current, result: { ...current.result,
            data: current.result.data.map(row => row.id === value.id ? { ...row, status: value.status, resolution: value.resolution } : row) } } : current);
          setDraft(null); setResolutionState(null);
        }
      } catch (reason) {
        if (!controller.signal.aborted) {
          setDraft({ key: detailKey, input: draft.input, confirming: false });
          setResolutionState({ key: detailKey, busy: false, error: fail(reason), needsReload: true });
        }
      } finally { if (resolutionRequest.current === controller) resolutionRequest.current = null; }
    },
    chooseCampus(id: string) {
      if (!campuses.some(campus => campus.id === id)) return;
      setQuery({ identity: identityKey, campusId: id, status: statusFilter, page: 1, revision: 0 }); setSelection(null);
    },
    changePage(next: number) {
      if (listLoading || !Number.isSafeInteger(next) || next < 1 || next === page || next > page + 1 || (next > page && !result?.result?.meta.hasMore)) return;
      setQuery({ identity: identityKey, campusId, status: statusFilter, page: next, revision: 0 }); setSelection(null);
    },
    open(id: string) { setSelection({ key: listKey, id, revision: (selected?.revision ?? 0) + 1 }); },
    close() {
      // Una decisión puede sacar el caso del filtro. Releer al volver evita páginas incoherentes.
      if (statusFilter && currentDetail?.value && currentDetail.value.status !== statusFilter) {
        setQuery({ identity: identityKey, campusId, status: statusFilter, page: 1, revision: (currentQuery?.revision ?? 0) + 1 });
      }
      setSelection(null);
    },
    retry() {
      if (deniedMessage) { setAccessError(null); setQuery(null); setSelection(null); setReload(value => value + 1); }
      else if (selected) setSelection({ ...selected, revision: selected.revision + 1 });
      else setReload(value => value + 1);
    },
    async download(fileId: string, name: string) {
      if (!selected || !currentDetail?.value || ['RESUELTO', 'DESESTIMADO'].includes(currentDetail.value.status) || fileRequest.current) return;
      const controller = new AbortController(); fileRequest.current = controller;
      setFileState({ key: detailKey, fileId, busy: true, error: '' });
      try {
        const blob = await downloadReportedFile(campusId, selected.id, fileId, controller.signal);
        if (!controller.signal.aborted) await saveFile(blob, { id: fileId, name, extension: 'pdf', mimeType: 'application/pdf', uti: 'com.adobe.pdf' }, controller.signal);
      } catch (reason) { if (!controller.signal.aborted) setFileState({ key: detailKey, fileId, busy: false, error: fail(reason) }); }
      finally {
        if (fileRequest.current === controller) fileRequest.current = null;
        if (!controller.signal.aborted) setFileState(current => current?.key === detailKey ? { ...current, busy: false } : current);
      }
    },
  };
}
