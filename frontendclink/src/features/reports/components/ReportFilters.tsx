import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FilterSheet } from '@/features/marketplace/components/CatalogUI';
import { SearchableFilterSelect } from '@/features/marketplace/components/SearchableFilterSelect';
import type { ReportStatusFilter } from '../types/review';
import { ReportButton, focusReport } from './ReportUI';
import { reportStyles as s } from './reports.styles';

export const reportStatusOptions = [
  { id: '', name: 'Todas las denuncias' },
  { id: 'PENDIENTE', name: 'Pendientes' },
  { id: 'EN_REVISION', name: 'En revisión' },
  { id: 'RESUELTO', name: 'Resueltas' },
  { id: 'DESESTIMADO', name: 'Desestimadas' },
] as const;
export const reportFilterLabel = (status: ReportStatusFilter) => reportStatusOptions.find(option => option.id === status)!.name;

/** Borrador de consulta: abrir, cambiar o limpiar no envía peticiones. */
export function ReportFilters({ campuses, campusId, status, onClose, onApply }: {
  campuses: { id: string; name: string }[]; campusId: string; status: ReportStatusFilter;
  onClose: () => void; onApply: (filters: { campusId: string; status: ReportStatusFilter }) => void;
}) {
  const [draftCampus, setDraftCampus] = useState(campusId);
  const [draftStatus, setDraftStatus] = useState(status);
  const [expanded, setExpanded] = useState<'campus' | 'status' | null>(null);
  const heading = useRef<ComponentRef<typeof Text>>(null);
  useEffect(() => { const frame = requestAnimationFrame(() => focusReport(heading.current)); return () => cancelAnimationFrame(frame); }, []);
  return <FilterSheet visible onClose={onClose} title="Filtros de denuncias" confirmLabel={null} sheetStyle={v.sheet}>
    <View style={s.stack}>
      <Text ref={heading} tabIndex={-1} accessibilityRole="header" style={s.label}>¿Qué denuncias quieres ver?</Text>
      {campuses.length > 1 ? <SearchableFilterSelect label="Campus" options={campuses} value={draftCampus}
        allowEmpty={false} searchable={campuses.length > 5} onChange={setDraftCampus}
        expanded={expanded === 'campus'} onExpandedChange={open => setExpanded(open ? 'campus' : null)} />
        : <View style={s.smallStack}><Text style={s.small}>Campus</Text><Text style={s.label}>{campuses[0]?.name}</Text></View>}
      <SearchableFilterSelect label="Estado" options={reportStatusOptions} value={draftStatus}
        allowEmpty={false} searchable={false} onChange={value => setDraftStatus(value as ReportStatusFilter)}
        expanded={expanded === 'status'} onExpandedChange={open => setExpanded(open ? 'status' : null)} />
      <View style={v.actions}>
        <ReportButton secondary onPress={() => { setDraftCampus(campuses[0]?.id ?? campusId); setDraftStatus(''); setExpanded(null); }}>Limpiar</ReportButton>
        <ReportButton onPress={() => onApply({ campusId: draftCampus, status: draftStatus })}>Guardar filtros</ReportButton>
      </View>
    </View>
  </FilterSheet>;
}

const v = StyleSheet.create({ sheet: { maxWidth: 480, width: '100%', alignSelf: 'center' }, actions: { gap: 10, marginTop: 8 } });
