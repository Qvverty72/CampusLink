import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type { usePhysicalgoodsResources } from './usePhysicalgoodsResources';
import { updatePhysicalgoods, withdrawPhysicalgoods } from '../api/physicalgoodsApi';
import type { PublicationInput } from '../types/publication';

type Draft = Pick<PublicationInput,'title'|'description'|'condition'|'modality'> & { price: string; updatedAt: string };
/** Prepara y guarda ediciones/retiradas respetando propiedad y versión de la galería. */
export function useEditPhysicalgoods(r: ReturnType<typeof usePhysicalgoodsResources>) {
  const { identity } = useAuth();
  const [draft,setDraft] = useState<Draft | null>(null), [confirm,setConfirm] = useState(false), [error,setError] = useState<string | null>(null);
  useEffect(() => { setDraft(null); setConfirm(false); setError(null); }, [r.selectedId]);
  function start() {
    if (!r.gallery) return;
    const resource = r.gallery;
    setError(null); setDraft({ title: resource.title,description: resource.description,condition: resource.condition,modality: resource.modality,
      price: resource.price === null ? '' : String(resource.price),updatedAt: resource.updatedAt });
  }
  /** Valida modalidad y precio, y envía actualización con `updatedAt` original. */
  async function save() {
    if (!draft || !r.gallery) return;
    const id = r.gallery.id, value = draft.price.trim().replace(',', '.'), price = draft.modality === 'DONACION' ? null : Number(value);
    if (!draft.title.trim() || !draft.description.trim() || (draft.modality === 'VENTA' && (!value || !/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(price) || price! <= 0 || price! > Number.MAX_SAFE_INTEGER))) { setError('Completa nombre, descripción y un precio de venta válido.'); return; }
    setError(null);
    await r.change(async signal => { await updatePhysicalgoods(id,{ ...draft,price },signal); if (!signal.aborted) setDraft(null); });
  }
  /** Retira el recurso y cierra la ficha solo después de una confirmación exitosa. */
  async function withdraw() {
    if (!r.gallery) return;
    const resource = r.gallery; let saved = false;
    await r.change(async signal => { await withdrawPhysicalgoods(resource.id,resource.updatedAt,signal); saved = !signal.aborted; });
    if (saved) r.close();
  }
  return { draft,setDraft,confirm,setConfirm,error,start,save,withdraw,canManage: !!r.gallery && r.gallery.owner.id === identity?.userId,
    cancel: () => { setDraft(null); setError(null); },reload: () => { setDraft(null); setError(null); r.reloadGallery(); } };
}
