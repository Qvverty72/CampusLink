/**
 * CampusLink MVP — Floor Info Modal
 *
 * Renders OUTSIDE the Canvas as a React Native overlay.
 * Shows mock information about the selected floor.
 *
 * Architecture:
 * Screen
 * ├── Canvas (3D)
 * └── FloorInfoModal (RN, this component)
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from 'react-native';
import { useMapStore } from '@/store/mapStore';
import { floorData, buildingConfigs } from '@/data/floors';

export function FloorInfoModal() {
  const selectedFloor = useMapStore((s) => s.selectedFloor);
  const isFloorModalOpen = useMapStore((s) => s.isFloorModalOpen);
  const closeFloorModal = useMapStore((s) => s.closeFloorModal);

  // Get floor data
  const floor = selectedFloor ? floorData[selectedFloor] : null;
  const building = floor ? buildingConfigs[floor.buildingId] : null;

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
          <View style={styles.content}>
            <Text style={styles.description}>{floor.description}</Text>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Nivel</Text>
              <Text style={styles.infoValue}>{floor.level}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Edificio</Text>
              <Text style={styles.infoValue}>{building.name}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>ID</Text>
              <Text style={styles.infoValue}>{floor.meshName}</Text>
            </View>
          </View>

          {/* Footer */}
          <TouchableOpacity onPress={closeFloorModal} style={styles.footerButton}>
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    paddingVertical: 20,
    paddingHorizontal: 24,
    // Shadow
    shadowColor: '#000',
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
    color: '#1A1A2E',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4A90D9',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F0F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeIcon: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  divider: {
    height: 1,
    backgroundColor: '#E8E8ED',
    marginVertical: 16,
  },
  content: {
    marginBottom: 20,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: '#333',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F5',
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#888',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A2E',
  },
  footerButton: {
    backgroundColor: '#4A90D9',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  footerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
