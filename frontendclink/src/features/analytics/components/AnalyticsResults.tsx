import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { AnalyticalReport, DashboardData, DashboardInterval, DashboardMetric } from '../types/dashboard';

const number = (value: number | null) => value === null ? 'Sin datos' : new Intl.NumberFormat('es-CL').format(value);

function KpiCard({ title, metric, children }: { title: string; metric: DashboardMetric; children?: ReactNode }) {
  return <View style={styles.card}>
    <Text style={styles.cardTitle}>{title}</Text>
    <Text style={styles.value}>{number(metric.value)}</Text>
    {metric.value !== null && children}
    <Text style={styles.cardMeta}>{metric.scope.institutionName} · {metric.scope.campusName}</Text>
    {metric.scope.career && <Text style={styles.cardMeta}>Carrera: {metric.scope.career.name}</Text>}
    <Text style={styles.cardMeta}>{metric.period.from} al {metric.period.to} · {metric.period.timeZone}</Text>
  </View>;
}

function IntervalCard({ interval }: { interval: DashboardInterval }) {
  const metrics = interval.metrics;
  return <View style={styles.card}>
    <Text style={styles.cardTitle}>{interval.label}</Text>
    <Text style={styles.cardMeta}>{interval.period.from} al {interval.period.to} · {interval.period.timeZone}</Text>
    {!metrics ? <Text style={styles.detail}>Sin datos disponibles para este intervalo.</Text> : <>
      <Text style={styles.cardMeta}>{metrics.scope.institutionName} · {metrics.scope.campusName}{metrics.scope.career ? ` · ${metrics.scope.career.name}` : ''}</Text>
      <Text style={styles.detail}>Usuarios activos al corte: {number(metrics.activeUsers.value)}</Text>
      <Text style={styles.detail}>Recursos: {number(metrics.resourceDemand.views)} vistas · {number(metrics.resourceDemand.requests)} solicitudes</Text>
      <Text style={styles.detail}>Asignaturas: {number(metrics.subjectDemand.views)} vistas · {number(metrics.subjectDemand.requests)} solicitudes</Text>
      {metrics.subjectDemand.subjects.map(subject => <Text key={subject.subjectId} style={styles.detail}>
        {subject.subjectName}: {number(subject.views)} vistas · {number(subject.requests)} solicitudes
      </Text>)}
      <Text style={styles.detail}>Inscripciones registradas: {number(metrics.activityParticipation.value)}</Text>
      {interval.status === 'no_activity' && <Text style={styles.note}>Sin actividad registrada: 0 vistas, solicitudes e inscripciones.</Text>}
      <Text style={styles.note}>Cobertura histórica parcial · corte exclusivo: {interval.period.cutoff}</Text>
    </>}
  </View>;
}

export function AnalyticsResults({ dashboard, report }: { dashboard: DashboardData; report?: AnalyticalReport | null }) {
  return <>
        {report && <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.cardTitle}>Reporte analítico guardado</Text>
          <Text style={styles.detail}>Identificador: {report.id}</Text>
          <Text style={styles.detail}>Institución: {report.scope.institutionName}</Text>
          <Text style={styles.detail}>Campus: {report.scope.campuses.map(row => row.name).join(', ')}</Text>
          <Text style={styles.detail}>Carrera: {report.scope.career?.name ?? 'Sin filtro de carrera'}</Text>
          <Text style={styles.detail}>Período: {report.period.from} al {report.period.to} · {report.period.timeZone}</Text>
          <Text style={styles.detail}>Agrupación: {report.grouping === 'week' ? 'Semanal (lunes a domingo)' : 'Mensual'}</Text>
          <Text style={styles.detail}>Generado el {new Intl.DateTimeFormat('es-CL', { timeZone: report.period.timeZone, dateStyle: 'long', timeStyle: 'long', hourCycle: 'h23' }).format(new Date(report.generatedAt))} · {report.period.timeZone}</Text>
          <Text style={styles.detail}>Responsable: {report.generatedBy.name}</Text>
          <Text style={styles.detail}>Versión de cálculo: {report.calculationVersion}</Text>
          <Text style={styles.note}>Esta instantánea conserva sus cifras. Para obtener resultados actualizados, genera un nuevo reporte.</Text>
        </View>}
        <Text style={styles.scope}>{dashboard.scope.institutionName} · {dashboard.scope.campusName}</Text>
        <KpiCard title="Usuarios activos al corte" metric={dashboard.activeUsers}>
          <Text style={styles.detail}>Estado al corte exclusivo {dashboard.period.cutoff}, según la auditoría de cuentas.</Text>
        </KpiCard>
        <KpiCard title="Demanda de recursos" metric={dashboard.resourceDemand}>
          <Text style={styles.detail}>{number(dashboard.resourceDemand.views)} vistas · {number(dashboard.resourceDemand.requests)} solicitudes</Text>
          <Text style={styles.note}>Total de interacciones: vistas + solicitudes.</Text>
        </KpiCard>
        <KpiCard title="Demanda de asignaturas" metric={dashboard.subjectDemand}>
          <Text style={styles.detail}>{number(dashboard.subjectDemand.views)} vistas · {number(dashboard.subjectDemand.requests)} solicitudes</Text>
          {dashboard.subjectDemand.subjects.length === 0 ? <Text style={styles.detail}>Sin interacciones de recursos con asignatura.</Text> :
            dashboard.subjectDemand.subjects.map(subject => <Text key={subject.subjectId} style={styles.detail}>
              {subject.subjectName}: {number(subject.views)} vistas · {number(subject.requests)} solicitudes
            </Text>)}
          <Text style={styles.note}>Total de interacciones por asignatura. Un recurso vinculado a varias asignaturas cuenta en cada una.</Text>
        </KpiCard>
        <KpiCard title="Participación en actividades" metric={dashboard.activityParticipation}>
          <Text style={styles.detail}>Inscripciones registradas; no representa asistencia presencial.</Text>
          {dashboard.activityParticipation.legacyEvents > 0 && <Text style={styles.note}>Este período contiene historial importado parcialmente.</Text>}
        </KpiCard>
        {Boolean(dashboard.intervals?.length) && <>
          <Text style={styles.cardTitle}>Evolución {dashboard.grouping === 'week' ? 'semanal' : 'mensual'}</Text>
          <Text style={styles.note}>Usuarios activos: saldo al corte, no se suman entre períodos. La demanda y las inscripciones corresponden a cada intervalo.</Text>
          {dashboard.intervals.map(interval => <IntervalCard key={interval.key} interval={interval} />)}
        </>}
        {dashboard.notes.map(note => <Text key={note} style={styles.note}>{note}</Text>)}
  </>;
}

const styles = StyleSheet.create({
  scope: { color: '#345267', fontWeight: '700', marginTop: 8 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, gap: 8 },
  cardTitle: { color: '#345267', fontWeight: '800', fontSize: 16 },
  value: { color: '#09243A', fontWeight: '800', fontSize: 35 },
  detail: { color: '#1C4055', fontSize: 14, lineHeight: 21 },
  note: { color: '#607485', fontSize: 12, lineHeight: 18 },
  cardMeta: { color: '#607485', fontSize: 12 },
});
