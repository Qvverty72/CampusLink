import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useActivityDetail } from '../hooks/useActivityDetail';
import { ACTIVITY_COLORS, ACTIVITY_LABELS, type Activity } from '../types/activity';

/** Renders inside the current native modal; returning never changes map selection. */
export function ActivityDetail({ activityId, onBack, onExplore }: {
  activityId: string; onBack: () => void; onExplore?: (activity: Activity) => void;
}) {
  const { detail, isLoading, error, refresh, join, isJoining, joinError } = useActivityDetail(activityId);
  const [failedBanner, setFailedBanner] = useState<string | null>(null);
  return <View style={styles.content}>
    <Pressable accessibilityRole="button" onPress={onBack} style={styles.action}>
      <Text style={styles.link}>Volver a las actividades</Text>
    </Pressable>
    {isLoading ? <><ActivityIndicator /><Text>Cargando ficha…</Text></>
      : error ? <>
        <Text accessibilityRole="alert" style={styles.text}>{error}</Text>
        <Pressable accessibilityRole="button" onPress={refresh} style={styles.action}><Text style={styles.link}>Reintentar</Text></Pressable>
      </> : detail ? <>
        <Text style={[styles.type, { color: ACTIVITY_COLORS[detail.type] }]}>{ACTIVITY_LABELS[detail.type]}</Text>
        <Text accessibilityRole="header" style={styles.title}>{detail.title}</Text>
        {detail.bannerUrl && failedBanner !== detail.bannerUrl ? <Image source={{ uri: detail.bannerUrl }}
          accessibilityLabel={`Imagen de ${detail.title}`} style={styles.banner} resizeMode="cover"
          onError={() => setFailedBanner(detail.bannerUrl ?? null)} /> : null}
        <Text style={styles.text}>{detail.description}</Text>
        <Text style={styles.text}>Organizador: {detail.organizer?.name ?? 'No disponible'}</Text>
        <Text style={styles.text}>Inicio: {new Date(detail.startAt).toLocaleString('es-CL')}</Text>
        <Text style={styles.text}>Término: {new Date(detail.endAt).toLocaleString('es-CL')}</Text>
        <Text style={styles.text}>Estado: Activa</Text>
        <Text accessibilityRole="header" style={styles.heading}>Ubicación</Text>
        <Text style={styles.text}>Edificio: {detail.location.buildingName}</Text>
        <Text style={styles.text}>Piso: {detail.location.floorName}</Text>
        {detail.location.poiName ? <Text style={styles.text}>Punto de interés: {detail.location.poiName}</Text> : null}
        {detail.location.customLabel ? <Text style={styles.text}>{detail.location.customLabel}</Text> : null}
        {detail.category ? <Text style={styles.text}>Categoría: {detail.category}</Text> : null}
        {detail.tags?.length ? <Text style={styles.text}>Etiquetas: {detail.tags.join(', ')}</Text> : null}
        <Text accessibilityLiveRegion="polite" style={styles.heading}>
          {detail.participation.status === 'JOINED' ? 'Estás inscrito en esta actividad.'
            : detail.participation.status === 'LEFT' ? 'Te retiraste de esta actividad.' : 'No estás inscrito en esta actividad.'}
        </Text>
        {joinError ? <Text accessibilityRole="alert" style={styles.text}>{joinError}</Text> : null}
        {detail.participation.canJoin ? <Pressable accessibilityRole="button" disabled={isJoining}
          accessibilityState={{ disabled: isJoining, busy: isJoining }} onPress={() => { void join(); }}
          style={[styles.join, isJoining && styles.disabled]}>
          <Text style={styles.joinText}>{isJoining ? 'Confirmando inscripción…' : 'Inscribirme'}</Text>
        </Pressable> : null}
        {onExplore ? <Pressable accessibilityRole="button" onPress={() => onExplore(detail)} style={styles.action}>
          <Text style={styles.link}>Explorar este piso</Text>
        </Pressable> : null}
        <Pressable accessibilityRole="button" onPress={refresh} disabled={isJoining} style={styles.action}>
          <Text style={styles.link}>Actualizar ficha</Text>
        </Pressable>
      </> : null}
  </View>;
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingVertical: 12 }, title: { fontSize: 21, fontWeight: '700', color: '#0F172A' },
  heading: { fontSize: 16, fontWeight: '600', color: '#0F172A' }, type: { fontWeight: '700' },
  text: { color: '#334155', lineHeight: 22 }, link: { color: '#0B6E75', fontWeight: '700' },
  action: { paddingVertical: 12 }, banner: { width: '100%', height: 160, borderRadius: 10 },
  join: { backgroundColor: '#0B6E75', padding: 14, borderRadius: 10, alignItems: 'center' },
  joinText: { color: '#FFFFFF', fontWeight: '700' }, disabled: { opacity: 0.6 },
});
