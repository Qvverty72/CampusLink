import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { catalog } from '@/mocks/catalog';
import { Card, EmptyState, Screen, ui } from '@/components/ui';
export default function PreviewRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = catalog.find((entry) => entry.id === id && entry.kind === 'library');
  return <Screen title="Vista previa">{item ? <><Text style={ui.heading}>{item.title}</Text><Card><Text style={ui.label}>Página de ejemplo · 1</Text><Text style={ui.body}>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Este espacio representa una página del recurso digital.</Text></Card><Text style={ui.muted}>Vista previa simulada. No hay archivo descargable.</Text></> : <EmptyState title="Recurso no encontrado" />}</Screen>;
}
