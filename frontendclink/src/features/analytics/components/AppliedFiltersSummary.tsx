import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors as c } from './analytics.styles';

/** Muestra la selección aplicada; expandir no consulta ni modifica filtros. */
export function AppliedFiltersSummary({ identityKey, summary, rows, hint }: {
  identityKey: string; summary: string; rows: string[][]; hint: string;
}) {
  const [expandedIdentity, setExpandedIdentity] = useState<string | null>(null);
  useEffect(() => { setExpandedIdentity(null); }, [identityKey]);
  const expanded = expandedIdentity === identityKey;
  return <View style={v.context}>
    <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Contraer filtros aplicados' : 'Expandir filtros aplicados'}
      accessibilityHint={hint} accessibilityState={{ expanded }} aria-expanded={expanded}
      onPress={() => setExpandedIdentity(expanded ? null : identityKey)} style={v.contextBar}>
      <Text style={v.barText}>{summary}</Text>
      {expanded ? <ChevronUp size={17} color={c.PRIMARY} aria-hidden /> : <ChevronDown size={17} color={c.PRIMARY} aria-hidden />}
    </Pressable>
    {expanded && <View style={v.contextDetails}>{rows.map(([label, value], index) => <View key={label} style={[v.contextRow, index < rows.length - 1 && v.rowDivider]}>
      <Text style={v.contextLabel}>{label}</Text><Text selectable style={v.contextValue}>{value}</Text>
    </View>)}</View>}
  </View>;
}

const v = StyleSheet.create({
  context: { gap: 10 },
  contextBar: { minHeight: 44, borderWidth: 1, borderColor: '#B6C6D2', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 10 },
  barText: { flex: 1, color: c.PRIMARY, fontSize: 12, lineHeight: 18 },
  contextDetails: { borderRadius: 12, paddingHorizontal: 12, backgroundColor: '#FFFFFF' },
  contextRow: { minHeight: 36, flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: c.border },
  contextLabel: { maxWidth: '40%', flexShrink: 1, color: c.SECONDARY, fontSize: 12, lineHeight: 18 },
  contextValue: { flex: 1, color: c.PRIMARY, fontSize: 12, lineHeight: 18, textAlign: 'right' },
});
