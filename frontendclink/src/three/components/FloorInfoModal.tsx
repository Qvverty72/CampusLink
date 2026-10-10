/**
 * Overlay React Native que presenta metadata y POI vigentes del piso seleccionado.
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
import { LocationActivities } from '@/features/activities/components/LocationActivities';
import type { ActivitiesState } from '@/features/activities/hooks/useLocationActivities';

const POI_TYPE_LABELS: Record<string, string> = {
  AUDITORIUM: 'Auditorio',
  CAFETERIA: 'Cafetería',
  LIBRARY: 'Biblioteca',
  CHAPEL: 'Capilla',
  LAB: 'Laboratorio',
  OFFICE: 'Oficina',
  SPORTS: 'Deportes',
  SERVICE: 'Servicio',
  OTHER: 'Otro',
};

export function FloorInfoModal({ activities }: { activities: ActivitiesState }) {
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

  const pois = (floor.pois ?? []).filter(
    (poi) => poi.isVisible === true && !poi.deletedAt
  );

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
              accessibilityRole="button"
              accessibilityLabel="Cerrar información del piso"
              style={styles.closeButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Content */}
          <ScrollView style={styles.scrollContent} contentContainerStyle={styles.content}>
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

            <View style={styles.poiSection}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Puntos de interés ({pois.length})
              </Text>
              {pois.length === 0 ? (
                <Text style={styles.emptyMessage}>
                  Este piso no tiene puntos de interés vigentes.
                </Text>
              ) : (
                pois.map((poi) => (
                  <View key={poi.poiKey} style={styles.poiCard}>
                    <Text style={styles.poiName}>{poi.name}</Text>
                    <Text style={styles.poiType}>
                      {POI_TYPE_LABELS[poi.type] ?? poi.type}
                    </Text>
                    {poi.description?.trim() ? (
                      <Text style={styles.poiDescription}>{poi.description}</Text>
                    ) : null}
                  </View>
                ))
              )}
            </View>
            <LocationActivities key={floor.id} state={activities}
              query={{ buildingKey: floor.buildingId, floorKey: floor.id }} />
          </ScrollView>

          {/* Footer */}
          <TouchableOpacity onPress={closeFloorModal} accessibilityRole="button" style={styles.footerButton}>
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
    maxHeight: '90%',
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
  scrollContent: {
    flexShrink: 1,
    marginBottom: 20,
  },
  content: {
    paddingBottom: 4,
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
    flexShrink: 1,
    marginLeft: 12,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A2E',
  },
  poiSection: {
    marginTop: 20,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A2E',
  },
  emptyMessage: {
    fontSize: 14,
    lineHeight: 20,
    color: '#666',
  },
  poiCard: {
    backgroundColor: '#F7F9FC',
    borderWidth: 1,
    borderColor: '#E8E8ED',
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  poiName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A2E',
  },
  poiType: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4A90D9',
  },
  poiDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: '#333',
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
