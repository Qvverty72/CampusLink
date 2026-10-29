import { useState, type ComponentRef, type Ref } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronDown, ChevronUp, FileText, Image as ImageIcon, Info, MapPin } from 'lucide-react-native';
import type { useReportReviews } from '../hooks/useReportReviews';
import { reportContent } from '../utils/reportContent';
import { reportType } from '../utils/reportPresentation';
import { ReportEvidence } from './ReportEvidence';
import { ReportCaseHistory } from './ReportCaseHistory';
import { ReportOriginalContent } from './ReportOriginalContent';
import { ReportResolutionForm } from './ReportResolutionForm';
import { ReportPersonDetails } from './ReportPersonDetails';
import { ReportIcon, ReportSection, ReportStatusChip } from './ReportUI';
import { reportStyles as s } from './reports.styles';
import { reportDetailStyles as d } from './reportDetail.styles';
type Review = ReturnType<typeof useReportReviews>;

export function ReportCaseDetail({ review, campusName, titleRef }: { review: Review; campusName: string; titleRef: Ref<ComponentRef<typeof Text>> }) {
  const [originalOpen, setOriginalOpen] = useState(false);
  const detail = review.detail;
  if (!detail) return null;
  const final = ['RESUELTO', 'DESESTIMADO'].includes(detail.status), saved = reportContent(detail);
  const originalLabel = detail.entityType === 'ACTIVIDAD' ? 'Ver actividad como fue denunciada' : 'Ver publicación como fue denunciada';
  return <View style={d.content}>
    <View style={s.card}>
      <View style={d.summary}>
        <View style={d.thumbnail}><ReportIcon icon={detail.entityType === 'ACTIVIDAD' ? MapPin : saved.kind === 'Digital' ? FileText : ImageIcon} size={27} /></View>
        <View style={d.summaryInfo}>
          <ReportStatusChip status={detail.status} compact />
          <Text ref={titleRef} tabIndex={-1} accessibilityRole="header" style={s.heading}>{saved.title}</Text>
          {saved.price !== null && <Text style={d.price}>{saved.price}</Text>}
          <Text style={s.small}>{[campusName, ...(detail.entityType === 'TRANSACCION' ? ['Intercambio'] : []), saved.modality ?? reportType(detail.entityType), saved.condition].filter(Boolean).join(' · ')}</Text>
        </View>
      </View>
      <ReportPersonDetails label="Persona denunciada" person={detail.people?.reported} missingName="Persona no identificada en el registro" />
    </View>
    <ReportCaseHistory detail={detail} />
    <View style={d.disclosureCard}>
      <Pressable accessibilityRole="button" accessibilityLabel={originalLabel} accessibilityState={{ expanded: originalOpen }} aria-expanded={originalOpen}
        onPress={() => setOriginalOpen(value => !value)} style={d.disclosure}>
        <Text style={d.disclosureText}>{originalLabel}</Text><ReportIcon icon={originalOpen ? ChevronUp : ChevronDown} />
      </Pressable>
      {originalOpen && <ReportOriginalContent review={review} />}
    </View>
    {!final && review.canResolve && <ReportResolutionForm review={review} campusName={campusName} />}
    {!final && (detail.currentPublication || detail.currentTransaction) && <ReportSection title="Situación actual" icon={Info}>
      <Text style={s.small}>Estos datos describen la situación actual y no reemplazan el registro original.</Text>
      {detail.currentPublication && <View style={s.smallStack}><Text style={s.label}>Publicación actual</Text><ReportEvidence value={detail.currentPublication} /></View>}
      {detail.currentTransaction && <View style={s.smallStack}><Text style={s.label}>Antecedentes actuales del acuerdo</Text><ReportEvidence value={detail.currentTransaction} /></View>}
    </ReportSection>}
  </View>;
}
