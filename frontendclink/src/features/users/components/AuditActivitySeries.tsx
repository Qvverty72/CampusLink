import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CalendarDays, ChevronDown, ChevronUp } from 'lucide-react-native';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { loadAuditOccurrences } from '../api/auditApi';
import { auditLabels, type AuditDetail, type AuditOccurrences } from '../types/audit';
import { AuditEntryDetails } from './AuditEntryDetails';
import { auditColors as colors, auditStyles as shared } from './audit.styles';

const date = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : 'Fecha no disponible';
type Props = { campusId: string; auditId: string; total: number; onAccessError: (reason: unknown) => void; renderDetails: (entry: AuditDetail) => ReactNode };

/** Navegador histórico: cada fecha conserva sus datos e inscripciones, incluso si ya terminó o fue eliminada. */
export function AuditActivitySeries({ campusId, auditId, total, onAccessError, renderDetails }: Props) {
  const [page,setPage] = useState(1), [retry,setRetry] = useState(0), [selected,setSelected] = useState<string | null>(null);
  const [data,setData] = useState<AuditOccurrences | null>(null), [loading,setLoading] = useState(true), [hasMore,setHasMore] = useState(false), [error,setError] = useState('');
  const report = useRef(onAccessError); report.current = onAccessError;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null); setHasMore(false); setSelected(null);
    void loadAuditOccurrences(campusId,auditId,page,controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setData(result.data); setHasMore(result.meta.hasMore); setLoading(false);
    }).catch(reason => {
      if (controller.signal.aborted) return;
      setLoading(false);
      if (reason instanceof AuthApiError && [401,403].includes(reason.status)) { report.current(reason); return; }
      setError(reason instanceof AuthApiError && reason.status === 404 ? 'La serie ya no está disponible en este registro.' : 'No se pudieron cargar las ocurrencias. Inténtalo nuevamente.');
    });
    return () => controller.abort();
  }, [campusId,auditId,page,retry]);
  const changePage = (step: number) => { setSelected(null); setData(null); setPage(value => value+step); };
  return <View style={styles.card}>
    <View style={styles.heading}>
      <CalendarDays size={21} color={colors.PRIMARY} accessible={false} aria-hidden />
      <View style={styles.copy}><Text accessibilityRole="header" style={shared.sectionTitle}>Ocurrencias de la serie</Text>
        <Text style={shared.fieldLabel}>{total} {total === 1 ? 'ocurrencia publicada' : 'ocurrencias publicadas'}</Text></View>
    </View>
    <View style={styles.body}>
      <Text style={shared.valueMuted}>Revisa cada fecha para consultar sus datos al publicar y su historial de participación. Las fechas y estados de esta lista son los actuales conservados.</Text>
      {loading && <ActivityIndicator accessibilityLabel="Cargando ocurrencias" color={colors.PRIMARY} />}
      {!!error && <View style={shared.errorCard}><Text accessibilityRole="alert" style={shared.errorText}>{error}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Reintentar ocurrencias" style={shared.retry} onPress={() => setRetry(value => value+1)}><Text style={shared.buttonText}>Reintentar</Text></TouchableOpacity></View>}
      {data && <>
        {!data.occurrences.length && <Text style={shared.valueMuted}>No hay ocurrencias en esta página.</Text>}
        {data.occurrences.map(occurrence => {
          const open = selected === occurrence.auditId, Chevron = open ? ChevronUp : ChevronDown;
          const name = occurrence.index ? `Ocurrencia ${occurrence.index}` : occurrence.title ?? 'Ocurrencia';
          return <View key={occurrence.auditId} style={styles.occurrence}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${open ? 'Contraer' : 'Consultar'} ${name.toLowerCase()}`}
              accessibilityState={{ expanded: open }} aria-expanded={open} style={styles.trigger} activeOpacity={0.65} onPress={() => setSelected(open ? null : occurrence.auditId)}>
              <View style={styles.copy}>
                <Text style={styles.title}>{name}</Text>
                {!!occurrence.title && <Text style={shared.value}>{occurrence.title}</Text>}
                <Text style={shared.fieldLabel}>Inicio · {date(occurrence.startAt)}</Text>
                <Text style={shared.fieldLabel}>Término · {date(occurrence.endAt)}</Text>
                <Text style={styles.status}>{occurrence.status ? auditLabels[occurrence.status] ?? 'Estado no disponible' : 'Estado no disponible'}{occurrence.visibility === 'HIDDEN' ? ' · Oculta' : ''}</Text>
              </View><Chevron size={18} color={colors.PRIMARY} accessible={false} aria-hidden />
            </TouchableOpacity>
            <Text selectable style={styles.id}>ID: {occurrence.activityId}</Text>
            {open && <View style={styles.details}><AuditEntryDetails occurrence key={occurrence.auditId} campusId={campusId} auditId={occurrence.auditId} onAccessError={onAccessError} renderDetails={renderDetails} /></View>}
          </View>;
        })}
        <View style={shared.pagination}>
          <Text style={shared.pageLabel}>Página {page}</Text>
          <View style={shared.paginationControls}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ocurrencias anteriores" disabled={page === 1} accessibilityState={{ disabled: page === 1 }}
              style={[shared.pageButton,page === 1 && shared.disabled]} onPress={() => changePage(-1)}><Text style={shared.buttonText}>Anterior</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ocurrencias siguientes" disabled={!hasMore} accessibilityState={{ disabled: !hasMore }}
              style={[shared.pageButton,!hasMore && shared.disabled]} onPress={() => changePage(1)}><Text style={shared.buttonText}>Siguiente</Text></TouchableOpacity>
          </View>
        </View>
      </>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 }, copy: { flex: 1, minWidth: 0, gap: 6 },
  body: { borderTopWidth: 1, borderTopColor: colors.border, padding: 16, gap: 16 },
  occurrence: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden' },
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  title: { color: colors.SECONDARY, fontSize: 12, fontWeight: '700', lineHeight: 18 },
  status: { color: colors.PRIMARY, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  id: { color: colors.muted, fontSize: 11, lineHeight: 18, paddingHorizontal: 14, paddingBottom: 14 },
  details: { gap: 16, padding: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.soft },
});
