import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { operationId } from '@/lib/api/operation-id';
import { loadDigitalMessages, loadDigitalTrade, sendDigitalMessage } from '../api/digitalTradesApi';
import type { DigitalMessage, DigitalTrade } from '../types/trade';
import type { DigitalPage } from '../types/publication';

export function useDigitalMessages(initial: DigitalTrade, onSnapshot?: (trade: DigitalTrade) => void) {
  const [trade, setTrade] = useState(initial), [messages, setMessages] = useState<DigitalMessage[]>([]);
  const [meta, setMeta] = useState<DigitalPage | null>(null), [page, setPage] = useState(1), [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null), [sendError, setSendError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null), mutation = useRef<AbortController | null>(null), running = useRef(false);
  const pending = useRef<{ text: string; id: string } | null>(null), mounted = useRef(true);
  const snapshot = useRef(onSnapshot); snapshot.current = onSnapshot;
  const latest = useRef({ trade, page, draft, verified, loading }); latest.current = { trade, page, draft, verified, loading };
  const active = ['RESERVADA', 'PENDIENTE_CONFIRMACION'].includes(trade.status);

  const read = useCallback(async (quiet = false, targetPage = latest.current.page) => {
    if (running.current || quiet && (request.current || latest.current.loading)) return;
    request.current?.abort(); const abort = new AbortController(); request.current = abort;
    if (!quiet) { setLoading(true); setError(null); }
    try {
      const [current, result] = await Promise.all([
        loadDigitalTrade(initial.publicationId, initial.id, abort.signal),
        loadDigitalMessages(initial, targetPage, abort.signal),
      ]);
      if (!abort.signal.aborted) {
        setTrade(current); setVerified(true); setMessages(result.data); setMeta(result.meta); setPage(targetPage); setError(null);
        latest.current = { ...latest.current, trade: current, verified: true, page: targetPage };
        snapshot.current?.(current);
      }
    } catch (reason) {
      if (!abort.signal.aborted) {
        if (reason instanceof AuthApiError && [401,403,404].includes(reason.status)) {
          setVerified(false); setMessages([]); setMeta(null);
          latest.current = { ...latest.current, verified: false };
          setError('Ya no tienes acceso a esta conversación.');
        } else if (!quiet) setError('No se pudo actualizar la conversación. Inténtalo nuevamente.');
      }
    } finally {
      if (request.current === abort) request.current = null;
      if (!abort.signal.aborted) setLoading(false);
    }
  }, [initial.publicationId, initial.id]);
  useEffect(() => {
    mounted.current = true; void read();
    return () => { mounted.current = false; request.current?.abort(); mutation.current?.abort(); };
  }, [read]);

  async function send() {
    const current = latest.current, text = current.draft.trim();
    if (running.current || current.loading || !current.verified || !['RESERVADA','PENDIENTE_CONFIRMACION'].includes(current.trade.status)
      || !text || text.length > 2000) return;
    running.current = true; request.current?.abort(); request.current = null;
    const abort = new AbortController(); mutation.current = abort; setBusy(true); setSendError(null);
    // A retry of an uncertain response keeps its key, even after refreshing the conversation.
    if (pending.current?.text !== text) pending.current = { text, id: operationId() };
    try {
      const receipt = await sendDigitalMessage(current.trade, text, pending.current.id, abort.signal);
      if (!abort.signal.aborted) {
        pending.current = null; setDraft(''); latest.current = { ...latest.current, draft: '' };
        setMessages(previous => [receipt, ...previous.filter(row => row.id !== receipt.id)]);
        setSendError(null);
      }
    } catch (reason) {
      if (!abort.signal.aborted) {
        if (reason instanceof AuthApiError && [401,403,404].includes(reason.status)) { setVerified(false); setMessages([]); setMeta(null); }
        setSendError(reason instanceof AuthApiError ? reason.serverMessage ?? 'No se pudo enviar el mensaje.'
          : 'No se pudo confirmar el envío. Puedes reintentar sin duplicar el mensaje.');
      }
    } finally {
      running.current = false;
      if (mounted.current && !abort.signal.aborted) { setBusy(false); void read(false, 1); }
    }
  }
  return { trade, messages, meta, page, draft, loading, busy, verified, error, sendError, active, send,
    setDraft: (value: string) => { if (!running.current) { setDraft(value); latest.current = { ...latest.current, draft: value }; } },
    refresh: () => read(false, 1), poll: () => read(true), changePage: (value: number) => read(false, Math.max(1, value)),
  };
}
