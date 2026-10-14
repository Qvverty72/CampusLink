import { useEffect, useRef, useState } from 'react';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { loadPublicationOptions, publishPhysicalgoods } from '../api/physicalgoodsApi';
import type { PublicationCreated, PublicationInput, PublicationOptions, PublicationPhoto } from '../types/publication';

export function usePublishPhysicalgoods() {
  const auth = useAuth();
  const [options, setOptions] = useState<PublicationOptions | null>(null);
  const [title, setTitle] = useState(''), [description, setDescription] = useState('');
  const [condition, setCondition] = useState<PublicationInput['condition']>('BUEN_ESTADO');
  const [categoryId, setCategoryId] = useState('');
  const [modality, setModality] = useState<PublicationInput['modality']>('VENTA');
  const [price, setPrice] = useState('');
  const [careerId, setCareerId] = useState(''), [subjectId, setSubjectId] = useState('');
  const [photo, setPhoto] = useState<PublicationPhoto | null>(null);
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

  async function choosePhoto() {
    if (saving.current) return;
    setError(null);
    try {
      // Invoke directly from the button to preserve browser user activation.
      const result = await launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, base64: true, quality: 1, exif: false });
      if (!mounted.current || result.canceled) return;
      const asset = result.assets[0], base64 = asset.base64;
      if (!base64) throw new Error('No se pudo leer la fotografía. Selecciona otra.');
      const bytes = base64.length * 3 / 4 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
      if (bytes > 5 * 1024 * 1024) throw new Error('La fotografía debe pesar como máximo 5 MB.');
      // Native pickers can convert the selected format; use the returned bytes.
      const mimeType = base64.startsWith('/9j/') ? 'image/jpeg' : base64.startsWith('iVBORw0KGgo') ? 'image/png'
        : base64.startsWith('UklGR') ? 'image/webp' : null;
      if (!mimeType) throw new Error('Selecciona una fotografía JPEG, PNG o WebP.');
      setPhoto({ name: asset.fileName || 'fotografia-principal', mimeType, base64, uri: asset.uri });
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'No se pudo seleccionar la fotografía.'); }
  }
  async function publish() {
    if (saving.current || loading || !options || created) return;
    const numericPrice = Number(price.trim().replace(',', '.'));
    if (!title.trim() || !description.trim() || !categoryId || !photo) { setError('Completa el nombre, la descripción, la categoría y la fotografía principal.'); return; }
    if (modality === 'VENTA' && (!Number.isFinite(numericPrice) || numericPrice <= 0)) { setError('Ingresa un precio de venta mayor que cero.'); return; }
    const abort = new AbortController(); pending.current = abort; saving.current = true;
    setBusy(true); setError(null);
    try {
      const result = await publishPhysicalgoods({ title, description, condition, categoryId, modality,
        price: modality === 'VENTA' ? numericPrice : null, careerId: careerId || null, subjectId: subjectId || null,
        photo: { name: photo.name, mimeType: photo.mimeType, base64: photo.base64 } }, abort.signal);
      if (!abort.signal.aborted) setCreated(result);
    } catch (reason) {
      if (abort.signal.aborted) return;
      if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) auth.refreshIdentity();
      else setError(reason instanceof Error ? reason.message : 'No se pudo publicar el recurso.');
    } finally { saving.current = false; if (!abort.signal.aborted) setBusy(false); }
  }
  function reset() {
    setCreated(null); setTitle(''); setDescription(''); setCondition('BUEN_ESTADO'); setCategoryId('');
    setModality('VENTA'); setPrice(''); setCareerId(''); setSubjectId(''); setPhoto(null); setError(null);
  }
  return { options, title, setTitle, description, setDescription, condition, setCondition, categoryId, setCategoryId,
    modality, setModality: (value: PublicationInput['modality']) => { setModality(value); if (value === 'DONACION') setPrice(''); },
    price, setPrice, careerId, setCareerId, subjectId, setSubjectId, photo, choosePhoto,
    loading, busy, error, created, publish, reset, reload: () => setRevision(value => value + 1) };
}
