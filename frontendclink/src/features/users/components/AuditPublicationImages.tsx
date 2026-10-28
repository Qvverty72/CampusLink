import { createContext, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ImageOff, Maximize2, RefreshCw } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { safeAreaInset } from '@/lib/layout/safeArea';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { loadAuditImage } from '../api/auditApi';
import { auditImageRecords, auditImageSize, auditPrimaryImage, type AuditImageRecord } from '../utils/auditImagePresentation';
import { auditColors as colors, auditStyles as shared } from './audit.styles';

export const AuditImageContext = createContext<{ campusId: string; auditId: string; onAccessError: (error: unknown) => void } | null>(null);

export function AuditPublicationImages({ value, mode = 'full' }: { value: unknown[]; mode?: 'full' | 'preview' | 'metadata' }) {
  const images = auditImageRecords(value);
  if (mode === 'preview') {
    const primary = auditPrimaryImage(value);
    return primary ? <AuditPhoto image={primary.image} index={primary.index} previewOnly /> : <View style={styles.placeholder}><ImageOff size={24} color={colors.muted} aria-hidden /><Text style={styles.placeholderText}>Sin imágenes conservadas en este registro</Text></View>;
  }
  return images.length ? <View style={styles.list}>
    {images.map((image, index) => mode === 'metadata' ? <AuditImageFile key={`${image.id ?? 'missing'}:${index}`} image={image} index={index} />
      : <AuditPhoto key={`${image.id ?? 'missing'}:${index}`} image={image} index={index} />)}
  </View> : <Text style={shared.valueMuted}>Sin imágenes registradas</Text>;
}

function AuditImageFile({image,index}:{image:AuditImageRecord;index:number}) {
  const [open,setOpen]=useState(false),name=image.name??`Imagen ${index+1}`;
  return <View style={styles.card}>
    <Text selectable style={styles.name}>{name}</Text><AuditImageMetadata image={image} showRemovedLabel />
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${open?'Ocultar':'Ver'} imagen: ${name}`} accessibilityState={{expanded:open}} aria-expanded={open}
      onPress={()=>setOpen(value=>!value)} style={styles.fileToggle}><Maximize2 size={13} color={colors.PRIMARY} accessible={false} aria-hidden /><Text style={styles.retryText}>{open?'Ocultar imagen':'Ver imagen'}</Text></TouchableOpacity>
    {open&&<AuditPhoto image={image} index={index} previewOnly previewLabel="Vista previa del archivo" />}
  </View>;
}

function AuditPhoto({ image, index, previewOnly = false,previewLabel='Imagen principal' }: { image: AuditImageRecord; index: number; previewOnly?: boolean;previewLabel?:string }) {
  const scope = useContext(AuditImageContext);
  const campusId = scope?.campusId, auditId = scope?.auditId, onAccessError = scope?.onAccessError;
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const insets = useSafeAreaInsets();
  const name = image.name ?? `Imagen ${index + 1}`;
  const canLoad = !!campusId && !!auditId && !!image.id && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(image.id);
  useEffect(() => {
    setUrl(null); setExpanded(false);
    if (!canLoad || !campusId || !auditId || !image.id) { setStatus('unavailable'); return; }
    const controller = new AbortController(); setStatus('loading');
    void loadAuditImage(campusId, auditId, image.id, controller.signal).then(result => {
      if (!controller.signal.aborted) setUrl(result.url);
    }).catch(error => {
      if (controller.signal.aborted) return;
      setStatus('unavailable');
      if (error instanceof AuthApiError && [401, 403].includes(error.status)) onAccessError?.(error);
    });
    return () => controller.abort();
  }, [campusId, auditId, image.id, canLoad, attempt, onAccessError]);
  const failed = () => { setStatus('unavailable'); setUrl(null); setExpanded(false); };
  return <View style={styles.card}>
    {!previewOnly && <Text selectable style={styles.name}>{name}</Text>}
    {(previewOnly || image.removedAt || image.order === 0) && <Text style={styles.badge}>{image.removedAt ? 'Retirada de la publicación' : previewLabel}</Text>}
    {url ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Ampliar imagen: ${name}`} disabled={status !== 'ready'} onPress={() => setExpanded(true)} activeOpacity={0.75} style={[styles.preview,previewOnly && styles.heroPreview]}>
      <Image key={url} source={{ uri: url }} resizeMode="contain" style={styles.photo} accessibilityLabel={`Vista previa: ${name}`} onLoad={() => setStatus('ready')} onError={failed} />
      {status === 'loading' ? <ActivityIndicator style={StyleSheet.absoluteFill} size="small" color={colors.PRIMARY} accessibilityLabel={`Cargando imagen: ${name}`} />
        : <View style={styles.zoomIcon} pointerEvents="none"><Maximize2 size={15} color={colors.PRIMARY} aria-hidden /></View>}
    </TouchableOpacity> : <View style={styles.placeholder}>
      {status === 'loading' ? <ActivityIndicator size="small" color={colors.PRIMARY} accessibilityLabel={`Cargando imagen: ${name}`} />
        : <><ImageOff size={22} color={colors.muted} aria-hidden /><Text style={styles.placeholderText}>Vista previa no disponible</Text></>}
    </View>}
    {status === 'unavailable' && canLoad && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Reintentar imagen: ${name}`} onPress={() => setAttempt(value => value + 1)} style={styles.retry}>
      <RefreshCw size={13} color={colors.PRIMARY} aria-hidden /><Text style={styles.retryText}>Reintentar</Text>
    </TouchableOpacity>}
    {!previewOnly && <AuditImageMetadata image={image} />}
    {expanded && url && <Modal visible transparent animationType="fade" onRequestClose={() => setExpanded(false)}>
      <View style={[styles.viewer, { paddingTop: safeAreaInset('top', insets.top, { min: 20 }), paddingBottom: safeAreaInset('bottom', insets.bottom, { min: 20 }) }]} accessibilityViewIsModal onAccessibilityEscape={() => setExpanded(false)}>
        <ScrollView contentContainerStyle={styles.viewerContent}>
          <Text selectable style={styles.viewerName}>{name}</Text>
          <Image source={{ uri: url }} resizeMode="contain" style={styles.largePhoto} accessibilityLabel={`Imagen ampliada: ${name}`} onError={failed} />
          <Text selectable style={styles.viewerId}>ID: {image.id}</Text>
        </ScrollView>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar imagen" onPress={() => setExpanded(false)} style={shared.returnButton}>
          <Text style={shared.buttonText}>Cerrar imagen</Text>
        </TouchableOpacity>
      </View>
    </Modal>}
  </View>;
}

function AuditImageMetadata({ image,showRemovedLabel=false }: { image: AuditImageRecord;showRemovedLabel?:boolean }) {
  const format = image.mimeType === 'image/jpeg' ? 'JPEG' : image.mimeType === 'image/png' ? 'PNG' : image.mimeType === 'image/webp' ? 'WebP' : null;
  return <View style={styles.card}>
    <Text selectable style={shared.referenceId}>ID: {image.id ?? 'No registrado'}</Text>
    <Text selectable style={shared.fieldLabel}>Formato: {format ? `${format} · ${image.mimeType}` : image.mimeType ?? 'No registrado'}</Text>
    <Text selectable style={shared.fieldLabel}>Tamaño: {image.bytes === null ? 'No registrado' : auditImageSize(image.bytes)}</Text>
    <Text selectable style={shared.fieldLabel}>Orden registrado: {image.order ?? 'No registrado'}</Text>
    {!!image.removedAt && <>{showRemovedLabel&&<Text style={styles.badge}>Retirada de la publicación</Text>}<Text selectable style={shared.fieldLabel}>Retirada en: {image.removedAt}</Text></>}
  </View>;
}

const styles = StyleSheet.create({
  list: { gap: 16 }, card: { gap: 8, minWidth: 0 }, name: { color: colors.PRIMARY, fontSize: 13, lineHeight: 20, fontWeight: '600' },
  badge: { color: colors.SECONDARY, fontSize: 11, lineHeight: 17, fontWeight: '600' },
  preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: 8, overflow: 'hidden', backgroundColor: '#DDE6ED' }, photo: { width: '100%', height: '100%' },
  heroPreview: { aspectRatio: 16/9, maxHeight: 320, borderRadius: 14 },
  placeholder: { minHeight: 80, padding: 10, gap: 7, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#E2EAF0' },
  placeholderText: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  zoomIcon: { position: 'absolute', bottom: 5, right: 5, backgroundColor: colors.surface, borderRadius: 7, padding: 5 },
  retry: { minHeight: 44, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 5 }, retryText: { color: colors.PRIMARY, fontSize: 11, lineHeight: 17, fontWeight: '600' },
  fileToggle:{minHeight:44,alignSelf:'flex-start',maxWidth:'100%',flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:10,borderRadius:10,backgroundColor:colors.soft},
  viewer: { flex: 1, backgroundColor: '#092C46', paddingHorizontal: 16, gap: 16 }, viewerContent: { flexGrow: 1, justifyContent: 'center', gap: 16, alignItems: 'center' },
  viewerName: { color: '#FFFFFF', fontSize: 16, lineHeight: 23, fontWeight: '600', textAlign: 'center' },
  largePhoto: { width: '100%', height: 440 }, viewerId: { color: '#FFFFFF', fontSize: 12, lineHeight: 19, textAlign: 'center' },
});
