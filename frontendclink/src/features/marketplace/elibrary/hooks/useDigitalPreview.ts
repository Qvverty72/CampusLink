import { useEffect, useRef, useState } from 'react';
import { loadDigitalPreview, type DigitalPreviewResult } from '../api/elibraryApi';

/** Solo solicita la muestra preparada por el servidor; nunca obtiene el original. */
export function useDigitalPreview(publicationId: string, fileId: string, autoOpen = false) {
  const [open, setOpen] = useState(autoOpen), [result, setResult] = useState<DigitalPreviewResult | null>(null);
  const [loading, setLoading] = useState(autoOpen), [error, setError] = useState(false);
  const pending = useRef<AbortController | null>(null);
  async function show() {
    pending.current?.abort(); const abort = new AbortController(); pending.current = abort;
    setOpen(true); setLoading(true); setError(false); setResult(null);
    try { const value = await loadDigitalPreview(publicationId, fileId, abort.signal); if (!abort.signal.aborted) setResult(value); }
    catch { if (!abort.signal.aborted) setError(true); }
    finally { if (!abort.signal.aborted) setLoading(false); }
  }
  useEffect(() => {
    setResult(null); setError(false); setOpen(autoOpen); setLoading(autoOpen);
    if (autoOpen) void show();
    return () => pending.current?.abort();
  }, [publicationId, fileId, autoOpen]);
  return { open, result, loading, error, show, hide: () => { pending.current?.abort(); setOpen(false); setLoading(false); setResult(null); } };
}
