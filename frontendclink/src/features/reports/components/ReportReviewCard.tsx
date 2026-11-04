import { forwardRef } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Box, ChevronRight, FileText, Handshake, MapPin } from 'lucide-react-native';
import { reviewLabels, type ReportReviewSummary } from '../types/review';
import { reportCardDate, reportDate, reportReason, reportTitle, reportType } from '../utils/reportPresentation';
import { ReportIcon, ReportStatusChip, type ReportFocusTarget } from './ReportUI';
import { reportStyles as s } from './reports.styles';
export const ReportReviewCard = forwardRef<ReportFocusTarget, { entry: ReportReviewSummary; onOpen: () => void }>(function ReportReviewCard({ entry, onOpen }, ref) {
  const title = reportTitle(entry.title), reason = reportReason(entry.reason);
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;
  const final = ['RESUELTO', 'DESESTIMADO'].includes(entry.status);
  const action = final ? 'Ver resolución' : 'Revisar denuncia';
  const icon = entry.entityType === 'ACTIVIDAD' ? MapPin : entry.entityType === 'TRANSACCION' ? Handshake : entry.entityType === 'PUBLICACION_DIGITAL' ? FileText : Box;
  const measure = entry.resolution?.measure === 'OCULTAR' ? 'ocultar contenido' : entry.resolution?.measure === 'NINGUNA' ? 'ninguna medida sobre el contenido' : entry.resolution?.measure ?? 'Medida no registrada';
  const recordedDecision = final ? `, Decisión: ${reportDate(entry.resolution?.resolvedAt)}, medida: ${measure}, responsable registrado: ${entry.resolution?.resolvedById ?? 'Responsable no registrado'}` : '';
  return <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={`${action}: ${title}, tipo ${reportType(entry.entityType)}, motivo ${reason}, estado ${reviewLabels[entry.status] ?? entry.status}, denunciada el ${reportDate(entry.reportedAt)}${recordedDecision}, referencia ${entry.id.slice(-6)}`}
    accessibilityHint="Abre el motivo, los antecedentes y la decisión del caso." onPress={onOpen} style={s.listCard} android_ripple={{ color: '#EAF1F7' }}>
    <View style={s.caseIcon}><ReportIcon icon={icon} size={20} color="#225D94" /></View>
    <View style={s.caseContent}>
      <View style={[s.caseHeading, largeText && s.caseHeadingStacked]}>
        <Text style={[s.cardTitle, largeText && { flex: 0, width: '100%' }]} numberOfLines={largeText ? undefined : 1}>{title}</Text>
        <ReportStatusChip status={entry.status} compact />
      </View>
      <Text style={s.caseReason} numberOfLines={largeText ? undefined : 2}>{reason}</Text>
      <Text style={s.caseMeta}>{reportType(entry.entityType)} · {reportCardDate(entry)}</Text>
    </View>
    <View style={s.caseChevron}><ReportIcon icon={ChevronRight} size={15} color="#7B94AB" /></View>
  </Pressable>;
});
