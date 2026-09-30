import { Pressable, Text, View } from 'react-native';
import type { ContentItem } from '@/mocks/catalog';
import { Badge, ImagePlaceholder, go, ui } from './ui';

function ContentCard({ item }: { item: ContentItem }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${item.title}`} onPress={() => go(`/detail/${item.kind}/${item.id}`)} style={({ pressed }) => [ui.card, pressed && ui.dim]}>
    <ImagePlaceholder label={item.kind === 'library' ? 'Documento PDF · ejemplo' : item.kind === 'activities' ? 'Encuentro en el campus' : 'Imagen opcional'} />
    <View style={ui.row}><Badge>{item.badge}</Badge><Text style={ui.muted}>{item.category !== item.badge ? item.category : ''}</Text></View>
    <Text style={ui.heading}>{item.title}</Text><Text style={ui.muted}>{item.subtitle}</Text><Text style={ui.label}>{item.highlight}</Text>
  </Pressable>;
}
export function ResourceCard({ item }: { item: ContentItem }) { return <ContentCard item={item} />; }
export function ActivityCard({ item }: { item: ContentItem }) { return <ContentCard item={item} />; }
