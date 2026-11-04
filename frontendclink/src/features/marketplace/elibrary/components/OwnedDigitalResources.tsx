import { useMarketplaceRefresh } from '../../hooks/useMarketplaceRefresh';
import { Text, View } from 'react-native';
import { useOwnedDigitalResources } from '../hooks/useOwnedDigitalResources';
import { DigitalPublicationEditor } from './DigitalPublicationEditor';
import { ActivityAction, ActivityCard, ActivityFeedback, ActivityHeader, ActivityPager, PublicationActivity, activityUI } from '../../components/ActivityUI';
import { detailUI } from '../../components/ResourceDetailUI';

export function OwnedDigitalResources({ embedded = false, onRequests, onPublish, active = true }: { active?: boolean; embedded?: boolean; onRequests?: () => void; onPublish?: () => void } = {}) {
  const state = useOwnedDigitalResources(embedded);
  useMarketplaceRefresh(state.reload, state.loading, state.open && !state.loading && !state.selected && !state.selectedId, 'mis publicaciones digitales', active);
  return <View style={activityUI.section}>
    {!embedded && !state.selected && <ActivityAction label={state.open ? 'Cerrar mis publicaciones digitales' : 'Mis publicaciones digitales'} onPress={state.toggle} />}
    {state.selected ? <>
      <ActivityCard title={state.selected.title} digital status={state.selected.isWithdrawn ? 'DESACTIVADA' : state.selected.status} historical={state.selected.isWithdrawn || state.selected.status !== 'DISPONIBLE'} helper={state.selected.campusName}>
        <Text style={detailUI.body}>{state.selected.description}</Text><Text style={detailUI.helper}>{state.selected.files.map(file => file.name).join(' · ') || 'Sin archivos asociados'}</Text>
      </ActivityCard>
      <DigitalPublicationEditor key={state.selected.id} resource={state.selected} onSaved={state.saved} onClose={state.close} />
    </> : state.open && <>
      <ActivityHeader compact={embedded} title="Mis publicaciones" helper="Gestiona tus recursos y sus solicitudes." loading={state.loading} onReload={state.reload} />
      <ActivityFeedback loading={state.loading} error={state.error} empty={!state.selectedId && !state.items.length} onReload={state.reload}
        emptyAction={onPublish ? "Publicar recurso" : undefined} onEmptyAction={onPublish} emptyTitle="Aún no hay publicaciones en esta página" emptyHelper="Los recursos digitales que compartas y su actividad aparecerán aquí." />
      {!state.loading && !state.selectedId && Boolean(state.items.length) && <View style={activityUI.list}>{state.items.map(row => <ActivityCard key={row.id} title={row.title} digital status={row.isWithdrawn ? 'DESACTIVADA' : row.status}
        historical={row.isWithdrawn || row.status !== 'DISPONIBLE'} helper={`${row.campusName} · ${row.files.length} archivo${row.files.length === 1 ? '' : 's'}`}
        role="Tu publicación" keyData={row.modality === 'DONACION' ? 'Donación' : `$${row.price?.toLocaleString('es-CL')}`}>
        {(row.isWithdrawn || row.status !== 'DISPONIBLE') && <Text style={detailUI.helper}>Fuera de búsquedas. Acuerdos y accesos conservados.</Text>}
        <PublicationActivity activity={row.activity} onRequests={onRequests}><ActivityAction label={row.isWithdrawn || row.status !== 'DISPONIBLE' ? 'Consultar publicación' : 'Editar publicación'} accessibilityLabel={`Consultar mi recurso ${row.title}`} onPress={() => { void state.edit(row.id); }} /></PublicationActivity>
      </ActivityCard>)}</View>}
      {state.selectedId ? <ActivityAction label="Volver a mis publicaciones" onPress={state.close} /> : <ActivityPager page={state.page} hasMore={state.hasMore} disabled={state.loading} onPrevious={state.previous} onNext={state.next} />}
    </>}
  </View>;
}
