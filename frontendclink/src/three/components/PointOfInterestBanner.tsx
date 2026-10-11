import { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { PointOfInterestDefinition } from '../types/map';
import { poiImages } from '../utils/pointOfInterest';

const BANNER_HEIGHT = 140;

/** First available POI photo as a stable, pressable preview in the floor modal. */
export function PointOfInterestBanner({ poi, onPress }: {
  poi: PointOfInterestDefinition; onPress: () => void;
}) {
  const image = poiImages(poi.imageKeys)[0];
  const [failedImageKey, setFailedImageKey] = useState<string | null>(null);
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Ver información de ${poi.name}`}
    activeOpacity={0.85} onPress={onPress} style={styles.banner}>
    {image && image.key !== failedImageKey ? <>
      <Image key={image.key} source={image.source}
        resizeMode="cover" onError={() => setFailedImageKey(image.key)} style={styles.image} />
      <View pointerEvents="none" style={styles.caption}>
        <Text numberOfLines={2} style={styles.captionText}>{poi.name}</Text>
      </View>
    </>
      : <View style={styles.empty}>
        <Text numberOfLines={2} style={styles.name}>{poi.name}</Text>
        <Text style={styles.hint}>Imagen no disponible</Text>
      </View>}
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  // Static style is required here: native CSS interop drops Pressable style callbacks.
  banner: { width: '100%', height: BANNER_HEIGHT, flexGrow: 0, flexShrink: 0, overflow: 'hidden',
    borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F1F5F9' },
  // Explicit dimensions override the bundled image's intrinsic width/height on native.
  image: { width: '100%', height: BANNER_HEIGHT },
  caption: { position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.25)' },
  captionText: { color: '#FFFFFF', fontSize: 20, fontWeight: '600', textAlign: 'left',
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  empty: { flex: 1, padding: 12, gap: 4, alignItems: 'center', justifyContent: 'center' },
  name: { color: '#0F172A', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  hint: { color: '#64748B', fontSize: 12, textAlign: 'center' },
});
