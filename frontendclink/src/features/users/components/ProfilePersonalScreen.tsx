import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { CalendarCheck, ChevronRight, MapPin, RefreshCw, X } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { APP_COLORS } from '@/types/colors';
import { ActivityDetail } from '@/features/activities/components/ActivityDetail';
import { RefreshScrollView } from '@/components/RefreshScrollView';
import { PhysicalgoodsHistory, PhysicalgoodsHistoryDetail } from '@/features/marketplace/physicalgoods/components/PhysicalgoodsHistory';
import { PhysicalgoodsRequests } from '@/features/marketplace/physicalgoods/components/PhysicalgoodsRequests';
import { PhysicalgoodsTransaction } from '@/features/marketplace/physicalgoods/components/PhysicalgoodsTransaction';
import type { PhysicalgoodsHistoryTarget } from '@/features/marketplace/physicalgoods/hooks/usePhysicalgoodsHistory';
import type { PhysicalgoodsTransactionTarget } from '@/features/marketplace/physicalgoods/types/publication';
import { AcquiredDigitalResources } from '@/features/marketplace/elibrary/components/AcquiredDigitalResources';
import { PERSONAL_TITLES, type PersonalSection } from './ProfilePersonalCards';
import { useOwnActivities } from '../hooks/useOwnActivities';

export function ProfilePersonalScreen() {
  const { identity } = useAuth();
  const { section } = useLocalSearchParams<{ section?: string | string[] }>();
  const validSection = typeof section === 'string' && Object.hasOwn(PERSONAL_TITLES, section) ? section as PersonalSection : null;
  return <PersonalContent key={`${identity?.userId}:${identity?.campusId}:${validSection}`} section={validSection}
    campusId={identity?.campusId ?? ''} allowed={Boolean(identity?.capabilities.general)} />;
}

/** El modal coordina consultas propias; no importa estado ni navegación del mapa. */
function PersonalContent({ section, campusId, allowed }: { section: PersonalSection | null; campusId: string; allowed: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [received, setReceived] = useState(false);
  const [revision, setRevision] = useState(0);
  const [history, setHistory] = useState<PhysicalgoodsHistoryTarget | null>(null);
  const [agreement, setAgreement] = useState<PhysicalgoodsTransactionTarget | null>(null);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [headerVisible, setHeaderVisible] = useState(true);
  const close = () => { if (router.canGoBack()) router.back(); else router.replace('/profile'); };
  const refresh = () => setRevision(value => value + 1);
  const showAgreement = (publicationId: string, transactionId: string) => {
    setHistory(null); setAgreement({ publicationId, transactionId });
  };
  return <View style={[styles.overlay, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12) }]}>
    <View style={styles.panel} accessibilityViewIsModal>
      {headerVisible && <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>{section ? PERSONAL_TITLES[section] : 'Mi perfil'}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar consulta personal" onPress={close} activeOpacity={0.65} style={styles.iconButton}>
          <X size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>}
      <RefreshScrollView key={activityId ?? 'list'} onClose={close} onHeaderVisibilityChange={setHeaderVisible}
        contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!allowed || !section ? <Text style={styles.text}>Esta consulta no está disponible para tu cuenta.</Text> : activityId ? (
          <ActivityDetail activityId={activityId} onBack={() => { setActivityId(null); refresh(); }} />
        ) : <>
          {(section === 'publications' || section === 'transactions') && <PhysicalgoodsHistory active transactions={section === 'transactions'}
            refreshVersion={revision} onDetail={setHistory} onAgreement={showAgreement} />}
          {section === 'requests' && <>
            <View style={styles.tabs}>
              {([false, true] as const).map(value => <TouchableOpacity key={String(value)} accessibilityRole="tab" accessibilityState={{ selected: received === value }}
                activeOpacity={0.7} style={[styles.tab, received === value && styles.selectedTab]} onPress={() => setReceived(value)}>
                <Text style={[styles.tabText, received === value && styles.selectedTabText]}>{value ? 'Recibidas' : 'Enviadas'}</Text>
              </TouchableOpacity>)}
            </View>
            <PhysicalgoodsRequests key={String(received)} active received={received} refreshVersion={revision} onResolved={refresh}
              onDetail={(publicationId, requestId) => setHistory({ publicationId, requestId })} onAgreement={showAgreement} />
          </>}
          {section === 'resources' && <AcquiredDigitalResources embedded />}
          {section === 'activities' && <OwnActivities key={revision} campusId={campusId} onSelect={setActivityId} />}
        </>}
      </RefreshScrollView>
    </View>
    {allowed && history && !agreement && <PhysicalgoodsHistoryDetail target={history} onClose={() => setHistory(null)} onAgreement={showAgreement} />}
    {allowed && agreement && <PhysicalgoodsTransaction target={agreement} onClose={() => { setAgreement(null); refresh(); }} onChanged={refresh} />}
  </View>;
}

function OwnActivities({ campusId, onSelect }: { campusId: string; onSelect: (id: string) => void }) {
  const { result, page, loading, error, reload, setPage } = useOwnActivities(campusId);
  return <View style={styles.list}>
    <Text style={styles.text}>Tus inscripciones en actividades próximas o en curso de tu campus.</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Actualizar mis actividades" activeOpacity={0.65} style={styles.refresh} onPress={reload} disabled={loading}>
      <RefreshCw size={16} color={APP_COLORS.PRIMARY} /><Text style={styles.action}>Actualizar</Text>
    </TouchableOpacity>
    {loading && <ActivityIndicator accessibilityLabel="Cargando mis actividades" color={APP_COLORS.PRIMARY} />}
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {result && !result.items.length && <View style={styles.empty}>
      <CalendarCheck size={32} color={APP_COLORS.SECONDARY} />
      <Text style={styles.itemTitle}>Sin inscripciones vigentes</Text>
      <Text style={styles.text}>Aquí aparecerán las actividades en las que estés inscrito.</Text>
    </View>}
    {result?.items.map(item => <TouchableOpacity key={item.id} accessibilityRole="button" accessibilityLabel={`Ver actividad ${item.title}`}
      activeOpacity={0.7} style={styles.activity} onPress={() => onSelect(item.id)}>
      <View style={styles.activityContent}>
        <Text style={styles.kind}>{item.type === 'OFFICIAL_EVENT' ? 'EVENTO OFICIAL' : 'ACTIVIDAD COMUNITARIA'}</Text>
        <Text style={styles.itemTitle}>{item.title}</Text>
        <Text style={styles.text}>{new Date(item.startAt).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}</Text>
        <View style={styles.location}><MapPin size={14} color={APP_COLORS.SECONDARY} /><Text style={styles.locationText}>
          {[item.location.buildingName, item.location.floorName, item.location.poiName].filter(Boolean).join(' · ')}
        </Text></View>
        <Text style={styles.enrolled}>Inscrito</Text>
      </View>
      <ChevronRight size={18} color={APP_COLORS.SECONDARY} />
    </TouchableOpacity>)}
    {result && <View style={styles.pagination}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Actividades anteriores" disabled={loading || page === 1} activeOpacity={0.65}
        style={[styles.pageButton, (loading || page === 1) && styles.disabled]} onPress={() => setPage(page - 1)}><Text style={styles.action}>Anterior</Text></TouchableOpacity>
      <Text style={styles.text}>Página {page}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Actividades siguientes" disabled={loading || !result.hasMore} activeOpacity={0.65}
        style={[styles.pageButton, (loading || !result.hasMore) && styles.disabled]} onPress={() => setPage(page + 1)}><Text style={styles.action}>Siguiente</Text></TouchableOpacity>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#00000080', justifyContent: 'center', paddingHorizontal: 12 },
  panel: { width: '100%', maxWidth: 760, maxHeight: '94%', flex: 1, alignSelf: 'center', backgroundColor: '#F4F7FA', borderRadius: 22, overflow: 'hidden' },
  header: { backgroundColor: APP_COLORS.PRIMARY, flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 10, minHeight: 64, gap: 8 },
  title: { flex: 1, fontSize: 18, fontWeight: '600', color: '#FFFFFF' }, iconButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, paddingBottom: 32 }, text: { color: '#617484', fontSize: 14, lineHeight: 21 },
  tabs: { flexDirection: 'row', gap: 8 }, tab: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: '#E3EAF0', alignItems: 'center', justifyContent: 'center' },
  selectedTab: { backgroundColor: APP_COLORS.PRIMARY }, tabText: { fontSize: 14, fontWeight: '600', color: APP_COLORS.PRIMARY }, selectedTabText: { color: '#FFFFFF' },
  list: { gap: 14 }, refresh: { minHeight: 44, flexDirection: 'row', gap: 8, alignItems: 'center', alignSelf: 'flex-start' }, action: { color: APP_COLORS.PRIMARY, fontSize: 14, fontWeight: '600' },
  error: { color: '#AD3029', fontSize: 14, lineHeight: 21 }, empty: { alignItems: 'center', paddingVertical: 30, gap: 12 },
  activity: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, backgroundColor: '#FFFFFF', gap: 10, borderWidth: 1, borderColor: '#E3EAF0' },
  activityContent: { flex: 1, gap: 8 }, itemTitle: { color: APP_COLORS.PRIMARY, fontSize: 17, fontWeight: '600', lineHeight: 23 },
  kind: { color: APP_COLORS.SECONDARY, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }, location: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  locationText: { color: '#617484', fontSize: 12, lineHeight: 18, flexShrink: 1 }, enrolled: { color: APP_COLORS.PRIMARY, fontSize: 12, fontWeight: '600' },
  pagination: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  pageButton: { paddingHorizontal: 10, minHeight: 44, justifyContent: 'center' }, disabled: { opacity: 0.4 },
});
