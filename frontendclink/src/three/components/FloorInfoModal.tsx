import { colors } from '@/theme/tokens';
/**
 * Overlay React Native que presenta metadata del piso seleccionado.
 *
 * Vive fuera del Canvas: no necesita convertir texto/botones a objetos 3D y puede
 * usar accesibilidad y navegación nativas. Resuelve el ID del store contra la
 * metadata del mapa ACTIVE compartida por `mapDataStore`.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useMapStore } from '@/three/store/mapStore';
import { useMapDataStore } from '@/three/store/mapDataStore';

export function FloorInfoModal() {
  const mapData = useMapDataStore((s) => s.data);
  // El store conserva identificadores y visibilidad, no objetos completos. Así la
  // fuente de metadata puede cambiar de configuración local a API sin duplicarla.
  const selectedFloor = useMapStore((s) => s.selectedFloor);
  const isFloorModalOpen = useMapStore((s) => s.isFloorModalOpen);
  const closeFloorModal = useMapStore((s) => s.closeFloorModal);

  // `meshName` funciona hoy como clave compartida entre raycast, configuración y UI.
  const floor = selectedFloor && mapData
    ? mapData.floorData[selectedFloor]
    : null;

  const building = floor && mapData
    ? mapData.buildingConfigs[floor.buildingId]
    : null;

  if (!isFloorModalOpen || !floor || !building) {
    return null;
  }

  return (
    <Modal
      visible={isFloorModalOpen}
      transparent={true}
      animationType="fade"
      onRequestClose={closeFloorModal}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{floor.name}</Text>
              <Text style={styles.subtitle}>{building.name}</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Cerrar información del piso"
              onPress={closeFloorModal}
              style={styles.closeButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Content */}
          <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
            <Text style={styles.description}>{floor.description}</Text>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Nivel</Text>
              <Text style={styles.infoValue}>{floor.level}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Edificio</Text>
              <Text style={styles.infoValue}>{building.name}</Text>
            </View>

          </ScrollView>

          {/* Footer */}
          <TouchableOpacity accessibilityRole="button" onPress={closeFloorModal} style={styles.footerButton}>
            <Text style={styles.footerButtonText}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    maxHeight: '100%',
    paddingVertical: 20,
    paddingHorizontal: 24,
    // Shadow
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerText: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.brandPrimary,
  },
  closeButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeIcon: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 16,
  },
  content: {
    flexShrink: 1,
  },
  contentInner: {
    paddingBottom: 20,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceElevated,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  infoValue: {
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 12,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  footerButton: {
    backgroundColor: colors.brandPrimary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  footerButtonText: {
    color: colors.onBrand,
    fontSize: 16,
    fontWeight: '600',
  },
});
