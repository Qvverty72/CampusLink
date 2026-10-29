import { Text, View } from 'react-native';
import { Check, Clock3, Flag, LockKeyhole } from 'lucide-react-native';
import type { ReportDetail } from '../utils/reportContent';
import { reportDate, reportReason } from '../utils/reportPresentation';
import { ReportIcon } from './ReportUI';
import { ReportResolutionSummary } from './ReportResolutionSummary';
import { ReportPersonDetails } from './ReportPersonDetails';
import { reportStyles as s } from './reports.styles';
import { reportDetailStyles as d } from './reportDetail.styles';

export function ReportCaseHistory({ detail }: { detail: ReportDetail }) {
  const final = ['RESUELTO', 'DESESTIMADO'].includes(detail.status);
  const hasDecision = final || !!detail.resolution;
  return <View style={s.card}>
    <Text accessibilityRole="header" style={s.sectionTitle}>Historial del caso</Text>
    <Text style={s.small}>Los nombres y correos mostrados corresponden a los perfiles actuales.</Text>
    <View style={d.timeline}>
      <View style={d.event}>
        <View style={d.rail}><View style={d.dot}><ReportIcon icon={Flag} size={14} /></View>{hasDecision && <View style={d.line} />}</View>
        <View style={[d.eventBody, !hasDecision && d.lastEvent]}>
          <Text style={d.timestamp}>{reportDate(detail.reportedAt)}</Text>
          <Text accessibilityRole="header" style={d.eventTitle}>Denuncia enviada</Text>
          <ReportPersonDetails label="Denunciante" person={detail.people?.reporter ?? (final ? null : detail.reporter)} />
          <Text selectable style={d.historyText}><Text style={d.strong}>Motivo: </Text>{reportReason(detail.reason)}</Text>
          <Text selectable style={d.historyText}><Text style={d.strong}>Comentario: </Text>{detail.description ?? 'No se agregó un comentario.'}</Text>
        </View>
      </View>
      {hasDecision && <View style={d.event}>
        <View style={d.rail}><View style={[d.dot, final ? d.doneDot : d.progressDot]}><ReportIcon icon={final ? Check : Clock3} size={16} color="#FFFFFF" /></View></View>
        <View style={[d.eventBody, d.lastEvent]}>
          <Text style={d.timestamp}>{reportDate(detail.resolution?.resolvedAt)}</Text>
          <ReportResolutionSummary detail={detail} />
        </View>
      </View>}
    </View>
    {final && <View style={d.footer}><ReportIcon icon={LockKeyhole} size={14} /><Text style={[s.small, s.grow]}>Resolución definitiva, no se puede editar.</Text></View>}
  </View>;
}
