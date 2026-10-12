import { APP_COLORS } from '@/types/colors';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

/** Open details when supplied; otherwise keep expansion scoped through the caller's key. */
export function ActivityDescription({ description, previewLength = 240, previewLines = 4, onReadMore }: {
  description: string; previewLength?: number; previewLines?: number; onReadMore?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const characters = Array.from(description);
  const canExpand = characters.length > previewLength;
  const collapsed = canExpand && (!!onReadMore || !expanded);
  return <View style={styles.descriptionBlock}>
    <Text style={styles.description} numberOfLines={collapsed ? previewLines : undefined} ellipsizeMode="tail">
      {collapsed ? `${characters.slice(0, previewLength).join('').trimEnd()}…` : description}
    </Text>
    {canExpand ? <TouchableOpacity accessibilityRole="button"
      accessibilityState={onReadMore ? undefined : { expanded }}
      aria-expanded={onReadMore ? undefined : expanded}
      accessibilityHint={onReadMore ? 'Abre la ficha de detalles de la actividad.' : undefined}
      onPress={onReadMore ?? (() => setExpanded(value => !value))} style={styles.descriptionToggle}>
      <Text style={styles.link}>{collapsed ? 'Ver más' : 'Ver menos'}</Text>
    </TouchableOpacity> : null}
  </View>;
}

const styles = StyleSheet.create({
  descriptionBlock: { width: '100%', gap: 4 },
  description: { fontSize: 15, color: '#334155', lineHeight: 23, textAlign: 'center' },
  descriptionToggle: { minHeight: 44, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  link: { color: APP_COLORS.PRIMARY, fontWeight: '700' },
});
