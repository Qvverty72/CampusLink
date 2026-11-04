import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight, ImageOff, Maximize2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { safeAreaInset } from '@/lib/layout/safeArea';
import type { useReportReviews } from '../hooks/useReportReviews';
import { focusReport, ReportButton, ReportIcon, type ReportFocusTarget } from './ReportUI';
import { reportDetailStyles as d } from './reportDetail.styles';
import { reportStyles as s, reportColors as c } from './reports.styles';

type Review = ReturnType<typeof useReportReviews>;
type Photo = { scope: string; url: string | null; status: 'loading' | 'ready' | 'error' };

/** Sólo la imagen seleccionada del snapshot; enlaces temporales, sin caché persistente. */
export function ReportImageGallery({ review, images }: { review: Review; images: Record<string, unknown>[] }) {
  const [index, setIndex] = useState(0), [attempt, setAttempt] = useState(0), [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<Photo | null>(null);
  const loader = useRef(review.loadImage); loader.current = review.loadImage;
  const trigger = useRef<ReportFocusTarget>(null), closeButton = useRef<ReportFocusTarget>(null);
  const insets = useSafeAreaInsets(), image = images[index] ?? images[0];
  const imageId = typeof image?.id === 'string' ? image.id : '';
  const name = typeof image?.nombre_original === 'string' ? image.nombre_original : typeof image?.name === 'string' ? image.name : `Imagen ${index + 1}`;
  const scope = JSON.stringify([review.identityKey, review.campusId, review.detail?.id, imageId, index, attempt]);
  const activeScope = useRef(scope); activeScope.current = scope;
  const photo = state?.scope === scope ? state : null;
  const canLoad = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(imageId) && typeof review.loadImage === 'function';
  useEffect(() => {
    const controller = new AbortController(); setExpanded(false);
    setState({ scope, url: null, status: canLoad ? 'loading' : 'error' });
    if (canLoad) void loader.current(imageId, controller.signal).then(result => {
      if (!controller.signal.aborted) setState({ scope, url: result.url, status: 'loading' });
    }).catch(() => { if (!controller.signal.aborted) setState({ scope, url: null, status: 'error' }); });
    return () => controller.abort();
  }, [scope, imageId, canLoad]);
  const close = () => { setExpanded(false); requestAnimationFrame(() => focusReport(trigger.current)); };
  useEffect(() => {
    if (!expanded) return;
    const frame = requestAnimationFrame(() => focusReport(closeButton.current));
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); } };
    if (Platform.OS === 'web') window.addEventListener('keydown', escape, true);
    return () => { cancelAnimationFrame(frame); if (Platform.OS === 'web') window.removeEventListener('keydown', escape, true); };
  }, [expanded]);
  const failed = () => { if (activeScope.current === scope) { setState({ scope, url: null, status: 'error' }); setExpanded(false); } };
  if (!images.length) return <View style={d.imagePlaceholder}><ReportIcon icon={ImageOff} size={30} /><Text style={s.small}>Sin imágenes registradas</Text></View>;
  return <View style={s.smallStack}>
    {photo?.url ? <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={`Ampliar imagen: ${name}`} disabled={photo.status !== 'ready'}
      onPress={() => setExpanded(true)} style={d.imagePreview}>
      <Image key={photo.url} source={{ uri: photo.url }} resizeMode="contain" style={d.image} accessibilityLabel={`Imagen denunciada: ${name}`}
        onLoad={() => setState(current => current?.scope === scope ? { ...current, status: 'ready' } : current)} onError={failed} />
      {photo.status === 'loading' ? <ActivityIndicator style={d.imageOverlay} accessibilityLabel={`Cargando imagen: ${name}`} color={c.PRIMARY} />
        : <View style={d.imageZoom}><ReportIcon icon={Maximize2} size={17} /></View>}
    </Pressable> : <View style={d.imagePlaceholder}>
      {canLoad && (!photo || photo.status === 'loading') ? <ActivityIndicator color={c.PRIMARY} accessibilityLabel={`Cargando imagen: ${name}`} />
        : <><ReportIcon icon={ImageOff} size={30} /><Text style={s.small}>Imagen no disponible</Text>
          {canLoad && <ReportButton secondary onPress={() => setAttempt(value => value + 1)} label={`Reintentar imagen: ${name}`}>Reintentar imagen</ReportButton>}</>}
    </View>}
    <View style={d.imageNavigation}>
      {images.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel="Imagen anterior" disabled={index === 0}
        onPress={() => setIndex(value => value - 1)} style={[d.imageArrow, index === 0 && s.disabled]}><ReportIcon icon={ChevronLeft} /></Pressable>}
      <Text style={[s.small, s.grow]} accessibilityLiveRegion="polite">Imagen {index + 1} de {images.length}</Text>
      {images.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel="Imagen siguiente" disabled={index >= images.length - 1}
        onPress={() => setIndex(value => value + 1)} style={[d.imageArrow, index >= images.length - 1 && s.disabled]}><ReportIcon icon={ChevronRight} /></Pressable>}
    </View>
    {expanded && photo?.url && <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={[d.imageViewer, { paddingTop: safeAreaInset('top', insets.top, { min: 20 }), paddingBottom: safeAreaInset('bottom', insets.bottom, { min: 20 }) }]} accessibilityViewIsModal onAccessibilityEscape={close}>
        <ScrollView contentContainerStyle={d.imageViewerContent}><Text style={s.sectionTitle}>{name}</Text>
          <Image source={{ uri: photo.url }} resizeMode="contain" style={d.imageLarge} accessibilityLabel={`Imagen ampliada: ${name}`} onError={failed} />
        </ScrollView>
        <ReportButton buttonRef={closeButton} secondary onPress={close}>Cerrar imagen</ReportButton>
      </View>
    </Modal>}
  </View>;
}
