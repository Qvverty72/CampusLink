import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FileText, FolderOpen, Package, RefreshCw } from 'lucide-react-native';
import { CATALOG_COLORS as colors, StatusTag, ui } from './CatalogUI';
import { detailUI } from './ResourceDetailUI';
import { RequestButton, requestStatusLabel } from './RequestsUI';
import type { ResourceActivity } from '../types/resource';
export { RequestButton as ActivityAction, RequestsPager as ActivityPager } from './RequestsUI';

export function ActivityHeader({ title, helper, loading, onReload }: { title: string; helper: string; loading: boolean; onReload: () => void }) {
  return <View style={{ gap: 8 }}><View style={activityUI.inline}><Text accessibilityRole="header" style={[activityUI.heading, { flex: 1 }]}>{title}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Actualizar ${title.toLowerCase()}`} accessibilityState={{ disabled: loading }} disabled={loading} onPress={onReload} style={[ui.iconButton, loading && ui.disabled]}><RefreshCw size={19} color={colors.primary} /></Pressable>
  </View><Text style={detailUI.helper}>{helper}</Text></View>;
}

export function ActivityFeedback({ loading, error, empty, emptyTitle, emptyHelper, onReload }: {
  loading: boolean; error?: string | null; empty: boolean; emptyTitle: string; emptyHelper: string; onReload: () => void;
}) {
  return <>
    {error && <View style={detailUI.card}><Text accessibilityRole="alert" style={detailUI.error}>{error}</Text><RequestButton label="Reintentar consulta" onPress={onReload} disabled={loading} /></View>}
    {loading ? <View accessibilityRole="progressbar" accessibilityLabel="Cargando actividad" style={{ gap: 12 }}>{[0, 1, 2].map(index => <View key={index} style={detailUI.card}>
      {[90, 60, 100].map((width, part) => <View key={part} style={{ width: `${width}%`, height: part === 2 ? 44 : 18, borderRadius: 8, backgroundColor: colors.border }} />)}
    </View>)}</View> : empty && !error && <View style={activityUI.empty}><FolderOpen size={30} color={colors.secondary} /><Text style={ui.sectionTitle}>{emptyTitle}</Text>
      <Text style={[detailUI.helper, { textAlign: 'center' }]}>{emptyHelper}</Text><RequestButton label="Actualizar lista" onPress={onReload} />
    </View>}
  </>;
}

export function ActivityCard({ title, status, historical = false, digital = false, helper, children }: {
  title: string; status: string; historical?: boolean; digital?: boolean; helper?: string; children: ReactNode;
}) {
  const Icon = digital ? FileText : Package;
  return <View style={[detailUI.card, historical && activityUI.historical]}>
    <View style={activityUI.inline}><View style={[activityUI.icon, historical && { backgroundColor: colors.border }]}><Icon size={24} color={colors.secondary} /></View>
      <View style={{ flex: 1, minWidth: 0, gap: 5 }}><Text accessibilityRole="header" style={activityUI.title}>{title}</Text>{helper && <Text style={detailUI.helper}>{helper}</Text>}</View>
    </View><View style={activityUI.inline}><StatusTag neutral={historical}>{requestStatusLabel(status)}</StatusTag>{historical && <Text style={detailUI.helper}>Historial conservado</Text>}</View>
    {children}
  </View>;
}

export function PublicationActivity({ activity, onRequests }: { activity?: ResourceActivity; onRequests?: () => void }) {
  return <View style={{ gap: 10 }}>
    {activity && <View style={activityUI.metrics}><Text style={[detailUI.body, activity.pendingRequests > 0 && { fontWeight: '700', color: colors.primary }]}>{activity.pendingRequests
      ? `${activity.pendingRequests} solicitud${activity.pendingRequests === 1 ? '' : 'es'} pendiente${activity.pendingRequests === 1 ? '' : 's'}` : 'Sin solicitudes pendientes'}</Text>
      {typeof activity.completedAgreements === 'number' && <Text style={detailUI.helper}>{activity.completedAgreements} acuerdo{activity.completedAgreements === 1 ? '' : 's'} completado{activity.completedAgreements === 1 ? '' : 's'}</Text>}
    </View>}
    {onRequests && <RequestButton label="Revisar solicitudes" onPress={onRequests} primary={Boolean(activity?.pendingRequests)} />}
  </View>;
}

export const activityUI = StyleSheet.create({
  section: { gap: 16 }, heading: { color: colors.ink, fontSize: 22, lineHeight: 28, fontWeight: '800' },
  inline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }, title: { color: colors.ink, fontSize: 16, lineHeight: 23, fontWeight: '700' },
  icon: { width: 48, height: 56, borderRadius: 12, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  historical: { backgroundColor: '#F8FAFC', borderStyle: 'dashed' }, metrics: { backgroundColor: colors.tint, borderRadius: 12, padding: 12, gap: 5 },
  empty: { alignItems: 'center', borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border, padding: 24, gap: 12 },
});
