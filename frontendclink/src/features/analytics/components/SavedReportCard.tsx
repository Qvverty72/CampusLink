import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Save } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { HistoricalReportSummary } from '../types/dashboard';
import { periodLabel, savedReportLabel, savedReportListTimeLabel, shortGroupingLabel, savedTimestampLabel } from '../utils/presentation';
import type { AnalyticsFocusTarget } from './AnalyticsUI';
import { colors as c, styles as s } from './analytics.styles';

export function SavedReportCard({ report, position, selected, onOpen, onCompare, register }: {
  report: HistoricalReportSummary; position: number; selected: boolean; onOpen: () => void; onCompare: () => void;
  register: (key: string, target: AnalyticsFocusTarget | null) => void;
}) {
  const [campusesExpanded, setCampusesExpanded] = useState(false);
  const { width, fontScale = 1 } = useWindowDimensions();
  const stackedFooter = fontScale > 1.4 || (width < 480 && (report.generatedBy.email?.length ?? 0) > 24);
  const campuses = report.scope.campuses;
  const title = savedReportLabel(report, position);
  const initials = report.generatedBy.name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase('es') || '?';
  return <View style={[k.card, selected && k.selected]} testID={`saved-report-${report.id}`}>
    <View style={k.top}>
      <View style={k.badges}><View style={k.badge}><Text style={k.badgeText}>{shortGroupingLabel(report.grouping)}</Text></View>
        {selected && <View style={k.badges}><Check size={13} color={c.PRIMARY} aria-hidden /><Text style={k.selectedText}>A elegido</Text></View>}
      </View>
      <View accessible accessibilityLabel={`Guardado el ${savedTimestampLabel(report.generatedAt, report.period.timeZone)}, ${report.period.timeZone}`} style={k.saved}>
        <Save size={12} color={c.muted} aria-hidden /><Text style={k.date}>{savedReportListTimeLabel(report.generatedAt, report.period.timeZone)}</Text>
      </View>
    </View>
    <View style={{ gap: 3 }}>
      <Text accessibilityRole="header" accessibilityLabel={`Período analizado: ${periodLabel(report.period)}`} style={k.period}>{periodLabel(report.period)}</Text>
      <Text style={k.scope}>{report.scope.institutionName} · {(campusesExpanded ? campuses : campuses.slice(0, 2)).map(row => row.name).join(', ')}</Text>
      {campuses.length > 2 && <Pressable accessibilityRole="button" accessibilityState={{ expanded: campusesExpanded }}
        accessibilityLabel={campusesExpanded ? 'Ocultar campus adicionales' : `Ver los ${campuses.length} campus del reporte`}
        onPress={() => setCampusesExpanded(value => !value)} style={s.back}>
        <Text style={s.link}>{campusesExpanded ? 'Mostrar menos campus' : `+${campuses.length - 2} más`}</Text>
        {campusesExpanded ? <ChevronUp size={16} color={c.PRIMARY} /> : <ChevronDown size={16} color={c.PRIMARY} />}
      </Pressable>}
      <Text style={k.career}>{report.scope.career?.name ?? 'Todas las carreras · incluye sin clasificar'}</Text>
    </View>
    <View style={s.divider} />
    <View style={[k.footer, stackedFooter && k.footerLarge]}>
      <View style={[k.author, stackedFooter && { flexBasis: 'auto', flexGrow: 0 }]}>
        <View accessible={false} aria-hidden style={k.avatar}><Text style={k.initials}>{initials}</Text></View>
        <View style={s.grow}><Text selectable style={k.name}>{report.generatedBy.name}</Text><Text selectable style={k.email}>{report.generatedBy.email || 'Correo no registrado'}</Text></View>
      </View>
      <View style={[k.actions, stackedFooter && { alignSelf: 'flex-end' }]}>
        <Pressable ref={target => register(report.id, target)} accessibilityRole="button" accessibilityLabel={`Abrir ${title}`} onPress={onOpen} style={k.button}>
          <Text style={k.buttonText}>Abrir</Text>
        </Pressable>
        <Pressable ref={target => register(`${report.id}:compare`, target)} accessibilityRole="button" accessibilityLabel={`Comparar con ${title}`} onPress={onCompare} style={[k.button, k.primary]}>
          <Text style={[k.buttonText, { color: '#FFFFFF' }]}>{selected ? 'A elegido' : 'Comparar'}</Text>
        </Pressable>
      </View>
    </View>
  </View>;
}

const k = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: c.border, borderRadius: 15, padding: 12, gap: 8 },
  selected: { borderColor: c.PRIMARY },
  top: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 7 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  badge: { backgroundColor: c.tint, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText: { color: c.PRIMARY, fontSize: 10, lineHeight: 15, fontWeight: '600' },
  selectedText: { color: c.PRIMARY, fontSize: 10, lineHeight: 15, fontWeight: '600' },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  date: { color: c.muted, fontSize: 10, lineHeight: 16, flexShrink: 1 },
  period: { color: c.PRIMARY, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  scope: { color: c.PRIMARY, fontSize: 12, lineHeight: 18 },
  career: { color: c.muted, fontSize: 11, lineHeight: 17 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  footerLarge: { flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'stretch' },
  author: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, flexGrow: 1, flexShrink: 1, flexBasis: 110, minWidth: 0, maxWidth: '100%' },
  avatar: { minWidth: 28, minHeight: 28, padding: 4, borderRadius: 99, alignItems: 'center', justifyContent: 'center', backgroundColor: c.PRIMARY, flexShrink: 0 },
  initials: { color: '#FFFFFF', fontSize: 10, lineHeight: 16, fontWeight: '700' },
  name: { color: c.PRIMARY, fontSize: 11, lineHeight: 17 },
  email: { color: c.muted, fontSize: 11, lineHeight: 17 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  button: { minHeight: 44, minWidth: 44, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: c.border, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' },
  primary: { backgroundColor: c.PRIMARY, borderColor: c.PRIMARY },
  buttonText: { color: c.PRIMARY, fontSize: 12, lineHeight: 18, fontWeight: '600', flexShrink: 1 },
});
