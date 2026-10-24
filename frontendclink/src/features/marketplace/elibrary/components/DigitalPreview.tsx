import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Skeleton, SkeletonBlock } from '@/components/Skeleton';
import { LockKeyhole } from 'lucide-react-native';
import { CATALOG_COLORS as colors, ui } from '../../components/CatalogUI';
import { detailUI } from '../../components/ResourceDetailUI';
import { useDigitalPreview } from '../hooks/useDigitalPreview';

export function DigitalPreview({ publicationId, fileId, name, autoOpen = false }: { publicationId: string; fileId: string; name: string; autoOpen?: boolean }) {
  const state = useDigitalPreview(publicationId, fileId, autoOpen);
  return <View style={styles.preview}>
    <View style={detailUI.inline}><LockKeyhole size={16} color={colors.secondary} /><Text style={styles.heading}>Vista previa protegida</Text></View>
    <Text numberOfLines={1} style={detailUI.helper}>{name}</Text>
    {state.open ? <>
      {state.loading ? <Skeleton label="Cargando vista previa" contentStyle={{ gap: 12, paddingVertical: 14 }}>{[100, 90, 95, 60].map((width, index) =>
        <SkeletonBlock style={ui.skeletonBlock} key={index} height={12} width={`${width}%`} />)}</Skeleton>
        : state.error ? <><Text accessibilityRole="alert" style={detailUI.error}>No pudimos cargar la muestra. Inténtalo nuevamente.</Text><Pressable accessibilityRole="button" onPress={state.show} style={ui.outlined}><Text style={ui.link}>Reintentar muestra</Text></Pressable></>
          : <>{state.result?.available && <Text selectable style={styles.fragment}>{state.result.text}…</Text>}<Text style={detailUI.helper}>{state.result?.message || 'Este archivo no dispone de vista previa. Puedes revisar sus metadatos antes de solicitarlo.'}</Text></>}
      {!autoOpen && <Pressable accessibilityRole="button" onPress={state.hide} style={ui.back}><Text style={ui.link}>Cerrar muestra</Text></Pressable>}
    </> : <Pressable accessibilityRole="button" accessibilityLabel={`Vista previa de ${name}`} onPress={state.show} style={ui.outlined}><Text style={ui.link}>Ver muestra limitada</Text></Pressable>}
    <Text style={detailUI.helper}>El archivo completo se mantiene protegido.</Text>
  </View>;
}
const styles = StyleSheet.create({
  preview: { minHeight: 190, borderRadius: 18, padding: 18, gap: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFFFFF' },
  heading: { fontSize: 12, fontWeight: '700', color: colors.secondary }, fragment: { color: colors.ink, fontSize: 15, lineHeight: 24, paddingVertical: 6 },
});
