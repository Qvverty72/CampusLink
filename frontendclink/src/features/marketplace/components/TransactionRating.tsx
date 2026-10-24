import { StyleSheet, Text, View } from 'react-native';
import { Star } from 'lucide-react-native';
import { APP_COLORS } from '@/types/colors';
import { CATALOG_COLORS as colors } from './CatalogUI';

/** Recibo de solo lectura; la puntuación pertenece a esta transacción. */
export function TransactionRating({ score }: { score?: number | null }) {
  if (score == null || !Number.isInteger(score) || score < 1 || score > 5) return null;
  return <View accessible accessibilityLabel={`Valoración de la transacción: ${score} de 5 estrellas`} style={styles.receipt}>
    <Text style={styles.label}>Valoración de la transacción</Text>
    <View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.row}>
      {[1, 2, 3, 4, 5].map(value => <Star key={value} size={24} strokeWidth={1.8} color={value <= score ? APP_COLORS.ACCENT : colors.inputBorder} fill={value <= score ? APP_COLORS.ACCENT : 'transparent'} />)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  receipt: { alignItems: 'center', gap: 8, padding: 14, borderRadius: 16, backgroundColor: colors.background },
  label: { color: colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '600', textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
