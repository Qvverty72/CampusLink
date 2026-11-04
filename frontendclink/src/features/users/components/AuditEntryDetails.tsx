import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { loadAuditEntry } from '../api/auditApi';
import type { AuditDetail } from '../types/audit';
import { auditColors as colors, auditStyles as shared } from './audit.styles';

/** Carga diferida compartida por ocurrencias y versiones; cancela respuestas al contraer. */
export function AuditEntryDetails({ campusId, auditId, onAccessError, renderDetails, occurrence = false }: {
  campusId: string; auditId: string; onAccessError: (reason: unknown) => void;
  renderDetails: (entry: AuditDetail) => ReactNode; occurrence?: boolean;
}) {
  const [entry,setEntry] = useState<AuditDetail | null>(null), [error,setError] = useState(''), [retry,setRetry] = useState(0);
  const report = useRef(onAccessError); report.current = onAccessError;
  const kind = occurrence ? 'ocurrencia' : 'edición';
  useEffect(() => {
    const controller = new AbortController(); setEntry(null); setError('');
    void loadAuditEntry(campusId,auditId,controller.signal).then(result => { if (!controller.signal.aborted) setEntry(result); }).catch(reason => {
      if (controller.signal.aborted) return;
      if (reason instanceof AuthApiError && [401,403].includes(reason.status)) { report.current(reason); return; }
      setError(reason instanceof AuthApiError && reason.status === 404 ? `La ${kind} ya no está disponible en este registro.` : `No se pudo cargar el detalle de esta ${kind}.`);
    });
    return () => controller.abort();
  }, [campusId,auditId,retry,kind]);
  return <View style={{ gap: 16 }}>
    {!entry && !error && <ActivityIndicator accessibilityLabel={`Cargando detalle de ${kind}`} color={colors.PRIMARY} />}
    {!!error && <View style={shared.errorCard}><Text accessibilityRole="alert" style={shared.errorText}>{error}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Reintentar detalle de ${kind}`} style={shared.retry} onPress={() => setRetry(value => value+1)}><Text style={shared.buttonText}>Reintentar</Text></TouchableOpacity></View>}
    {entry && renderDetails(entry)}
  </View>;
}
