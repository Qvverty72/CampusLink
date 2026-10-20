import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { loadDigitalPublication, loadDigitalPublications, publishDigitalPublication } from '../api/elibraryApi';
import { pickDigitalFile } from '../api/documentPicker';
import type { DigitalFile, DigitalInput, DigitalPublication } from '../types/publication';

export function useDigitalLibrary() {
  const auth = useAuth();
  const [items, setItems] = useState<DigitalPublication[]>([]), [detail, setDetail] = useState<DigitalPublication | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState(''), [description, setDescription] = useState(''), [price, setPrice] = useState('');
  const [modality, setModality] = useState<DigitalInput['modality']>('DONACION');
  const [file, setFile] = useState<DigitalFile | null>(null), [pickingFile, setPickingFile] = useState(false);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const mounted = useRef(true), saving = useRef(false), picking = useRef(false), pending = useRef<AbortController | null>(null);
  const detailRequest = useRef<AbortController | null>(null);
  function showError(reason: unknown) {
    if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) auth.refreshIdentity();
    setError(reason instanceof AuthApiError && reason.status === 503
      ? 'No pudimos confirmar la operación. Actualiza la biblioteca antes de volver a publicar.'
      : reason instanceof AuthApiError ? reason.serverMessage ?? 'No se pudo completar la operación.'
        : reason instanceof TypeError ? 'No se pudo conectar con CampusLink. Revisa tu conexión e inténtalo nuevamente.'
          : reason instanceof Error ? reason.message : 'No se pudo completar la operación.');
  }
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pending.current?.abort(); detailRequest.current?.abort(); };
  }, []);
  useEffect(() => () => { if (file?.webFile && file.uri.startsWith('blob:')) URL.revokeObjectURL(file.uri); }, [file]);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true);
    void loadDigitalPublications(abort.signal).then(data => { if (!abort.signal.aborted) setItems(data); })
      .catch(reason => { if (!abort.signal.aborted) showError(reason); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [revision]);
  async function chooseFile() {
    if (saving.current || picking.current) return;
    picking.current = true; setPickingFile(true); setError(null);
    try { const chosen = await pickDigitalFile(); if (mounted.current && chosen) setFile(chosen); }
    catch (reason) { if (mounted.current) showError(reason); }
    finally { picking.current = false; if (mounted.current) setPickingFile(false); }
  }
  async function publish() {
    if (saving.current || picking.current) return;
    const numericPrice = Number(price.trim().replace(',', '.'));
    if (!title.trim() || !description.trim() || !file) { setError('Completa título, descripción y archivo PDF.'); return; }
    if (modality === 'VENTA' && (!Number.isFinite(numericPrice) || numericPrice <= 0 || numericPrice > Number.MAX_SAFE_INTEGER)) {
      setError('Ingresa un precio de venta mayor que cero.'); return;
    }
    const abort = new AbortController(); pending.current = abort; saving.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      const publication = await publishDigitalPublication({ title, description, modality, price: modality === 'VENTA' ? numericPrice : null }, file, abort.signal);
      if (abort.signal.aborted) return;
      setItems(previous => [publication, ...previous.filter(item => item.id !== publication.id)]);
      setDetail(publication); setFormOpen(false); setNotice('Tu recurso ya está publicado y disponible para tu institución.');
      setTitle(''); setDescription(''); setPrice(''); setModality('DONACION'); setFile(null);
      setRevision(value => value + 1);
    } catch (reason) { if (!abort.signal.aborted) showError(reason); }
    finally { saving.current = false; if (!abort.signal.aborted) setBusy(false); }
  }
  async function openDetail(id: string) {
    if (saving.current) return;
    detailRequest.current?.abort(); const abort = new AbortController(); detailRequest.current = abort;
    setError(null); setNotice(null); setDetail(null);
    try { const result = await loadDigitalPublication(id, abort.signal); if (!abort.signal.aborted) setDetail(result); }
    catch (reason) { if (!abort.signal.aborted) showError(reason); }
  }
  return { items, detail, loading, busy, formOpen, title, setTitle, description, setDescription, price, setPrice,
    modality, setModality: (value: DigitalInput['modality']) => { setModality(value); if (value === 'DONACION') setPrice(''); },
    file, pickingFile, chooseFile, publish, error, notice, openDetail,
    openForm: () => { detailRequest.current?.abort(); setFormOpen(true); setDetail(null); setError(null); setNotice(null); },
    closeForm: () => { if (!saving.current && !picking.current) { setFormOpen(false); setError(null); } },
    closeDetail: () => { detailRequest.current?.abort(); setDetail(null); setNotice(null); },
    reload: () => { setError(null); setRevision(value => value + 1); } };
}
