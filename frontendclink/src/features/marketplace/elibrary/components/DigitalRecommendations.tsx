import { Pressable, ScrollView, Text, View } from 'react-native';
import { CATALOG_COLORS, ui } from '../../components/CatalogUI';
import { useDigitalRecommendations } from '../hooks/useDigitalRecommendations';
import { ResourceRow } from './ResourceRow';

export function DigitalRecommendations({ onOpen }: { onOpen: (id: string) => void }) {
  const state = useDigitalRecommendations();
  return <View style={{ gap: 12 }}><Text accessibilityRole="header" style={ui.sectionTitle}>Recomendados para ti</Text>
    {state.loading ? <View accessibilityLabel="Cargando recomendaciones" accessibilityRole="progressbar" style={{ flexDirection: 'row', gap: 10, overflow: 'hidden' }}>
      {[0, 1, 2].map(value => <View key={value} style={{ width: 150, height: 196, borderRadius: 16, backgroundColor: CATALOG_COLORS.border }} />)}
    </View> : state.error ? <View style={{ gap: 8 }}><Text style={ui.subtitle}>No pudimos cargar las recomendaciones. Puedes seguir explorando.</Text>
      <Pressable accessibilityRole="button" onPress={state.reload} style={ui.outlined}><Text style={ui.link}>Reintentar recomendaciones</Text></Pressable></View>
      : state.items.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, alignItems: 'stretch' }}>
        {state.page > 1 && <Pressable accessibilityRole="button" onPress={state.previous} style={ui.outlined}><Text style={ui.link}>Anteriores</Text></Pressable>}
        {state.items.map(row => <ResourceRow key={row.id} resource={row} recommended onOpen={() => onOpen(row.id)} />)}
        {state.hasMore && <Pressable accessibilityRole="button" onPress={state.next} style={ui.outlined}><Text style={ui.link}>Más recomendaciones</Text></Pressable>}
      </ScrollView> : <Text style={ui.subtitle}>Todavía no hay recomendaciones para ti. Explora todos los recursos o completa tus carreras en el Perfil.</Text>}
  </View>;
}
