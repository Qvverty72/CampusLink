import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { operationId } from '@/lib/api/operation-id';
import { recordResourceOpening } from '../../api/resourceInteractions';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { addPhysicalgoodsPhoto, choosePhysicalgoodsPrincipal, loadPhysicalgoodsGallery, loadPhysicalgoodsResources, loadPublicationOptions, retirePhysicalgoodsPhoto, savePhysicalgoodsCategory } from '../api/physicalgoodsApi';
import { pickPublicationPhotos } from '../api/photoPicker';
import type { PhysicalgoodsGallery, PhysicalgoodsPage, PublicationOptions, PublicationPhoto } from '../types/publication';
import { emptyPhysicalgoodsFilters, PHYSICALGOODS_MAX_IMAGES, type PhysicalgoodsSearchFilters } from '../types/publication';

/** Conserva tarjetas idénticas y respeta las altas/bajas y el orden de la página autorizada. */
function reconcilePage(previous:PhysicalgoodsPage|null,next:PhysicalgoodsPage):PhysicalgoodsPage {
  if(!previous)return next;
  if(JSON.stringify(previous)===JSON.stringify(next))return previous;
  const existing=new Map(previous.data.map(row=>[row.id,row]));
  return {...next,data:next.data.map(row=>{const old=existing.get(row.id);return old&&JSON.stringify(old)===JSON.stringify(row)?old:row;})};
}

/** Coordina filtros, paginación, galería, imágenes y mutaciones de publicaciones físicas. */
export function usePhysicalgoodsResources(catalogActive = true) {
  const auth = useAuth();
  const [options, setOptions] = useState<PublicationOptions | null>(null), [page, setPage] = useState<PhysicalgoodsPage | null>(null);
  const [filters, setFilters] = useState({ ...emptyPhysicalgoodsFilters }), [applied, setApplied] = useState({ ...emptyPhysicalgoodsFilters }), [number, setNumber] = useState(1);
  const debouncedFilters = useDebouncedValue(filters);
  useEffect(() => {
    if (JSON.stringify(debouncedFilters) !== JSON.stringify(applied)) applyFilters(debouncedFilters);
  }, [debouncedFilters]);
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null), [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null), [gallery, setGallery] = useState<PhysicalgoodsGallery | null>(null);
  const [galleryLoading, setGalleryLoading] = useState(false), [galleryError, setGalleryError] = useState<string | null>(null), [galleryRevision, setGalleryRevision] = useState(0);
  const [editCategory, setEditCategory] = useState(''), [busy, setBusy] = useState(false), [draftImages, setDraftImages] = useState<PublicationPhoto[]>([]);
  const mutation = useRef<AbortController | null>(null), running = useRef(false), mounted = useRef(true);
  const selectedRef = useRef(selectedId), savedCategory = useRef(''); selectedRef.current = selectedId;
  const opening = useRef<{id:string;key:string;recorded:boolean} | null>(null);
  const galleryRef = useRef(gallery), draftImagesRef = useRef(draftImages), picking = useRef(false);
  galleryRef.current = gallery; draftImagesRef.current = draftImages;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; mutation.current?.abort(); }; }, []);
  function report(reason: unknown, setMessage: (message: string) => void) {
    if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) auth.refreshIdentity();
    else setMessage(reason instanceof AuthApiError ? reason.serverMessage || 'No se pudo completar la operación.' : reason instanceof Error ? reason.message : 'No se pudo completar la operación.');
  }
  useEffect(() => {
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined,renew=false;
    setLoading(true); setError(null); setPage(null);
    async function read(silent=false){
      try {
        const [catalog,result]=await Promise.all([silent?Promise.resolve(null):loadPublicationOptions(abort.signal),catalogActive?loadPhysicalgoodsResources(applied,number,abort.signal):Promise.resolve(null)]);
        if(abort.signal.aborted)return;
        if(catalog)setOptions(catalog);
        if(result)setPage(previous=>reconcilePage(previous,result));
        renew=Boolean(result?.data.some(resource=>resource.imageUrl));
      } catch(reason){
        if(abort.signal.aborted)return;
        if(!silent||reason instanceof AuthApiError&&[401,403].includes(reason.status)){
          renew=false;if(silent)setPage(null);report(reason,setError);
        }
      } finally {
        if(!abort.signal.aborted){
          if(!silent)setLoading(false);
          if(renew)timer=setTimeout(()=>void read(true),50000);
        }
      }
    }
    void read();
    return () => { abort.abort(); if (timer) clearTimeout(timer); };
  }, [applied, number, revision, catalogActive]);
  useEffect(() => {
    if (!selectedId) return;
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined,renew=false;
    setGalleryLoading(true); setGallery(null);
    async function read(silent=false){
      if(silent&&running.current){timer=setTimeout(()=>void read(true),50000);return;}
      try {
        const result=await loadPhysicalgoodsGallery(selectedId!,abort.signal);
        if(abort.signal.aborted)return;
        setGallery(previous=>JSON.stringify(previous)===JSON.stringify(result)?previous:result);
        if(opening.current?.id===selectedId&&!opening.current.recorded){
          opening.current.recorded=true;
          void recordResourceOpening(selectedId!,opening.current.key);
        }
        if(savedCategory.current!==result.category.id){setEditCategory(result.category.id);savedCategory.current=result.category.id;}
        renew=true;
      } catch(reason){
        if(abort.signal.aborted)return;
        if(!silent||reason instanceof AuthApiError&&[401,403,404].includes(reason.status)){
          renew=false;setGallery(null);report(reason,setGalleryError);
        }
      } finally {
        if(!abort.signal.aborted){
          if(!silent)setGalleryLoading(false);
          if(renew)timer=setTimeout(()=>void read(true),50000);
        }
      }
    }
    void read();
    return () => { abort.abort(); if (timer) clearTimeout(timer); };
  }, [selectedId, galleryRevision]);
  /** Serializa cambios de galería/categoría y recarga recursos tras cada operación. */
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
  /** Añade fotos seleccionadas solo si la publicación activa no cambió durante el picker. */
  async function selectPhotos() {
    const current = galleryRef.current;
    if (running.current || picking.current || !current?.canEdit) return;
    const forPublication = selectedId;
    picking.current = true; setGalleryError(null);
    try {
      const result = await pickPublicationPhotos(PHYSICALGOODS_MAX_IMAGES - current.images.length - draftImagesRef.current.length);
      const latest = galleryRef.current ?? current;
      if (mounted.current && selectedRef.current === forPublication && latest.id === forPublication && !running.current) {
        const next = [...draftImagesRef.current, ...result];
        if (latest.images.length + next.length > PHYSICALGOODS_MAX_IMAGES) throw new Error(`Cada publicación admite un máximo de ${PHYSICALGOODS_MAX_IMAGES} imágenes. Revisa las imágenes publicadas y pendientes.`);
        draftImagesRef.current = next; setDraftImages(next);
      }
    } catch (reason) { if (mounted.current && selectedRef.current === forPublication) report(reason, setGalleryError); }
    finally { picking.current = false; }
  }
  /** Sube las fotos en orden y conserva el resto de la cola si una petición se interrumpe. */
  async function upload() {
    if (picking.current || !gallery) return;
    if (gallery.images.length + draftImages.length > PHYSICALGOODS_MAX_IMAGES) {
      setGalleryError(`Cada publicación admite un máximo de ${PHYSICALGOODS_MAX_IMAGES} imágenes. Quita imágenes pendientes o publicadas antes de guardar.`); return;
    }
    let left = draftImages;
    await change(async signal => {
      while (left.length) {
        await addPhysicalgoodsPhoto(selectedId!, left[0], signal);
        if (signal.aborted) return;
        left = left.slice(1); draftImagesRef.current = left; setDraftImages(left);
      }
    });
  }
  function close() { if (running.current) return; setSelectedId(null); setGallery(null); setDraftImages([]); setGalleryError(null); }
  /** Valida límites de precio y aplica una nueva búsqueda desde la página inicial. */
  function applyFilters(value: PhysicalgoodsSearchFilters) {
    const min = value.minPrice.trim().replace(',', '.'), max = value.maxPrice.trim().replace(',', '.');
    if ([min, max].some(value => value && (!/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value)) || Number(value) > Number.MAX_SAFE_INTEGER))) { setError('Ingresa precios de filtro válidos, mayores o iguales que cero.'); return; }
    if (min && max && Number(min) > Number(max)) { setError('El precio máximo debe ser mayor o igual que el mínimo.'); return; }
    setApplied({ ...value, q: value.q.trim(), minPrice: min, maxPrice: max }); setNumber(1);
  }
  function setFilter<K extends keyof PhysicalgoodsSearchFilters>(key: K, value: PhysicalgoodsSearchFilters[K]) {
    setError(null);
    setFilters(previous => ({ ...previous, [key]: value, ...(key === 'modality' && value === 'DONACION' ? { minPrice: '', maxPrice: '' } : {}) }));
  }
  function clearFilters() { setError(null); setFilters({ ...emptyPhysicalgoodsFilters }); setApplied({ ...emptyPhysicalgoodsFilters }); setNumber(1); }
  const refresh = useCallback(() => { if (!running.current) { setNumber(1); setError(null); setRevision(value => value + 1); } }, []);
  return { options, page, filters, setFilter, search: () => applyFilters(filters), clearFilters, number, loading: loading || filters !== debouncedFilters, error, selectedId, gallery, galleryLoading, galleryError, editCategory, setEditCategory, busy, draftImages, change,
    remainingImageSlots: Math.max(0, PHYSICALGOODS_MAX_IMAGES - (gallery?.images.length ?? 0) - draftImages.length),
    open: (id: string) => { if (running.current) return; opening.current = {id,key:operationId(),recorded:false}; savedCategory.current = ''; setGallery(null); setDraftImages([]); setGalleryError(null); setSelectedId(id); }, close,
    setNumber, refresh,
    reload: () => setRevision(value => value + 1), reloadGallery: () => { setGalleryError(null); setGalleryRevision(value => value + 1); }, selectPhotos, upload,
    removeDraft: (index: number) => setDraftImages(previous => previous.filter((_, current) => current !== index)),
    principal: (id: string) => change(signal => choosePhysicalgoodsPrincipal(selectedId!, id, signal)),
    retire: (id: string) => change(signal => retirePhysicalgoodsPhoto(selectedId!, id, signal)),
    saveCategory: () => change(signal => savePhysicalgoodsCategory(selectedId!, editCategory, signal)) };
}
