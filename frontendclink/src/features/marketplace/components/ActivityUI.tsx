import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CATALOG_COLORS as colors } from './CatalogUI';
import { detailUI } from './ResourceDetailUI';
import { RequestButton } from './RequestsUI';
import { PersonalAction, PersonalEmpty, PersonalRow, PersonalSkeleton, personalUI } from './PersonalUI';
import type { ResourceActivity } from '../types/resource';
export { RequestsPager as ActivityPager } from './RequestsUI';

export function ActivityAction(props: Parameters<typeof RequestButton>[0]) {
  return props.primary ? <RequestButton {...props} /> : <PersonalAction {...props} />;
}

export function ActivityHeader({ title, helper, compact = false }: { title: string; helper: string; loading: boolean; onReload: () => void; compact?: boolean }) {
  return <View style={activityUI.inline}>
    <View style={{ flex: 1, gap: 4 }}>{!compact && <Text accessibilityRole="header" style={activityUI.heading}>{title}</Text>}<Text style={detailUI.helper}>{helper}</Text></View>
  </View>;
}

export function ActivityFeedback({ loading, error, empty, emptyTitle, emptyHelper, onReload, emptyAction, onEmptyAction }: {
  loading: boolean; error?: string | null; empty: boolean; emptyTitle: string; emptyHelper: string; onReload: () => void; emptyAction?: string; onEmptyAction?: () => void;
}) {
  return <>
    {error && <View style={detailUI.card}><Text accessibilityRole="alert" style={detailUI.error}>{error}</Text><RequestButton label="Reintentar consulta" onPress={onReload} disabled={loading} /></View>}
    {loading ? <PersonalSkeleton /> : empty && !error && <PersonalEmpty title={emptyTitle} helper={emptyHelper} action={emptyAction ?? 'Actualizar lista'} onAction={onEmptyAction ?? onReload} />}
  </>;
}

export function ActivityCard({ title, status, historical = false, digital = false, helper, keyData, role, children }: {
  title: string; status: string; historical?: boolean; digital?: boolean; helper?: string; keyData?: string; role?: string; children: ReactNode;
}) {
  return <PersonalRow title={title} digital={digital} helper={helper} keyData={keyData} status={status} role={role ?? (historical ? 'Historial conservado' : undefined)}>{children}</PersonalRow>;
}

export function PublicationActivity({ activity, onRequests, children }: { activity?: ResourceActivity; onRequests?: () => void; children?: ReactNode }) {
  return <View style={{ gap: 2 }}>
    {activity && <View style={activityUI.metrics}><Text style={[detailUI.helper, activity.pendingRequests > 0 && { fontWeight: '700', color: colors.primary }]}>{activity.pendingRequests
      ? `${activity.pendingRequests} solicitud${activity.pendingRequests === 1 ? '' : 'es'} pendiente${activity.pendingRequests === 1 ? '' : 's'}` : 'Sin solicitudes pendientes'}</Text>
      {typeof activity.completedAgreements === 'number' && <Text style={detailUI.helper}>{activity.completedAgreements} acuerdo{activity.completedAgreements === 1 ? '' : 's'} completado{activity.completedAgreements === 1 ? '' : 's'}</Text>}
    </View>}
    <View style={activityUI.inline}>{onRequests && <PersonalAction label="Revisar solicitudes" onPress={onRequests} />}{children}</View>
  </View>;
}

export const activityUI = StyleSheet.create({
  list: personalUI.list, section: { gap: 14 }, heading: { color: colors.ink, fontSize: 18, lineHeight: 25, fontWeight: '700' },
  inline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }, title: { color: colors.ink, fontSize: 16, lineHeight: 23, fontWeight: '700' },
  metrics: { gap: 3 },
});
