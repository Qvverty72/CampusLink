import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { Download, FileText } from 'lucide-react-native';
import { useAcquiredDigitalResources } from '../hooks/useAcquiredDigitalResources';
import { useScrollRefresh } from '@/components/RefreshScrollView';
import { ActivityAction, ActivityCard, ActivityFeedback, ActivityHeader, ActivityPager, activityUI } from '../../components/ActivityUI';
import { CATALOG_COLORS as colors } from '../../components/CatalogUI';
import { detailUI } from '../../components/ResourceDetailUI';

export function AcquiredDigitalResources({ embedded = false, initialPublicationId, entryVersion = 0, active = true, onExplore }: { active?: boolean; embedded?: boolean; initialPublicationId?: string; entryVersion?: number; onExplore?: () => void } = {}) {
  const state = useAcquiredDigitalResources(embedded), detail = state.detail;
  useEffect(() => { if (initialPublicationId) void state.show(initialPublicationId); }, [initialPublicationId, state.show, entryVersion]);
  useScrollRefresh(state.refresh, state.loading, state.open && !state.loading && !state.downloading, 'mis recursos', active);
  return <View style={activityUI.section}>
    {!embedded && <ActivityAction label={state.open ? 'Cerrar materiales adquiridos' : 'Mis materiales adquiridos'} onPress={state.toggle} disabled={Boolean(state.downloading)} />}
    {state.open && <>
      <ActivityHeader compact={embedded && !detail} title={detail ? 'Tu material adquirido' : 'Materiales adquiridos'} helper={detail ? 'Los archivos completos están disponibles mediante tu adquisición.' : 'Tus materiales siguen accesibles aunque su publicación deje de estar en búsquedas.'}
        loading={state.loading || Boolean(state.downloading)} onReload={state.refresh} />
      <ActivityFeedback loading={state.loading} error={state.error} empty={!state.selectedId && !detail && !state.items.length} onReload={state.refresh}
        emptyAction={onExplore ? "Explorar Biblioteca" : undefined} onEmptyAction={onExplore} emptyTitle="Aún no hay materiales adquiridos en esta página" emptyHelper="Cuando ambas partes completen un acuerdo digital, encontrarás aquí tus archivos autorizados." />
      {!state.loading && (!state.selectedId || detail) && (detail ? <>
        <ActivityCard title={detail.title} digital status="ADQUIRIDO" helper={`Campus de origen: ${detail.campusName}`}>
          <Text style={detailUI.body}>{detail.description}</Text>
          {detail.acquisition && <View style={detailUI.notice}><Text style={detailUI.noticeText}>Condiciones de tu adquisición: {detail.acquisition.modality === 'DONACION' ? 'Donación' : `$${detail.acquisition.amount?.toLocaleString('es-CL')} ${detail.acquisition.currency}`}{'\n'}Adquirido el {new Date(detail.acquisition.acquiredAt).toLocaleDateString('es-CL')}</Text></View>}
          {(detail.isWithdrawn || detail.status !== 'DISPONIBLE') && <Text style={detailUI.helper}>La publicación ya no está disponible en búsquedas. Tu adquisición conserva el acceso.</Text>}
          <Text style={detailUI.helper}>{[...detail.careers, ...detail.subjects].map(row => row.name).join(' · ')}</Text>
        </ActivityCard>
        {detail.files.map(file => <View key={file.id} style={detailUI.card}><View style={activityUI.inline}><FileText size={24} color={colors.primary} /><View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text style={activityUI.title}>{file.name}</Text><Text style={detailUI.helper}>{file.sizeBytes < 1024 * 1024 ? `${Math.max(1, Math.ceil(file.sizeBytes / 1024))} KB` : `${(file.sizeBytes / 1024 / 1024).toLocaleString('es-CL', { maximumFractionDigits: 2 })} MB`}</Text></View><Download size={18} color={colors.secondary} /></View>
          <ActivityAction label={state.downloading === file.id ? 'Descargando…' : 'Descargar archivo completo'} accessibilityLabel={`Descargar material adquirido ${file.name}`} disabled={Boolean(state.downloading)} onPress={() => { void state.save(file); }} primary />
        </View>)}
      </> : <View style={activityUI.list}>{state.items.map(row => <ActivityCard key={row.id} title={row.title} digital status="ADQUIRIDO" helper={`${row.campusName}${row.acquisition ? ` · ${new Date(row.acquisition.acquiredAt).toLocaleDateString('es-CL')}` : ''}`} role="Acceso autorizado" keyData={`${row.files.length} archivo${row.files.length === 1 ? '' : 's'}`}>
        {(row.isWithdrawn || row.status !== 'DISPONIBLE') && <Text style={detailUI.helper}>Acceso conservado tras la desactivación.</Text>}
        <ActivityAction label="Abrir materiales" accessibilityLabel={`Consultar material adquirido ${row.title}`} onPress={() => { void state.show(row.id); }} />
      </ActivityCard>)}</View>)}
      {(detail || state.selectedId) ? <ActivityAction label="Volver a materiales adquiridos" onPress={state.back} disabled={Boolean(state.downloading)} />
        : <ActivityPager page={state.page} hasMore={state.hasMore} disabled={state.loading} onPrevious={state.previous} onNext={state.next} />}
    </>}
  </View>;
}
