import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { attachDigitalFile, downloadDigitalFile, loadDigitalPublication, loadDigitalPublications, publishDigitalPublication } from '../api/elibraryApi';
import { pickDigitalFiles, releaseDigitalFile } from '../api/documentPicker';
import { saveDigitalFile } from '../api/saveDigitalFile';
import type { DigitalAttachment, DigitalFile, DigitalInput, DigitalPublication } from '../types/publication';

export function useDigitalLibrary() {
  const auth = useAuth();
  const [items, setItems] = useState<DigitalPublication[]>([]), [detail, setDetail] = useState<DigitalPublication | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState(''), [description, setDescription] = useState(''), [price, setPrice] = useState('');
  const [modality, setModality] = useState<DigitalInput['modality']>('DONACION');
  const [files, setFiles] = useState<DigitalFile[]>([]), [pickingFile, setPickingFile] = useState(false);
  const [attachMode, setAttachMode] = useState(false), [target, setTarget] = useState<DigitalPublication | null>(null);
  const [progress, setProgress] = useState(''), [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const mounted = useRef(true), saving = useRef(false), picking = useRef(false), pending = useRef<AbortController | null>(null);
  const detailRequest = useRef<AbortController | null>(null);
  const queue = useRef<DigitalFile[]>([]), currentTarget = useRef<DigitalPublication | null>(null);
  const localFiles = useRef(files); localFiles.current = files;
  const downloadRequest = useRef<AbortController | null>(null);
  function showError(reason: unknown, mutation = false) {
    if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) auth.refreshIdentity();
    setError(reason instanceof AuthApiError && reason.status === 503
      ? mutation ? 'No pudimos confirmar la operación. Actualiza la biblioteca antes de volver a intentarlo.' : 'El servicio no está disponible. Inténtalo nuevamente.'
      : reason instanceof AuthApiError ? reason.serverMessage ?? 'No se pudo completar la operación.'
        : reason instanceof TypeError ? 'No se pudo conectar con CampusLink. Revisa tu conexión e inténtalo nuevamente.'
          : reason instanceof Error ? reason.message : 'No se pudo completar la operación.');
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; pending.current?.abort(); detailRequest.current?.abort(); downloadRequest.current?.abort();
      localFiles.current.forEach(releaseDigitalFile);
    };
  }, []);
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
    try {
      const chosen = await pickDigitalFiles();
      if (mounted.current) setFiles(previous => [...previous, ...chosen]);
      else chosen.forEach(releaseDigitalFile);
    }
    catch (reason) { if (mounted.current) showError(reason); }
    finally { picking.current = false; if (mounted.current) setPickingFile(false); }
  }
  async function publish() {
    if (saving.current || picking.current) return;
    const numericPrice = Number(price.trim().replace(',', '.'));
    if (!files.length || (!currentTarget.current && (!title.trim() || !description.trim()))) { setError('Completa título, descripción y al menos un archivo PDF.'); return; }
    if (!currentTarget.current && modality === 'VENTA' && (!Number.isFinite(numericPrice) || numericPrice <= 0 || numericPrice > Number.MAX_SAFE_INTEGER)) {
      setError('Ingresa un precio de venta mayor que cero.'); return;
    }
    const abort = new AbortController(); pending.current = abort; saving.current = true; setBusy(true); setError(null); setNotice(null);
    queue.current = [...files];
    try {
      let publication = currentTarget.current;
      if (!publication) {
        setProgress(`Publicando ${queue.current[0].name}`);
        publication = await publishDigitalPublication({ title, description, modality, price: modality === 'VENTA' ? numericPrice : null }, queue.current[0], abort.signal);
        if (abort.signal.aborted) return;
        currentTarget.current = publication; setTarget(publication);
        releaseDigitalFile(queue.current.shift()!); setFiles([...queue.current]);
      }
      while (queue.current.length) {
        setProgress(`Adjuntando ${queue.current[0].name} · ${queue.current.length} pendientes`);
        const attachment = await attachDigitalFile(publication.id, queue.current[0], abort.signal);
        if (abort.signal.aborted) return;
        publication = { ...publication, files: [...publication.files, attachment] };
        currentTarget.current = publication; setTarget(publication);
        releaseDigitalFile(queue.current.shift()!); setFiles([...queue.current]);
      }
      setItems(previous => [publication, ...previous.filter(item => item.id !== publication.id)]);
      setDetail(publication); setFormOpen(false); setNotice(attachMode ? 'Los archivos se adjuntaron correctamente.' : 'Tu recurso ya está publicado y disponible para tu institución.');
      setTitle(''); setDescription(''); setPrice(''); setModality('DONACION'); setFiles([]);
      currentTarget.current = null; setTarget(null); setAttachMode(false);
      setRevision(value => value + 1);
    } catch (reason) {
      if (!abort.signal.aborted) {
        showError(reason, true);
        if (currentTarget.current) {
          const count = currentTarget.current.files.length, remaining = queue.current.length;
          setNotice(`La publicación está guardada con ${count} archivo${count === 1 ? '' : 's'}. ${remaining === 1 ? 'Queda 1 pendiente' : `Quedan ${remaining} pendientes`}. Puedes reintentar o continuar con los archivos guardados.`);
        }
      }
    }
    finally { saving.current = false; if (!abort.signal.aborted) { setBusy(false); setProgress(''); } }
  }
  async function openDetail(id: string) {
    if (saving.current) return;
    downloadRequest.current?.abort(); downloadRequest.current = null; setDownloading(null);
    detailRequest.current?.abort(); const abort = new AbortController(); detailRequest.current = abort;
    setError(null); setNotice(null); setDetail(null);
    try { const result = await loadDigitalPublication(id, abort.signal); if (!abort.signal.aborted) setDetail(result); }
    catch (reason) { if (!abort.signal.aborted) showError(reason); }
  }
  async function download(file: DigitalAttachment) {
    if (!detail || downloadRequest.current) return;
    const abort = new AbortController(); downloadRequest.current = abort; setDownloading(file.id); setError(null);
    try {
      const blob = await downloadDigitalFile(detail.id, file, abort.signal);
      if (!abort.signal.aborted) await saveDigitalFile(blob, file);
    } catch (reason) { if (!abort.signal.aborted) showError(reason); }
    finally { if (downloadRequest.current === abort) downloadRequest.current = null; if (!abort.signal.aborted) setDownloading(null); }
  }
  function closeForm() {
    if (saving.current || picking.current) return;
    if (currentTarget.current) { setDetail(currentTarget.current); setRevision(value => value + 1); files.forEach(releaseDigitalFile); setFiles([]); }
    setFormOpen(false); setError(null); setNotice(null); setTarget(null); currentTarget.current = null; setAttachMode(false);
  }
  return { items, detail, loading, busy, formOpen, title, setTitle, description, setDescription, price, setPrice,
    modality, setModality: (value: DigitalInput['modality']) => { setModality(value); if (value === 'DONACION') setPrice(''); },
    files, pickingFile, chooseFile, publish, error, notice, openDetail, attachMode, target, progress, downloading, download,
    isOwner: detail?.ownerId === auth.identity?.userId,
    removeFile: (index: number) => { if (!saving.current) setFiles(previous => { releaseDigitalFile(previous[index]); return previous.filter((_, current) => current !== index); }); },
    openForm: () => { detailRequest.current?.abort(); setFormOpen(true); setDetail(null); setError(null); setNotice(null); setAttachMode(false); },
    openAttachments: () => { if (detail && !saving.current) { setAttachMode(true); setTarget(detail); currentTarget.current = detail; setFormOpen(true); setError(null); setNotice(null); } },
    closeForm,
    closeDetail: () => { detailRequest.current?.abort(); downloadRequest.current?.abort(); downloadRequest.current = null; setDownloading(null); setDetail(null); setNotice(null); },
    reload: () => { setError(null); setRevision(value => value + 1); } };
}
