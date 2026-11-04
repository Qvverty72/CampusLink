import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronDown, ChevronUp, LogIn, LogOut, UsersRound } from 'lucide-react-native';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { loadAuditParticipation } from '../api/auditApi';
import type { AuditParticipation } from '../types/audit';
import { auditColors as colors, auditStyles as shared } from './audit.styles';

/** Consulta histórica administrativa; la participación pertenece a esta ocurrencia, no a toda la serie. */
export function AuditActivityParticipation({ campusId, auditId, onAccessError }: { campusId: string; auditId: string; onAccessError: (error: unknown) => void }) {
  const [open, setOpen] = useState(false), [page, setPage] = useState(1), [retry, setRetry] = useState(0);
  const [data, setData] = useState<AuditParticipation | null>(null), [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const report = useRef(onAccessError); report.current = onAccessError;
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null); setHasMore(false);
    void loadAuditParticipation(campusId, auditId, page, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setData(result.data); setHasMore(result.meta.hasMore); setLoading(false);
    }).catch(reason => {
      if (controller.signal.aborted) return;
      setLoading(false);
      if (reason instanceof AuthApiError && [401,403].includes(reason.status)) { report.current(reason); return; }
      setError(reason instanceof AuthApiError && reason.status === 404 ? 'El historial de participación ya no está disponible.' : 'No se pudo cargar la participación. Inténtalo nuevamente.');
    });
    return () => controller.abort();
  }, [open, campusId, auditId, page, retry]);
  const Chevron = open ? ChevronUp : ChevronDown;
  return <View style={styles.card}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ver historial de participación" accessibilityState={{ expanded: open }} aria-expanded={open}
      activeOpacity={0.65} style={styles.heading} onPress={() => setOpen(current => !current)}>
      <UsersRound size={20} color={colors.PRIMARY} accessible={false} aria-hidden />
      <View style={styles.headingCopy}><Text style={shared.sectionTitle}>Historial de participación</Text><Text style={shared.fieldLabel}>Inscripciones y retiros de esta actividad</Text></View>
      <Chevron size={18} color={colors.PRIMARY} accessible={false} aria-hidden />
    </TouchableOpacity>
    {open && <View style={styles.body}>
      <Text style={shared.fieldLabel}>Las inscripciones no representan asistencia presencial.</Text>
      {loading && <ActivityIndicator accessibilityLabel="Cargando historial de participación" color={colors.PRIMARY} />}
      {!!error && <View style={shared.errorCard}><Text accessibilityRole="alert" style={shared.errorText}>{error}</Text>
        <TouchableOpacity accessibilityRole="button" style={shared.retry} onPress={() => setRetry(value => value + 1)}><Text style={shared.buttonText}>Reintentar participación</Text></TouchableOpacity>
      </View>}
      {data && <>
        <View style={styles.stats}>
          <View style={styles.stat}><Text style={styles.count}>{data.summary.joined}</Text><Text style={shared.fieldLabel}>Inscritos actuales</Text></View>
          <View style={styles.stat}><Text style={styles.count}>{data.summary.left}</Text><Text style={shared.fieldLabel}>Retirados actualmente</Text></View>
        </View>
        {(data.summary.historyIncomplete || data.events.some(event => event.provenance === 'LEGACY_STATE')) &&
          <Text style={styles.notice}>El historial antiguo puede estar incompleto. Los estados recuperados no permiten reconstruir todos los ingresos y retiros anteriores.</Text>}
        {!data.events.length && <Text style={shared.valueMuted}>No hay ingresos ni retiros registrados en esta página.</Text>}
        {data.events.map(event => {
          const Icon = event.type === 'JOINED' ? LogIn : LogOut;
          return <View key={event.id} style={styles.event}>
            <View style={styles.eventIcon}><Icon size={17} color={colors.PRIMARY} accessible={false} aria-hidden /></View>
            <View style={styles.eventCopy}>
              <Text style={styles.eventTitle}>{event.provenance === 'LEGACY_STATE' ? event.type === 'JOINED' ? 'Inscripción recuperada' : 'Retiro recuperado' : event.type === 'JOINED' ? 'Se inscribió' : 'Se retiró'}</Text>
              <Text style={shared.fieldLabel}>{new Date(event.occurredAt).toLocaleString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</Text>
              <Text selectable style={shared.referenceName}>{event.name ?? 'Nombre no disponible'}</Text>
              <Text selectable style={shared.referenceId}>ID: {event.userId}</Text>
            </View>
          </View>;
        })}
        <View style={shared.pagination}>
          <Text style={shared.pageLabel}>Página {page}</Text>
          <View style={shared.paginationControls}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Participación anterior" disabled={page === 1} accessibilityState={{ disabled: page === 1 }}
              style={[shared.pageButton, page === 1 && shared.disabled]} onPress={() => setPage(value => value - 1)}><Text style={shared.buttonText}>Anterior</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Participación siguiente" disabled={!hasMore} accessibilityState={{ disabled: !hasMore }}
              style={[shared.pageButton, !hasMore && shared.disabled]} onPress={() => setPage(value => value + 1)}><Text style={shared.buttonText}>Siguiente</Text></TouchableOpacity>
          </View>
        </View>
      </>}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18 },
  heading: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  headingCopy: { flex: 1, minWidth: 0, gap: 4 }, body: { borderTopWidth: 1, borderTopColor: colors.border, padding: 16, gap: 16 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, stat: { flex: 1, minWidth: 95, padding: 12, borderRadius: 12, gap: 4, backgroundColor: colors.soft },
  count: { fontSize: 22, fontWeight: '700', color: colors.PRIMARY },
  notice: { color: '#79550B', backgroundColor: '#FFF4D9', borderRadius: 10, padding: 12, fontSize: 12, lineHeight: 19 },
  event: { flexDirection: 'row', gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 },
  eventIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  eventCopy: { flex: 1, minWidth: 0, gap: 5 }, eventTitle: { fontSize: 13, fontWeight: '700', color: colors.PRIMARY, lineHeight: 20 },
});
