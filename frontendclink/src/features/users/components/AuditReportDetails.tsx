import { StyleSheet, Text, View } from 'react-native';
import type { AuditDetail } from '../types/audit';
import { auditReportPresentation } from '../utils/auditReportPresentation';
import { auditColors as colors } from './audit.styles';

const dateLabel = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('es-CL',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}) : 'Fecha no registrada';

/** Ficha histórica de la resolución: sustituye justificación y datos genéricos, sin reconsultar el caso actual. */
export function AuditReportDetails({ entry, campusName }: { entry: AuditDetail; campusName?: string }) {
  const report = auditReportPresentation(entry,campusName);
  return <View style={styles.stack}>
    <View style={styles.card}>
      <View style={styles.summary}>
        <Text accessibilityRole="header" style={styles.title}>{report.title}</Text>
        <Text style={styles.muted}>{report.target.label} · {report.campus.name ?? 'Campus no disponible'}</Text>
      </View>
      <View style={styles.columns}>
        <View style={styles.column}><Text style={styles.label}>MOTIVO</Text>
          <Text selectable style={styles.value}>{report.reason ?? 'Motivo no registrado'}</Text>
          {!!report.reasonCode && <Text selectable style={styles.raw}>{report.reasonCode}</Text>}
        </View>
        <View style={styles.column}><Text style={styles.label}>MEDIDA APLICADA</Text><Text selectable style={styles.value}>{report.measure}</Text></View>
      </View>
      <View style={styles.divider}>
        <Text style={styles.label}>IDENTIFICADOR</Text>
        {!!report.report.name && <Text selectable style={styles.value}>{report.report.name}</Text>}
        <Text selectable style={styles.raw}>ID: {report.report.id ?? 'No registrado'}</Text>
      </View>
    </View>

    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.label}>CRONOLOGÍA</Text>
      <View style={styles.event}>
        <View style={styles.rail}><View style={styles.dot} /><View style={styles.line} /></View>
        <View style={styles.eventBody}>
          <Text style={styles.eventTitle}>Reportada</Text>
          <Text style={styles.muted}>{dateLabel(report.reportedAt)}</Text>
          {!!report.reportedAt && <Text selectable style={styles.raw}>{report.reportedAt}</Text>}
          <View style={styles.eventDescription}><Text style={styles.label}>DESCRIPCIÓN DEL REPORTE</Text><Text selectable style={styles.value}>{report.description ?? 'Sin descripción registrada.'}</Text></View>
          {report.duration && <Text style={styles.duration}>{report.duration} hasta {report.final ? 'la resolución' : 'la decisión'}</Text>}
        </View>
      </View>
      <View style={styles.event}>
        <View style={styles.rail}><View style={[styles.dot,report.final ? styles.resolvedDot : styles.pendingDot]} /></View>
        <View style={styles.eventBody}>
          <Text style={styles.eventTitle}>{report.final ? 'Resuelta' : report.resolvedAt ? 'Decisión registrada' : 'Sin resolución registrada'}</Text>
          <Text style={styles.muted}>{dateLabel(report.resolvedAt)}</Text>
          {!!report.resolvedAt && <Text selectable style={styles.raw}>{report.resolvedAt}</Text>}
          <View style={styles.eventDescription}><Text style={styles.label}>FUNDAMENTO DE LA RESOLUCIÓN</Text><Text selectable style={styles.value}>{report.justification ?? 'Sin fundamento registrado.'}</Text></View>
        </View>
      </View>
    </View>

    <View style={[styles.card,styles.stateRow]}>
      <View style={styles.stateCopy}><Text accessibilityRole="header" style={styles.label}>ESTADO DE LA DENUNCIA</Text><Text style={styles.muted}>{report.final ? 'Resolución final' : report.status === 'EN_REVISION' ? 'Decisión en curso' : 'Estado registrado'}</Text></View>
      <View style={[styles.stateBadge,report.status === 'RESUELTO' && styles.stateResolved,!report.final && styles.statePending]}><Text style={styles.stateText}>{report.statusLabel}</Text></View>
    </View>

    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.label}>PERSONAS</Text>
      <Person title="REPORTANTE" person={report.reporter} />
      <Person title="RESUELTO POR" person={report.resolver} />
    </View>

    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.label}>CONTENIDO DENUNCIADO</Text>
      <View style={styles.columns}>
        <View style={styles.column}><Text style={styles.label}>TIPO</Text><Text selectable style={styles.value}>{report.target.label}</Text></View>
        <View style={styles.column}><Text style={styles.label}>CAMPUS</Text><Text selectable style={styles.value}>{report.campus.name ?? 'Nombre no disponible'}</Text></View>
      </View>
      <View style={styles.field}><Text style={styles.label}>{report.target.idLabel.toLocaleUpperCase('es-CL')}</Text>
        {!!report.target.name && <Text selectable style={styles.value}>{report.target.name}</Text>}
        <Text selectable style={styles.raw}>{report.target.id ?? 'ID no registrado'}</Text>
      </View>
      <View style={styles.field}><Text style={styles.label}>ID DE CAMPUS</Text><Text selectable style={styles.raw}>{report.campus.id ?? 'ID no registrado'}</Text></View>
      {!!report.target.status && <View style={styles.field}><Text style={styles.label}>ESTADO DEL CONTENIDO REGISTRADO</Text><Text selectable style={styles.value}>{({OCULTO:'Oculto',DISPONIBLE:'Disponible',RETIRADO:'Retirado'} as Record<string,string>)[report.target.status] ?? report.target.status}</Text></View>}
    </View>
  </View>;
}

function Person({ title, person }: { title: string; person: { id: string | null; name: string | null } }) {
  const initials = person.name?.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toLocaleUpperCase('es-CL') ?? '?';
  return <View style={styles.person}>
    <View style={styles.avatar} accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Text style={styles.initials}>{initials}</Text></View>
    <View style={styles.personCopy}><Text style={styles.label}>{title}</Text>
      <Text selectable style={styles.value}>{person.name ?? 'Nombre no disponible'}</Text><Text selectable style={styles.raw}>ID: {person.id ?? 'No registrado'}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  stack: { gap: 14 }, card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: '#D8E4EF', borderRadius: 16, padding: 18, gap: 12 },
  summary: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingBottom: 12, gap: 4 },
  title: { color: colors.PRIMARY, fontSize: 18, lineHeight: 25, fontWeight: '700' },
  label: { color: colors.PRIMARY, fontSize: 10, lineHeight: 16, fontWeight: '600', letterSpacing: 0.45 },
  value: { color: colors.PRIMARY, fontSize: 13, lineHeight: 20, flexShrink: 1 }, muted: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  raw: { color: colors.SECONDARY, fontSize: 10, lineHeight: 16 },
  columns: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' }, column: { flex: 1, minWidth: 0, gap: 3 }, field: { gap: 3 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 12, gap: 3 },
  event: { flexDirection: 'row', gap: 10 }, rail: { width: 10, alignItems: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 5, backgroundColor: '#0B2E50' },
  resolvedDot: { backgroundColor: '#2B8553' }, pendingDot: { backgroundColor: '#A8B7C4' },
  line: { flex: 1, width: 1, backgroundColor: '#D8E4EF', marginTop: 5, marginBottom: -12 },
  eventBody: { flex: 1, minWidth: 0, gap: 2, paddingBottom: 5 }, eventTitle: { color: colors.PRIMARY, fontSize: 13, lineHeight: 20, fontWeight: '600' },
  eventDescription: { paddingTop: 12, gap: 4 }, duration: { color: colors.muted, fontSize: 11, lineHeight: 18, paddingTop: 12, paddingBottom: 4 },
  stateRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, stateCopy: { minWidth: 0, gap: 3 },
  stateBadge: { maxWidth: '100%', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.soft },
  stateResolved: { backgroundColor: '#E5F3EB' }, statePending: { backgroundColor: '#FFF4D9' }, stateText: { color: colors.PRIMARY, fontSize: 11, lineHeight: 17, fontWeight: '600', flexShrink: 1 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F0F9' },
  initials: { color: colors.PRIMARY, fontSize: 12, lineHeight: 18, fontWeight: '700' }, personCopy: { flex: 1, minWidth: 0, gap: 2 },
});
