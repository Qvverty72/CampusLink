import { Text, View } from 'react-native';
import type { ReportReviewDetail, ReportResolutionDetail } from '../types/review';
import { ReportPersonDetails } from './ReportPersonDetails';
import { reportStyles as s } from './reports.styles';
import { reportDetailStyles as d } from './reportDetail.styles';

export function ReportResolutionSummary({ detail }: { detail: ReportReviewDetail | ReportResolutionDetail }) {
  const final = detail.status === 'RESUELTO' || detail.status === 'DESESTIMADO', resolution = detail.resolution;
  if (!final && !resolution) return null;
  return <View style={s.smallStack}>
    <Text accessibilityRole="header" style={d.eventTitle}>{final ? 'Resolución registrada' : 'Decisión registrada'}</Text>
    {!final && <Text style={d.historyText}>Falta completar el cierre del caso. Se conservan la decisión y sus antecedentes originales.</Text>}
    <View style={d.measure}><Text style={s.label}>{resolution?.measure === 'OCULTAR' ? final ? 'Contenido ocultado' : 'Ocultar el contenido' : resolution?.measure === 'NINGUNA' ? 'Ninguna medida sobre el contenido' : resolution?.measure ?? 'Sin medida registrada'}</Text></View>
    <Text selectable style={d.historyText}><Text style={d.strong}>Justificación: </Text>{resolution?.justification ?? 'Sin justificación registrada'}</Text>
    <ReportPersonDetails label="Responsable registrado" person={detail.people?.decisionMaker}
      missingName={resolution?.resolvedById ? 'Nombre no disponible' : 'Sin responsable registrado'} />
  </View>;
}
