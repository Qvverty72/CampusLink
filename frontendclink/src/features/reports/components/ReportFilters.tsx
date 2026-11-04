import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FilterSheet } from '@/features/marketplace/components/CatalogUI';
import { SearchableFilterSelect } from '@/features/marketplace/components/SearchableFilterSelect';
import type { ReportEntityTypeFilter, ReportFiltersInput, ReportStatusFilter } from '../types/review';
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
export const reportEntityTypeOptions = [
  { id: '', name: 'Todos los tipos' },
  { id: 'ACTIVIDAD', name: 'Actividad' },
  { id: 'PUBLICACION_FISICA', name: 'Publicación física' },
  { id: 'PUBLICACION_DIGITAL', name: 'Publicación digital' },
  { id: 'TRANSACCION', name: 'Transacción' },
] as const;
export const reportEntityTypeLabel = (type: ReportEntityTypeFilter) => reportEntityTypeOptions.find(option => option.id === type)!.name;

/** Borrador de consulta: abrir, cambiar o limpiar no envía peticiones. */
export function ReportFilters({ campuses, campusId, status, entityType, onClose, onApply }: ReportFiltersInput & {
  campuses: { id: string; name: string }[];
  onClose: () => void; onApply: (filters: ReportFiltersInput) => void;
}) {
  const [draftCampus, setDraftCampus] = useState(campusId);
  const [draftStatus, setDraftStatus] = useState(status);
  const [draftType, setDraftType] = useState(entityType);
  const [expanded, setExpanded] = useState<'campus' | 'status' | 'entityType' | null>(null);
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
      <SearchableFilterSelect label="Tipo de contenido" options={reportEntityTypeOptions} value={draftType}
        allowEmpty={false} searchable={false} onChange={value => setDraftType(value as ReportEntityTypeFilter)}
        expanded={expanded === 'entityType'} onExpandedChange={open => setExpanded(open ? 'entityType' : null)} />
      <View style={v.actions}>
        <ReportButton secondary onPress={() => { setDraftCampus(campuses[0]?.id ?? campusId); setDraftStatus(''); setDraftType(''); setExpanded(null); }}>Limpiar</ReportButton>
        <ReportButton onPress={() => onApply({ campusId: draftCampus, status: draftStatus, entityType: draftType })}>Guardar filtros</ReportButton>
      </View>
    </View>
  </FilterSheet>;
}

const v = StyleSheet.create({ sheet: { maxWidth: 480, width: '100%', alignSelf: 'center' }, actions: { gap: 10, marginTop: 8 } });
