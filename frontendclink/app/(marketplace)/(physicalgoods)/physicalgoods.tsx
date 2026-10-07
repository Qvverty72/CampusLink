import { StyleSheet, Text, View } from 'react-native';
import { BottomNavigationBar } from '@/components/navigation/BottomNavigationBar';

export default function PhysicalGoodsScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>CAMPUSLINK</Text>
        <Text style={styles.title}>Marketplace</Text>
        <Text style={styles.description}>
        Este espacio está preparado para las futuras publicaciones, búsquedas y
        transacciones de la comunidad.
        </Text>
      </View>
      <BottomNavigationBar activeItemId={'physicalgoods'} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7F9',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  eyebrow: {
    color: '#0B6E75',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 10,
  },
  title: {
    color: '#09243A',
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -1,
  },
  description: {
    color: '#607485',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 14,
    maxWidth: 480,
  },
});
