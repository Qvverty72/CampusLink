import { useCallback, useEffect, useRef, useState } from 'react';
import { loadOwnedDigitalResource, loadOwnedDigitalResources } from '../api/elibraryApi';
import type { DigitalPublication } from '../types/publication';
export function useOwnedDigitalResources(initialOpen = false) {
  const [open, setOpen] = useState(initialOpen), [items, setItems] = useState<DigitalPublication[]>([]), [selected, setSelected] = useState<DigitalPublication | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null), [page, setPage] = useState(1), [hasMore, setHasMore] = useState(false);
  const [listLoading, setListLoading] = useState(initialOpen), [detailLoading, setDetailLoading] = useState(false), [error, setError] = useState<string | null>(null), [revision, setRevision] = useState(0);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController(); setListLoading(true); setItems([]); setError(null); setHasMore(false);
    void loadOwnedDigitalResources(page, abort.signal).then(result => { if (!abort.signal.aborted) { setItems(result.data); setHasMore(result.meta.hasMore); } })
      .catch(() => { if (!abort.signal.aborted) setError('No se pudieron cargar tus publicaciones.'); }).finally(() => { if (!abort.signal.aborted) setListLoading(false); });
    return () => abort.abort();
  }, [open, page, revision]);
  const edit = useCallback(async (id: string) => {
    pending.current?.abort(); const abort = new AbortController(); pending.current = abort; setSelectedId(id); setSelected(null); setError(null); setDetailLoading(true);
    try { const value = await loadOwnedDigitalResource(id, abort.signal); if (!abort.signal.aborted) setSelected(value); }
    catch { if (!abort.signal.aborted) setError('No se pudo abrir tu publicación. Reintenta la consulta.'); }
    finally { if (!abort.signal.aborted) setDetailLoading(false); }
  }, []);
  function close() { pending.current?.abort(); setDetailLoading(false); setSelectedId(null); setSelected(null); setError(null); setRevision(value => value + 1); }
  return { open, items, selected, selectedId, page, hasMore, loading: listLoading || detailLoading, error, edit, close, saved: close,
    toggle: () => { close(); setOpen(value => !value); },
    next: () => { if (hasMore && !listLoading && !detailLoading) setPage(value => value + 1); },
    previous: () => { if (!listLoading && !detailLoading) setPage(value => Math.max(1, value - 1)); },
    reload: () => { if (selectedId) void edit(selectedId); else setRevision(value => value + 1); } };
}
