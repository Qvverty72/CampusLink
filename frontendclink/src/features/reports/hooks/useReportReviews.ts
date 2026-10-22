import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { canManageAccess } from '@/features/users/types/access';
import { loadAccessCampuses } from '@/features/users/api/accessApi';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { saveFile } from '@/lib/files/saveFile';
import { downloadReportedFile, loadReportReview, loadReportReviews } from '../api/reportsApi';
import type { ReportReviewDetail, ReviewPage } from '../types/review';

/** Mantiene evidencia solo en memoria y descarta respuestas al cambiar cuenta, sede o caso. */
export function useReportReviews() {
  const auth = useAuth();
  const allowed = auth.status === 'ready' && canManageAccess(auth.identity?.roles ?? []);
  const identityKey = JSON.stringify([auth.status, auth.identity?.userId, auth.identity?.campusId, auth.identity?.roles, auth.identity?.profile.estado_cuenta]);
  const [catalog, setCatalog] = useState<{ key: string; rows: { id: string; name: string }[]; error: string } | null>(null);
  const [query, setQuery] = useState<{ identity: string; campusId: string; page: number; revision: number } | null>(null);
  const [listing, setListing] = useState<{ key: string; result: ReviewPage | null; error: string } | null>(null);
  const [selection, setSelection] = useState<{ key: string; id: string; revision: number } | null>(null);
  const [detail, setDetail] = useState<{ key: string; value: ReportReviewDetail | null; error: string } | null>(null);
  const [fileState, setFileState] = useState<{ key: string; busy: boolean; error: string } | null>(null);
  const [accessError, setAccessError] = useState<{ key: string; message: string } | null>(null);
  const fileRequest = useRef<AbortController | null>(null);
  const [reload, setReload] = useState(0);
  const campuses = allowed && catalog?.key === identityKey ? catalog.rows : [];
  const currentQuery = query?.identity === identityKey ? query : null;
  const campusId = currentQuery?.campusId ?? campuses[0]?.id ?? '';
  const page = currentQuery?.page ?? 1;
  const listKey = JSON.stringify([identityKey, campusId, page, currentQuery?.revision, reload]);
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
    if (allowed && campusId) void loadReportReviews(campusId, page, controller.signal).then(result => {
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
    fileRequest.current?.abort(); setFileState(null);
    return () => fileRequest.current?.abort();
  }, [detailKey]);

  const result = allowed && listing?.key === listKey ? listing : null;
  const currentDetail = allowed && detail?.key === detailKey ? detail : null;
  const deniedMessage = accessError?.key === identityKey ? accessError.message : '';
  return {
    allowed, campuses, campusId, page, selectedId: selected?.id, detail: currentDetail?.value ?? null,
    entries: result?.result?.data ?? [], hasMore: result?.result?.meta.hasMore ?? false,
    error: deniedMessage || (catalog?.key === identityKey ? catalog.error : '') || result?.error || currentDetail?.error || (fileState?.key === detailKey ? fileState.error : ''),
    loading: allowed && !deniedMessage && (!catalog || Boolean(campusId && !result) || Boolean(selected && !currentDetail)),
    downloading: fileState?.key === detailKey && fileState.busy,
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
      if (!selected || fileState?.busy) return;
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
