import { safeAreaInset } from '@/lib/layout/safeArea';
import type { ScrollViewInstance } from 'react-native';
import { RefreshScrollView } from '@/components/RefreshScrollView';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useEffect, useRef,useState } from 'react';
import { BottomNavigationBar } from '@/components/navigation/BottomNavigationBar';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { APP_COLORS } from '@/types/colors';
import { useDigitalLibrary } from '../hooks/useDigitalLibrary';
import { DigitalPublicationForm } from './DigitalPublicationForm';
import { DigitalSearchForm, emptyDigitalFilters } from './DigitalSearchForm';
import { DigitalPersonalLibrary } from './DigitalPersonalLibrary';
import { DigitalResourceDetail } from './DigitalResourceDetail';
import { DigitalRecommendations } from './DigitalRecommendations';
import { CatalogPagination, CatalogSkeleton, EmptyState, PublishFAB, ScreenHeader, ui } from '../../components/CatalogUI';
import { ResourceRow } from './ResourceRow';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function DigitalLibraryScreen() {
  const auth = useAuth();
  return <Library key={`${auth.identity?.userId}:${auth.identity?.campusId}`} />;
}
function Library() {
  const insets = useSafeAreaInsets();
  const library = useDigitalLibrary();
  const [personal, setPersonal] = useState(false);
  const [personalTitle,setPersonalTitle]=useState('Materiales adquiridos');
  const [personalEntry, setPersonalEntry] = useState<{ tab: 'acquired' | 'trades'; resourceId?: string }>({ tab: 'acquired' });
  const scroll = useRef<ScrollViewInstance>(null);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [library.formOpen, library.detail?.id, library.editingAcademics, personal]);
  useEffect(() => {
    if (!library.error && !library.notice) return;
    if (library.formOpen) scroll.current?.scrollToEnd({ animated: true });
    else scroll.current?.scrollTo({ y: 0, animated: false });
  }, [library.error, library.notice]);
  if (!personal && !library.formOpen && (library.detail || library.selectedId)) return <DigitalResourceDetail key={library.detail?.id ?? library.selectedId} library={library}
    onAcquired={id => { setPersonalEntry({ tab: 'acquired', resourceId: id }); setPersonal(true); library.closeDetail(); }}
    onRequests={() => { setPersonalEntry({ tab: 'trades' }); setPersonal(true); library.closeDetail(); }} />;
  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <RefreshScrollView ref={scroll} refreshIndicatorOffset={insets.top + 8} onRefresh={!personal && !library.formOpen ? library.refresh : undefined} refreshing={library.loading} refreshEnabled={!personal && !library.formOpen && !library.busy && !library.loading} refreshLabel="los recursos de Biblioteca" keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: safeAreaInset('top', insets.top, { min: 24, offset: 16 }) }]}>
      <ScreenHeader title={personal ? personalTitle : library.formOpen ? 'Publicar recurso digital' : 'Biblioteca'}
        subtitle={personal ? 'Tus materiales, publicaciones y transacciones' : library.formOpen ? 'Comparte material con tu comunidad académica' : 'Apuntes y guías de todos los campus'}
        action={!personal && !library.formOpen && !library.detail ? 'Mi biblioteca' : undefined} onAction={() => { setPersonalEntry({ tab: 'acquired' }); setPersonal(true); }}
        onBack={personal ? () => { setPersonal(false); library.reload(); } : library.formOpen ? library.closeForm : library.detail ? library.closeDetail : undefined} />
      {!library.formOpen && library.error && <View style={styles.errorBox} accessibilityLiveRegion="assertive"><Text accessibilityRole="alert" style={styles.error}>{library.error}</Text>
        {!library.busy && <Pressable accessibilityRole="button" onPress={library.reload} style={styles.smallButton}><Text style={styles.link}>Reintentar</Text></Pressable>}
      </View>}
      {!library.formOpen && library.notice && <Text style={styles.notice} accessibilityLiveRegion="polite">{library.notice}</Text>}
      {personal ? <DigitalPersonalLibrary key={`${personalEntry.tab}:${personalEntry.resourceId ?? ''}`} initialTab={personalEntry.tab} initialPublicationId={personalEntry.resourceId} onTitleChange={setPersonalTitle} onOpenResource={id=>{setPersonal(false);void library.openDetail(id);}} onExplore={() => setPersonal(false)} onPublish={() => { setPersonal(false); library.openForm(); }} /> : library.formOpen ? <DigitalPublicationForm library={library} /> : <>
        <DigitalSearchForm catalog={library.catalog} filters={library.filters} onSearch={library.search} catalogLoading={library.catalogLoading} catalogError={library.catalogError} reloadCatalog={library.reloadCatalog} />
        <DigitalRecommendations key={library.refreshVersion} onOpen={library.openDetail} />
        <Text accessibilityRole="header" style={ui.sectionTitle}>Todos los recursos</Text>
        {library.loading ? <CatalogSkeleton /> : library.error ? null : library.items.length ? <View style={{ gap: 10 }}>{library.items.map(item =>
          <ResourceRow key={item.id} resource={item} onOpen={() => library.openDetail(item.id)} />)}</View>
          : <EmptyState filtered={Object.values(library.filters).some(Boolean)} onClear={() => library.search(emptyDigitalFilters)} onPublish={library.openForm} />}
        <CatalogPagination page={library.page} hasMore={library.hasMore} loading={library.loading} previous={library.previousPage} next={library.nextPage} />
      </>}
    </RefreshScrollView>
    {!personal && !library.formOpen && !library.detail && <PublishFAB onPress={library.openForm} />}
    <BottomNavigationBar activeItemId="elibrary" />
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F4F7F9' },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 190, gap: 20 },
  notice: { color: '#17613F', backgroundColor: '#E5F3EB', padding: 16, borderRadius: 12, fontSize: 15, lineHeight: 23 },
  errorBox: { backgroundColor: '#FFF0EE', padding: 16, borderRadius: 12 },
  error: { color: '#9D302A', fontSize: 15, lineHeight: 23 },
  smallButton: { paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  link: { color: APP_COLORS.PRIMARY, fontSize: 15, fontWeight: '600' },
});
