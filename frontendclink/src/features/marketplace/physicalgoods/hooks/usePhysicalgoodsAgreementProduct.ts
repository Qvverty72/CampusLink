import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { loadOwnPhysicalgoodsDetail, loadPhysicalgoodsGallery } from '../api/physicalgoodsApi';
import type { PhysicalgoodsGallery, PhysicalgoodsTransaction } from '../types/publication';
import { agreementCopy as copy } from '../../utils/agreementPresentation';

type Product = Pick<PhysicalgoodsGallery, 'id' | 'description' | 'condition' | 'category' | 'images' | 'expiresIn'>;

/** Se monta al abrir Aceptada. Solo usa lecturas ya autorizadas; aborta al cerrar. */
export function usePhysicalgoodsAgreementProduct(detail: PhysicalgoodsTransaction, historical: boolean) {
  const auth = useAuth();
  const owner = detail.role === 'PROPIETARIO';
  const allowed = owner || (!historical && !detail.publication.isWithdrawn && ['DISPONIBLE', 'RESERVADO', 'FINALIZADO'].includes(detail.publication.status));
  const key = `${auth.identity?.userId}:${auth.identity?.campusId}:${detail.id}:${detail.publication.id}:${owner}:${allowed}`;
  const [result, setResult] = useState<{ key: string; product: Product } | null>(null), [loading, setLoading] = useState(allowed);
  const [error, setError] = useState<string | null>(null), [revision, setRevision] = useState(0);
  useEffect(() => {
    setError(null);
    if (!allowed) { setLoading(false); setResult(null); return; }
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    const read = owner ? loadOwnPhysicalgoodsDetail : loadPhysicalgoodsGallery;
    void read(detail.publication.id, abort.signal).then(product => {
      if (abort.signal.aborted) return;
      setResult({ key, product });
      if (product.images.length) timer = setTimeout(() => setRevision(value => value + 1), Math.max(1000, (product.expiresIn - 10) * 1000));
    }).catch(reason => {
      if (abort.signal.aborted) return;
      setResult(null); setError(copy.productError);
      if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) void auth.refreshIdentity();
    }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => { abort.abort(); if (timer) clearTimeout(timer); };
  }, [key, revision]);
  return { product: allowed && result?.key === key ? result.product : null, loading, error, unavailable: !allowed, reload: () => setRevision(value => value + 1) };
}
