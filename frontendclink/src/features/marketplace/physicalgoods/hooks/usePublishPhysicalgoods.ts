import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { addPhysicalgoodsPhoto, loadPublicationOptions, publishPhysicalgoods } from '../api/physicalgoodsApi';
import { pickPublicationPhotos } from '../api/photoPicker';
import type { PublicationCreated, PublicationInput, PublicationOptions, PublicationPhoto } from '../types/publication';
import { PHYSICALGOODS_MAX_IMAGES } from '../types/publication';

/** Gestiona borrador, envío inicial y reintentos de subida de fotos secundarias. */
export function usePublishPhysicalgoods(onPublished: () => void) {
  const auth = useAuth();
  const [options, setOptions] = useState<PublicationOptions | null>(null);
  const [title, setTitle] = useState(''), [description, setDescription] = useState('');
  const [condition, setCondition] = useState<PublicationInput['condition']>('BUEN_ESTADO');
  const [categoryId, setCategoryId] = useState('');
  const [modality, setModality] = useState<PublicationInput['modality']>('VENTA');
  const [price, setPrice] = useState('');
  const [careerId, setCareerId] = useState(''), [subjectId, setSubjectId] = useState('');
  const [photos, setPhotos] = useState<PublicationPhoto[]>([]);
  const photosRef = useRef(photos), picking = useRef(false); photosRef.current = photos;
  const photo = photos[0];
  const queued = useRef<PublicationPhoto[]>([]), [remaining, setRemaining] = useState(0);
  const [created, setCreated] = useState<PublicationCreated | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null), [revision, setRevision] = useState(0);
  const pending = useRef<AbortController | null>(null), mounted = useRef(true), saving = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; pending.current?.abort(); }; }, []);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setError(null); setOptions(null);
    void loadPublicationOptions(abort.signal).then(catalog => {
      if (!abort.signal.aborted) {
        setOptions(catalog);
        setCategoryId(id => catalog.categories.some(row => row.id === id) ? id : '');
        setCareerId(id => catalog.careers.some(row => row.id === id) ? id : '');
        setSubjectId(id => catalog.subjects.some(row => row.id === id) ? id : '');
      }
    }).catch(reason => {
      if (abort.signal.aborted) return;
      if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) auth.refreshIdentity();
      else setError('No se pudieron cargar las opciones. Inténtalo nuevamente.');
    }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [revision]);

  /** Añade fotos locales al borrador sin permitir cambios durante el guardado. */
  async function choosePhoto() {
    if (saving.current || picking.current) return;
    setError(null);
    picking.current = true;
    try {
      const selected = await pickPublicationPhotos(PHYSICALGOODS_MAX_IMAGES - photosRef.current.length);
      if (mounted.current && !saving.current) {
        const next = [...photosRef.current, ...selected];
        if (next.length > PHYSICALGOODS_MAX_IMAGES) throw new Error(`Cada publicación admite un máximo de ${PHYSICALGOODS_MAX_IMAGES} imágenes.`);
        photosRef.current = next; setPhotos(next);
      }
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'No se pudo seleccionar la fotografía.'); }
    finally { picking.current = false; }
  }
  /** Publica la primera foto y luego sube las restantes; permite reanudar la cola. */
  async function publish() {
    if (saving.current || picking.current || loading || !options || (created && !queued.current.length)) return;
    const numericPrice = Number(price.trim().replace(',', '.'));
    if (!title.trim() || !description.trim() || !categoryId || !photo) { setError('Completa el nombre, la descripción, la categoría y la fotografía principal.'); return; }
    if (modality === 'VENTA' && (!Number.isFinite(numericPrice) || numericPrice <= 0)) { setError('Ingresa un precio de venta mayor que cero.'); return; }
    const abort = new AbortController(); pending.current = abort; saving.current = true;
    setBusy(true); setError(null);
    let publication = created;
    try {
      if (!publication) {
        publication = await publishPhysicalgoods({ title, description, condition, categoryId, modality,
        price: modality === 'VENTA' ? numericPrice : null, careerId: careerId || null, subjectId: subjectId || null,
        photo: { name: photo.name, mimeType: photo.mimeType, base64: photo.base64 } }, abort.signal);
        if (abort.signal.aborted) return;
        setCreated(publication); queued.current = photos.slice(1); setRemaining(queued.current.length); onPublished();
      }
      while (queued.current.length) {
        await addPhysicalgoodsPhoto(publication.id, queued.current[0], abort.signal);
        if (abort.signal.aborted) return;
        queued.current.shift(); setRemaining(queued.current.length);
      }
      onPublished();
    } catch (reason) {
      if (abort.signal.aborted) return;
      if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) auth.refreshIdentity();
      else setError(publication ? `El recurso está publicado. Quedan ${queued.current.length} imágenes por cargar; puedes reintentarlas.`
        : reason instanceof Error ? reason.message : 'No se pudo publicar el recurso.');
    } finally { saving.current = false; if (!abort.signal.aborted) setBusy(false); }
  }
  function reset() {
    setCreated(null); setTitle(''); setDescription(''); setCondition('BUEN_ESTADO'); setCategoryId('');
    setModality('VENTA'); setPrice(''); setCareerId(''); setSubjectId(''); setPhotos([]); queued.current = []; setRemaining(0); setError(null);
  }
  return { options, title, setTitle, description, setDescription, condition, setCondition, categoryId, setCategoryId,
    modality, setModality: (value: PublicationInput['modality']) => { setModality(value); if (value === 'DONACION') setPrice(''); },
    price, setPrice, careerId, setCareerId, subjectId, setSubjectId, photo, photos, choosePhoto, remaining,
    removePhoto: (index: number) => setPhotos(previous => previous.filter((_, current) => current !== index)),
    makePrincipal: (index: number) => setPhotos(previous => [previous[index], ...previous.filter((_, current) => current !== index)]),
    loading, busy, error, created, publish, reset, reload: () => setRevision(value => value + 1) };
}
