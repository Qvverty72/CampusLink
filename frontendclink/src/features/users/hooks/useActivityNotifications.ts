import { useCallback,useRef,useState } from 'react';
import {useFocusEffect} from 'expo-router';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { fetchNotifications, updateNotification } from '../api/notificationsApi';
import type { UserNotification } from '../types/notification';

/** Pagina notificaciones y refleja lecturas/eliminaciones solo tras el acuse del servidor. */
export function useActivityNotifications(onChanged?: () => void) {
  const { refreshIdentity } = useAuth();
  const [items, setItems] = useState<UserNotification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingPage, setLoadingPage] = useState<'first' | 'more' | null>('first');
  const [error, setError] = useState<string | null>(null);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [publicationId,setPublicationId]=useState<string|null>(null);
  const pending = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const handleError = (reason: unknown) => {
    setError(reason instanceof AuthApiError ? reason.message : 'No se pudo confirmar la operación. Actualiza las notificaciones.');
    if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) refreshIdentity();
  };
  async function load(next?: string) {
    if (pending.current || !mounted.current) return;
    const abort = new AbortController(); pending.current = abort; setBusy(true); setError(null);
    setLoadingPage(next ? 'more' : 'first');
    try {
      const page = await fetchNotifications(next, abort.signal);
      if (!abort.signal.aborted) {
        setItems(current => next ? [...new Map([...current, ...page.items].map(item => [item.id, item])).values()] : page.items);
        setCursor(page.nextCursor);
      }
    } catch (reason) { if (!abort.signal.aborted) handleError(reason); }
    finally { if (!abort.signal.aborted) { pending.current = null; setBusy(false); setLoadingPage(null); } }
  }
  useFocusEffect(useCallback(() => {
    mounted.current = true; void load();
    return () => {
      mounted.current = false; pending.current?.abort(); pending.current = null;
      setBusy(false); setLoadingPage(null);
      setActivityId(null);setPublicationId(null);
    };
  }, []));
  async function update(item: UserNotification, remove: boolean) {
    if (pending.current || !mounted.current) return;
    const abort = new AbortController(); pending.current = abort; setBusy(true); setError(null);
    try {
      await updateNotification(item.id, remove, abort.signal);
      if (!abort.signal.aborted) {
        setItems(current => remove ? current.filter(row => row.id !== item.id)
          : current.map(row => row.id === item.id ? { ...row, readAt: row.readAt ?? new Date().toISOString() } : row));
        onChanged?.();
        if (!remove) {
          if(item.type==='PHYSICAL_PUBLICATION_CLOSE_REMINDER')setPublicationId(item.publicationId);
          else setActivityId(item.activityId);
        }
      }
    } catch (reason) { if (!abort.signal.aborted) handleError(reason); }
    finally { if (!abort.signal.aborted) { pending.current = null; setBusy(false); } }
  }
  return { items, cursor, busy, loading: loadingPage !== null, loadingMore: loadingPage === 'more',
    error, activityId, setActivityId, publicationId,setPublicationId,load, update };
}
