import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronDown, ChevronUp, History } from 'lucide-react-native';
import { Pagination } from '@/components/Pagination';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { loadAuditEdits } from '../api/auditApi';
import { auditLabels, type AuditDetail, type AuditEntry } from '../types/audit';
import { AuditResponsibleBanner } from './AuditResponsibleBanner';
import { AuditEntryDetails } from './AuditEntryDetails';
import { auditColors as colors, auditStyles as shared } from './audit.styles';

const date = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('es-CL', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}) : 'Fecha no disponible';

/** Una cronología completa por contenido; cada versión conserva su ID y detalle originales. */
export function AuditEditTimeline({ entry, onAccessError, renderDetails }: {
  entry: AuditDetail; onAccessError: (reason: unknown) => void; renderDetails: (entry: AuditDetail) => ReactNode;
}) {
  const [page,setPage] = useState(1), [retry,setRetry] = useState(0), [selected,setSelected] = useState<string | null>(null);
  const [data,setData] = useState<AuditEntry[] | null>(null), [total,setTotal] = useState(entry.editGroup?.count ?? 0);
  const [loading,setLoading] = useState(true), [error,setError] = useState('');
  const report = useRef(onAccessError); report.current = onAccessError;
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setData(null); setSelected(null);
    void loadAuditEdits(entry.campus_id,entry.id,page,controller.signal).then(result => {
      if (controller.signal.aborted) return;
      const last = Math.max(1,Math.ceil(result.meta.total / 5));
      if (page > last) { setPage(last); return; }
      setData(result.data); setTotal(result.meta.total); setLoading(false);
    }).catch(reason => {
      if (controller.signal.aborted) return;
      setLoading(false);
      if (reason instanceof AuthApiError && [401,403].includes(reason.status)) { report.current(reason); return; }
      setError(reason instanceof AuthApiError && reason.status === 404 ? 'El historial de ediciones ya no está disponible.' : 'No se pudieron cargar las ediciones. Inténtalo nuevamente.');
    });
    return () => controller.abort();
  }, [entry.campus_id,entry.id,page,retry]);
  return <View style={styles.card}>
    <View style={styles.heading}><History size={21} color={colors.PRIMARY} accessible={false} aria-hidden />
      <View style={styles.copy}><Text accessibilityRole="header" style={shared.sectionTitle}>Línea de tiempo de ediciones</Text>
        <Text style={shared.fieldLabel}>{total} ediciones registradas · Más recientes primero</Text></View></View>
    <View style={styles.body}>
      <Text style={shared.valueMuted}>Consulta todas las ediciones de este contenido, incluidas las que quedan fuera de los filtros del listado. Revisa qué cambió en cada card y ábrela para consultar el detalle completo.</Text>
      {loading && <ActivityIndicator accessibilityLabel="Cargando ediciones" color={colors.PRIMARY} />}
      {!!error && <View style={shared.errorCard}><Text accessibilityRole="alert" style={shared.errorText}>{error}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Reintentar ediciones" style={shared.retry} onPress={() => setRetry(value => value+1)}><Text style={shared.buttonText}>Reintentar</Text></TouchableOpacity></View>}
      {data && <>
        {!data.length && <Text style={shared.valueMuted}>No hay ediciones registradas.</Text>}
        {data.map((version,index) => {
          const open = selected === version.id, Chevron = open ? ChevronUp : ChevronDown;
          const title = `Edición ${total - (page-1)*5 - index}`;
          return <View key={version.id} style={styles.version}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${open ? 'Contraer' : 'Consultar'} ${title.toLowerCase()}`}
              accessibilityHint={version.changes?.complete ? version.changes.fields.length
                ? `Cambios en: ${version.changes.fields.map(field=>auditLabels[field] ?? field).join(', ')}. Abre el detalle completo.`
                : 'Sin diferencias entre los datos registrados. Abre el detalle completo.' : 'Abre el detalle completo de esta edición.'}
              accessibilityState={{ expanded: open }} aria-expanded={open} style={styles.trigger} activeOpacity={0.65} onPress={() => setSelected(open ? null : version.id)}>
              <View style={styles.versionHeading}>
              <View style={styles.dot} /><View style={styles.copy}>
                <Text accessibilityRole="header" style={styles.title}>{title}</Text>
                <Text style={shared.fieldLabel}>{date(version.created_at)}</Text>
                {!!version.entity_name && <Text style={shared.value}>{version.entity_name}</Text>}
                <View style={styles.changePreview}>
                  <Text style={styles.changeTitle}>¿Qué cambió?</Text>
                  {version.changes?.complete ? version.changes.fields.length ? <View style={styles.changeFields}>
                    {version.changes.fields.map(field=><Text key={field} style={styles.changeChip}>{auditLabels[field] ?? field}</Text>)}
                  </View> : <Text style={shared.fieldLabel}>Sin diferencias entre los datos registrados.</Text>
                    : <Text style={shared.fieldLabel}>{version.changes ? 'No hay suficientes datos históricos para resumir el cambio.' : 'Resumen no disponible. Consulta el detalle de esta edición.'}</Text>}
                </View>
              </View><Chevron size={18} color={colors.PRIMARY} accessible={false} aria-hidden />
              </View>
              <AuditResponsibleBanner actorId={version.actor_usuario_id} actor={version.actor} />
            </TouchableOpacity>
            {open && <View style={styles.details}><AuditEntryDetails key={version.id} campusId={entry.campus_id} auditId={version.id} onAccessError={onAccessError} renderDetails={renderDetails} /></View>}
          </View>;
        })}
        <Pagination page={page} totalPages={Math.max(1,Math.ceil(total/5))} label="Páginas de ediciones" onPageChange={next => { if (!loading) { setSelected(null); setData(null); setPage(next); } }} />
      </>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 }, copy: { flex: 1, minWidth: 0, gap: 8 },
  body: { borderTopWidth: 1, borderTopColor: colors.border, padding: 12, gap: 16 },
  version: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: 'hidden' },
  trigger: { gap: 12, padding: 14, minHeight: 48 },
  versionHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ACCENT },
  title: { color: colors.PRIMARY, fontSize: 15, fontWeight: '700' },
  changePreview: { gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  changeTitle: { color: colors.SECONDARY, fontSize: 12, fontWeight: '700' },
  changeFields: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  changeChip: { color: colors.PRIMARY, backgroundColor: colors.soft, fontSize: 12, lineHeight: 18,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, flexShrink: 1, maxWidth: '100%' },
  details: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.soft, padding: 8 },
});
