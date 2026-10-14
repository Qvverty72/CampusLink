import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { addPhysicalgoodsPhoto, choosePhysicalgoodsPrincipal, loadPhysicalgoodsGallery, loadPhysicalgoodsResources, loadPublicationOptions, retirePhysicalgoodsPhoto, savePhysicalgoodsCategory } from '../api/physicalgoodsApi';
import { pickPublicationPhotos } from '../api/photoPicker';
import type { PhysicalgoodsGallery, PhysicalgoodsPage, PublicationOptions, PublicationPhoto } from '../types/publication';
import { emptyPhysicalgoodsFilters, type PhysicalgoodsSearchFilters } from '../types/publication';

export function usePhysicalgoodsResources() {
  const auth = useAuth();
  const [options, setOptions] = useState<PublicationOptions | null>(null), [page, setPage] = useState<PhysicalgoodsPage | null>(null);
  const [filters, setFilters] = useState({ ...emptyPhysicalgoodsFilters }), [applied, setApplied] = useState({ ...emptyPhysicalgoodsFilters }), [number, setNumber] = useState(1);
  const [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null), [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null), [gallery, setGallery] = useState<PhysicalgoodsGallery | null>(null);
  const [galleryLoading, setGalleryLoading] = useState(false), [galleryError, setGalleryError] = useState<string | null>(null), [galleryRevision, setGalleryRevision] = useState(0);
  const [editCategory, setEditCategory] = useState(''), [busy, setBusy] = useState(false), [draftImages, setDraftImages] = useState<PublicationPhoto[]>([]);
  const mutation = useRef<AbortController | null>(null), running = useRef(false), mounted = useRef(true);
  const selectedRef = useRef(selectedId), savedCategory = useRef(''); selectedRef.current = selectedId;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; mutation.current?.abort(); }; }, []);
  function report(reason: unknown, setMessage: (message: string) => void) {
    if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) auth.refreshIdentity();
    else setMessage(reason instanceof AuthApiError ? reason.serverMessage || 'No se pudo completar la operación.' : reason instanceof Error ? reason.message : 'No se pudo completar la operación.');
  }
  useEffect(() => {
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true); setError(null); setPage(null);
    void Promise.all([loadPublicationOptions(abort.signal), loadPhysicalgoodsResources(applied, number, abort.signal)])
      .then(([catalog, result]) => { if (!abort.signal.aborted) {
        setOptions(catalog); setPage(result);
        if (result.data.some(resource => resource.imageUrl)) timer = setTimeout(() => setRevision(value => value + 1), 50000);
      } })
      .catch(reason => { if (!abort.signal.aborted) report(reason, setError); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => { abort.abort(); if (timer) clearTimeout(timer); };
  }, [applied, number, revision]);
  useEffect(() => {
    if (!selectedId) return;
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    setGalleryLoading(true); setGallery(null);
    void loadPhysicalgoodsGallery(selectedId, abort.signal).then(result => {
      if (abort.signal.aborted) return;
      setGallery(result);
      if (savedCategory.current !== result.category.id) { setEditCategory(result.category.id); savedCategory.current = result.category.id; }
      timer = setTimeout(() => setGalleryRevision(value => value + 1), 50000);
    }).catch(reason => { if (!abort.signal.aborted) { setGallery(null); report(reason, setGalleryError); } })
      .finally(() => { if (!abort.signal.aborted) setGalleryLoading(false); });
    return () => { abort.abort(); if (timer) clearTimeout(timer); };
  }, [selectedId, galleryRevision]);
  async function change(operation: (signal: AbortSignal) => Promise<unknown>) {
    if (running.current || !selectedId || !gallery?.canEdit) return;
    const abort = new AbortController(); mutation.current = abort; running.current = true; setBusy(true); setGalleryError(null);
    try { await operation(abort.signal); }
    catch (reason) { if (!abort.signal.aborted) report(reason, setGalleryError); }
    finally {
      running.current = false;
      if (!abort.signal.aborted) { setBusy(false); setGalleryRevision(value => value + 1); setRevision(value => value + 1); }
    }
  }
  async function selectPhotos() {
    if (running.current) return;
    const forPublication = selectedId;
    try { const result = await pickPublicationPhotos(); if (mounted.current && selectedRef.current === forPublication && !running.current) setDraftImages(previous => [...previous, ...result]); }
    catch (reason) { if (mounted.current) report(reason, setGalleryError); }
  }
  async function upload() {
    let left = draftImages;
    await change(async signal => {
      while (left.length) {
        await addPhysicalgoodsPhoto(selectedId!, left[0], signal);
        if (signal.aborted) return;
        left = left.slice(1); setDraftImages(left);
      }
    });
  }
  function close() { if (running.current) return; setSelectedId(null); setGallery(null); setDraftImages([]); setGalleryError(null); }
  function search() {
    const min = filters.minPrice.trim().replace(',', '.'), max = filters.maxPrice.trim().replace(',', '.');
    if ([min, max].some(value => value && (!/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value)) || Number(value) > Number.MAX_SAFE_INTEGER))) { setError('Ingresa precios de filtro válidos, mayores o iguales que cero.'); return; }
    if (min && max && Number(min) > Number(max)) { setError('El precio máximo debe ser mayor o igual que el mínimo.'); return; }
    setApplied({ ...filters, q: filters.q.trim(), minPrice: min, maxPrice: max }); setNumber(1); setRevision(value => value + 1);
  }
  function setFilter<K extends keyof PhysicalgoodsSearchFilters>(key: K, value: PhysicalgoodsSearchFilters[K]) {
    setFilters(previous => ({ ...previous, [key]: value, ...(key === 'modality' && value === 'DONACION' ? { minPrice: '', maxPrice: '' } : {}) }));
  }
  function clearFilters() { setFilters({ ...emptyPhysicalgoodsFilters }); setApplied({ ...emptyPhysicalgoodsFilters }); setNumber(1); }
  return { options, page, filters, setFilter, search, clearFilters, number, loading, error, selectedId, gallery, galleryLoading, galleryError, editCategory, setEditCategory, busy, draftImages, change,
    open: (id: string) => { if (running.current) return; savedCategory.current = ''; setGallery(null); setDraftImages([]); setGalleryError(null); setSelectedId(id); }, close,
    setNumber,
    reload: () => setRevision(value => value + 1), reloadGallery: () => { setGalleryError(null); setGalleryRevision(value => value + 1); }, selectPhotos, upload,
    removeDraft: (index: number) => setDraftImages(previous => previous.filter((_, current) => current !== index)),
    principal: (id: string) => change(signal => choosePhysicalgoodsPrincipal(selectedId!, id, signal)),
    retire: (id: string) => change(signal => retirePhysicalgoodsPhoto(selectedId!, id, signal)),
    saveCategory: () => change(signal => savePhysicalgoodsCategory(selectedId!, editCategory, signal)) };
}
