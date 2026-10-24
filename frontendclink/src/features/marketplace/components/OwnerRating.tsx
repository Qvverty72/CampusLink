import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Star } from 'lucide-react-native';
import { APP_COLORS } from '@/types/colors';
import { CATALOG_COLORS as c } from './CatalogUI';
import { PublicationFeedback, PublicationSubmit, publicationUI as f } from './PublicationFormUI';

export function OwnerRating({ owner, rating, canRate, score, confirming, disabled, error, busy, onReload, onSelect, onPrepare, onSend, onCancel }: {
  owner?: string; rating?: { score: number; createdAt: string } | null; canRate: boolean; score: number | null;
  confirming: boolean; disabled: boolean; onSelect: (score: number) => void; onPrepare: () => void; onSend: () => void; onCancel: () => void;
  error?: string | null; busy?: boolean; onReload?: () => void;
}) {
  return <View style={f.section}><Text accessibilityRole="header" style={f.title}>Valoración del propietario</Text>
    {error && <><PublicationFeedback error={error} />{onReload && <Pressable accessibilityRole="button" disabled={busy} onPress={onReload} style={f.secondary}><Text style={f.actionText}>Actualizar acuerdo antes de reintentar</Text></Pressable>}</>}
    {rating ? <>
      <Text style={styles.receipt}>Valoración registrada: {rating.score} de 5</Text>
      <Text style={f.hint}>{new Date(rating.createdAt).toLocaleString('es-CL')} · No se puede editar.</Text>
    </> : canRate ? <>
      <Text style={f.hint}>{owner ? `Valora tu intercambio con ${owner}.` : 'Valora tu experiencia con el propietario del recurso.'}</Text>
      <Text style={f.notice}>Solo puedes valorar una vez por transacción. Después de enviarla, no podrás editar tu puntuación.</Text>
      {confirming ? <>
        <Text style={f.label}>Enviar una valoración de {score} de 5</Text>
        <PublicationSubmit label="Confirmar valoración" disabled={disabled} onPress={onSend} />
        <Pressable accessibilityRole="button" disabled={disabled} onPress={onCancel} style={f.secondary}><Text style={f.actionText}>Volver a elegir</Text></Pressable>
      </> : <>
        <View accessibilityRole="radiogroup" accessibilityLabel="Puntuación del propietario" style={styles.scores}>{[1, 2, 3, 4, 5].map(value => <Pressable key={value}
          accessibilityRole="radio" accessibilityLabel={`Puntuar con ${value} de 5`} accessibilityState={{ checked: value === score, disabled }} aria-checked={value === score}
          disabled={disabled} onPress={() => onSelect(value)} style={[styles.score, score === value && f.selected, disabled && f.disabled]}>
          <Star size={24} color={score && value <= score ? APP_COLORS.ACCENT : c.secondary} fill={score && value <= score ? APP_COLORS.ACCENT : 'transparent'} />
          <Text style={f.actionText}>{value}</Text></Pressable>)}</View>
        <Text accessibilityLiveRegion="polite" style={f.hint}>{score ? `${score} de 5 seleccionados` : 'Selecciona una puntuación de 1 a 5.'}</Text>
        <PublicationSubmit label="Enviar valoración" disabled={disabled || !score} onPress={onPrepare} />
      </>}
    </> : <Text style={f.hint}>Aún no se ha registrado una valoración.</Text>}
  </View>;
}
const styles = StyleSheet.create({
  scores: { flexDirection: 'row', gap: 4 }, score: { flex: 1, minWidth: 44, minHeight: 68, gap: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.inputBorder, borderRadius: 12 },
  receipt: { color: c.primary, fontWeight: '700', fontSize: 17 },
});
