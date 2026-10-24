import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { recordResourceOpening } from '../../api/resourceInteractions';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { attachDigitalFile, downloadDigitalFile, loadDigitalAcademicCatalog, loadDigitalPublication, searchDigitalPublications, publishDigitalPublication, updateDigitalAcademics } from '../api/elibraryApi';
import { digitalFilesFromWeb, mergeUniqueDigitalFiles, pickDigitalFiles, releaseDigitalFile } from '../api/documentPicker';
import { saveDigitalFile } from '../api/saveDigitalFile';
import type { DigitalAcademicCatalog, DigitalAttachment, DigitalFile, DigitalFilters, DigitalInput, DigitalPublication } from '../types/publication';

export function useDigitalLibrary() {
  const auth = useAuth();
  const [items, setItems] = useState<DigitalPublication[]>([]), [detail, setDetail] = useState<DigitalPublication | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null), [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState(''), [description, setDescription] = useState(''), [price, setPrice] = useState('');
  const [modality, setModality] = useState<DigitalInput['modality']>('DONACION');
  const [files, setFiles] = useState<DigitalFile[]>([]), [pickingFile, setPickingFile] = useState(false);
  const [attachMode, setAttachMode] = useState(false), [target, setTarget] = useState<DigitalPublication | null>(null);
  const [progress, setProgress] = useState(''), [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [filters, setFilters] = useState<DigitalFilters>({ q: '', careerId: '', subjectId: '', modality: '' });
  const [draftFilters, setDraftFilters] = useState(filters);
  const debouncedFilters = useDebouncedValue(draftFilters);
  useEffect(() => {
    if (JSON.stringify(debouncedFilters) !== JSON.stringify(filters)) {
      setError(null); setPage(1); setFilters(debouncedFilters);
    }
  }, [debouncedFilters]);
  const [page, setPage] = useState(1), [hasMore, setHasMore] = useState(false);
  const [careerIds, setCareerIds] = useState<string[]>([]), [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<DigitalAcademicCatalog | null>(null), [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null), [catalogRevision, setCatalogRevision] = useState(0);
  const [editingAcademics, setEditingAcademics] = useState(false), [academicConflict, setAcademicConflict] = useState(false);
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
    const abort = new AbortController(); setLoading(true); setItems([]); setHasMore(false);
    void searchDigitalPublications(filters, page, abort.signal).then(result => { if (!abort.signal.aborted) { setItems(result.data); setHasMore(result.meta.hasMore); } })
      .catch(reason => { if (!abort.signal.aborted) showError(reason); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [revision, filters, page]);
  useEffect(() => {
    const abort = new AbortController(); setCatalogLoading(true); setCatalogError(null);
    void loadDigitalAcademicCatalog(abort.signal).then(data => { if (!abort.signal.aborted) setCatalog(data); })
      .catch(() => { if (!abort.signal.aborted) setCatalogError('No pudimos cargar las carreras y asignaturas. Inténtalo nuevamente.'); })
      .finally(() => { if (!abort.signal.aborted) setCatalogLoading(false); });
    return () => abort.abort();
  }, [catalogRevision]);
  async function chooseFile(dropped?: File[]) {
    if (saving.current || picking.current) return;
    picking.current = true; setPickingFile(true); setError(null);
    try {
      const chosen = dropped ? digitalFilesFromWeb(dropped) : await pickDigitalFiles();
      if (!mounted.current) { chosen.forEach(releaseDigitalFile); return; }
      const previous = localFiles.current, selection = await mergeUniqueDigitalFiles(previous, chosen);
      if (mounted.current) {
        localFiles.current = selection.files; setFiles(selection.files);
        if (selection.duplicates.length) setError(`No se agregó «${selection.duplicates[0]}»: ese mismo contenido ya está seleccionado. Cada archivo puede adjuntarse una sola vez por publicación.`);
      } else selection.files.filter(file => !previous.includes(file)).forEach(releaseDigitalFile);
    }
    catch (reason) { if (mounted.current) showError(reason); }
    finally { picking.current = false; if (mounted.current) setPickingFile(false); }
  }
  async function publish() {
    if (saving.current || picking.current) return;
    if (!currentTarget.current && (catalogLoading || catalogError)) { setError('Carga el catálogo académico antes de publicar.'); return; }
    const numericPrice = Number(price.trim().replace(',', '.'));
    if (!currentTarget.current && (!files.length || !title.trim() || !description.trim())) { setError('Completa título, descripción y al menos un archivo PDF.'); return; }
    if (!currentTarget.current && modality === 'VENTA' && (!Number.isFinite(numericPrice) || numericPrice <= 0 || numericPrice > Number.MAX_SAFE_INTEGER)) {
      setError('Ingresa un precio de venta mayor que cero.'); return;
    }
    const abort = new AbortController(); pending.current = abort; saving.current = true; setBusy(true); setError(null); setNotice(null);
    queue.current = [...files];
    try {
      let publication = currentTarget.current;
      if (!publication) {
        setProgress(`Publicando ${queue.current[0].name}`);
        publication = await publishDigitalPublication({ title, description, modality, price: modality === 'VENTA' ? numericPrice : null, careerIds, subjectIds }, queue.current[0], abort.signal);
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
      // Los adjuntos cambian la versión; conservarla al abrir la edición posterior.
      publication = await loadDigitalPublication(publication.id, abort.signal);
      if (abort.signal.aborted) return;
      currentTarget.current = publication; setTarget(publication);
      setItems(previous => [publication, ...previous.filter(item => item.id !== publication.id)]);
      setDetail(publication); setFormOpen(false); setNotice(attachMode ? 'Los archivos se adjuntaron correctamente.' : 'Tu recurso ya está publicado y disponible para tu institución.');
      setTitle(''); setDescription(''); setPrice(''); setModality('DONACION'); setFiles([]); setCareerIds([]); setSubjectIds([]);
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
    setError(null); setNotice(null); setDetail(null); setSelectedId(id); setDetailLoading(true); setEditingAcademics(false); setAcademicConflict(false);
    try { const result = await loadDigitalPublication(id, abort.signal); if (!abort.signal.aborted) { setDetail(result); void recordResourceOpening(id); } }
    catch (reason) { if (!abort.signal.aborted) showError(reason); }
    finally { if (!abort.signal.aborted) setDetailLoading(false); }
  }
  async function openAcademicEditor() {
    if (!detail || saving.current) return;
    detailRequest.current?.abort(); const abort = new AbortController(); detailRequest.current = abort;
    setError(null); setNotice(null);
    try {
      const fresh = await loadDigitalPublication(detail.id, abort.signal);
      if (abort.signal.aborted) return;
      setDetail(fresh); setCareerIds(fresh.careerIds); setSubjectIds(fresh.subjectIds);
      setEditingAcademics(true); setAcademicConflict(false); setCatalogRevision(value => value + 1);
    } catch (reason) { if (!abort.signal.aborted) showError(reason); }
  }
  async function saveAcademics() {
    if (!detail || saving.current || academicConflict || catalogLoading || catalogError) return;
    const abort = new AbortController(); pending.current = abort; saving.current = true; setBusy(true); setError(null);
    try {
      const result = await updateDigitalAcademics(detail.id, { careerIds, subjectIds, updatedAt: detail.updatedAt }, abort.signal);
      if (abort.signal.aborted) return;
      setDetail(previous => ({ ...result, owner: result.owner ?? (previous?.ownerId === result.ownerId ? previous.owner : undefined) })); setItems(previous => previous.map(item => item.id === result.id ? result : item));
      setEditingAcademics(false); setNotice('Las asociaciones académicas se guardaron correctamente.');
    } catch (reason) {
      if (!abort.signal.aborted) {
        showError(reason, true);
        if (!(reason instanceof AuthApiError) || [409, 503].includes(reason.status)) setAcademicConflict(true);
      }
    } finally { saving.current = false; if (!abort.signal.aborted) setBusy(false); }
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
  const refresh = useCallback(() => { if (!saving.current && !picking.current) { setPage(1); setError(null); setRevision(value => value + 1); } }, []);
  return { items, detail, selectedId, detailLoading, loading: loading || draftFilters !== debouncedFilters, busy, formOpen, title, setTitle, description, setDescription, price, setPrice,
    refresh, refreshVersion: revision, page, hasMore, filters: draftFilters, search: (value: DigitalFilters) => { setError(null); setDraftFilters({ ...value }); },
    savedContent:(value:DigitalPublication)=>{setDetail(previous=>value.isWithdrawn?null:{...value,owner:value.owner??(previous?.ownerId===value.ownerId?previous.owner:undefined)});if(value.isWithdrawn)setSelectedId(null);setNotice(value.isWithdrawn?'La publicación se retiró. Los archivos y adquisiciones se conservan.':'La publicación se actualizó.');setRevision(previous=>previous+1);},
    previousPage: () => setPage(value => Math.max(1, value - 1)), nextPage: () => { if (hasMore && !loading) setPage(value => value + 1); },
    careerIds, setCareerIds, subjectIds, setSubjectIds, catalog, catalogLoading, catalogError,
    reloadCatalog: () => setCatalogRevision(value => value + 1),
    editingAcademics, academicConflict, openAcademicEditor, saveAcademics,
    cancelAcademics: () => { if (!saving.current) { detailRequest.current?.abort(); setEditingAcademics(false); setAcademicConflict(false); setError(null); } },
    modality, setModality: (value: DigitalInput['modality']) => { setModality(value); if (value === 'DONACION') setPrice(''); },
    files, pickingFile, chooseFile, publish, error, notice, openDetail, attachMode, target, progress, downloading, download,
    isOwner: detail?.ownerId === auth.identity?.userId,
    removeFile: (index: number) => {
      if (saving.current || picking.current || !localFiles.current[index]) return;
      releaseDigitalFile(localFiles.current[index]);
      localFiles.current = localFiles.current.filter((_, current) => current !== index); setFiles(localFiles.current);
    },
    openForm: () => { detailRequest.current?.abort(); setSelectedId(null); setDetailLoading(false); setFormOpen(true); setDetail(null); setError(null); setNotice(null); setAttachMode(false); setEditingAcademics(false); setCareerIds([]); setSubjectIds([]); setCatalogRevision(value => value + 1); },
    openAttachments: () => { if (detail && !saving.current) { detailRequest.current?.abort(); setEditingAcademics(false); setAttachMode(true); setTarget(detail); currentTarget.current = detail; setFormOpen(true); setError(null); setNotice(null); } },
    closeForm,
    closeDetail: () => { if (saving.current) return; detailRequest.current?.abort(); downloadRequest.current?.abort(); downloadRequest.current = null; setSelectedId(null); setDetailLoading(false); setDownloading(null); setDetail(null); setError(null); setNotice(null); setEditingAcademics(false); },
    reload: () => { setError(null); setRevision(value => value + 1); } };
}
