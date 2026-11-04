/**
 * Une geometría local del GLB con pisos del mapa ACTIVE. La decoración conserva
 * sus transforms originales; cada piso se reconstruye como unidad seleccionable.
 * CameraController consume el userData de sus mallas para realizar el raycast.
 */

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';
import { useCampusGLTF } from '@/three/models/CampusModel';
import { useMapDataStore } from '@/three/store/mapDataStore';
import { useMapStore } from '@/three/store/mapStore';
import type { BuildingId, FloorMeshConfig } from '@/three/types/map';

/** Separación vertical por edificio en las unidades pequeñas del modelo. */
const EXPLOSION_SPACING_BY_BUILDING: Record<BuildingId, number> = {
  cabin01: 0.02,
  cabin02: 0.02,
  cabin03: 0.02,
  dbuilding: 0.018,
  ebuilding: 0.018,
  fbuilding: 0.018,
  gbuilding: 0.018,
  hbuilding: 0.018,
  cti: 0.04,
  gym: 0.04,
};

/** Margen sobre el nivel superior original para exponer todos los subterráneos. */
const CABIN_EXPLOSION_CLEARANCE = 0.02;

/** Velocidad del lerp; se combina con delta para no depender del framerate. */
const LERP_SPEED = 5;

interface FloorGroupProps {
  meshName: string;
  buildingId: BuildingId;
  originalPosition: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  subMeshNodes: Array<{
    name: string;
    geometry: THREE.BufferGeometry;
    material: THREE.Material | THREE.Material[];
  }>;
  /** Índice físico, desde el piso de menor altura al de mayor altura. */
  floorIndex: number;
  baseLift: number;
}

/**
 * Agrupa los submeshes del piso. Anima únicamente Y desde el transform original,
 * sin acumular offsets al abrir/cerrar o cambiar de edificio.
 */
const FloorGroup = React.memo(function FloorGroup({
  meshName,
  buildingId,
  originalPosition,
  rotation,
  scale,
  subMeshNodes,
  floorIndex,
  baseLift,
}: FloorGroupProps) {
  const groupRef = useRef<THREE.Group>(null);
  const selectedBuilding = useMapStore((s) => s.selectedBuilding);
  const isExploded = useMapStore((s) => s.isExploded);

  const targetY = useMemo(() => {
    if (!isExploded || selectedBuilding !== buildingId) {
      return originalPosition[1];
    }
    const spacing = EXPLOSION_SPACING_BY_BUILDING[buildingId];
    return originalPosition[1] + baseLift + floorIndex * spacing;
  }, [isExploded, selectedBuilding, buildingId, floorIndex, baseLift, originalPosition]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const currentY = groupRef.current.position.y;
    const diff = Math.abs(currentY - targetY);
    if (diff > 0.0001) {
      groupRef.current.position.y = THREE.MathUtils.lerp(
        currentY,
        targetY,
        1 - Math.exp(-LERP_SPEED * delta)
      );
    } else {
      groupRef.current.position.y = targetY;
    }
  });

  return (
    <group
      ref={groupRef}
      position={[originalPosition[0], originalPosition[1], originalPosition[2]]}
      rotation={rotation}
      scale={scale}
    >
      {subMeshNodes.map(({ name, geometry, material }) => (
        <mesh
          key={name}
          geometry={geometry}
          material={material}
          userData={{ isFloor: true, meshName, buildingId }}
        />
      ))}
    </group>
  );
});

/**
 * Resuelve pisos por los nombres del GLB. El resto de la escena es decoración sin
 * isFloor, incluido el árbol reservado para una futura iteración del easter egg.
 */
export function CampusModelScene() {
  const { nodes, scene } = useCampusGLTF();
  const mapData = useMapDataStore((s) => s.data);

  const floors = useMemo(() => {
    if (!mapData) return [];

    // La API y los niveles/IDs históricos no siempre están ordenados por altura.
    const buildingFloors = new Map<BuildingId, FloorMeshConfig[]>();
    for (const config of mapData.floorMeshConfigs) {
      const configs = buildingFloors.get(config.buildingId) ?? [];
      configs.push(config);
      buildingFloors.set(config.buildingId, configs);
    }
    for (const configs of buildingFloors.values()) {
      configs.sort((a, b) => a.position[1] - b.position[1]);
    }

    return mapData.floorMeshConfigs.map((config) => {
      const physicalFloors = buildingFloors.get(config.buildingId)!;
      const lowestY = physicalFloors[0].position[1];
      const highestY = physicalFloors[physicalFloors.length - 1].position[1];
      const subMeshNodes = config.subMeshes
        .map((nodeName) => {
          // Metro puede cargar Three ESM para la escena y CJS para GLTFLoader.
          // isMesh identifica ambas instancias sin depender del constructor.
          const node = nodes[nodeName] as THREE.Mesh | undefined;
          if (!node?.isMesh) return null;
          return {
            name: nodeName,
            geometry: node.geometry,
            material: node.material,
          };
        })
        .filter((node): node is NonNullable<typeof node> => node !== null);

      return {
        ...config,
        floorIndex: physicalFloors.indexOf(config),
        // El margen deja libre también la pasarela junto al nivel de acceso.
        baseLift: config.buildingId.startsWith('cabin')
          ? highestY - lowestY + CABIN_EXPLOSION_CLEARANCE
          : 0,
        subMeshNodes,
      };
    });
  }, [mapData, nodes]);

  // Clonar conserva todos los transforms/materiales de la decoración, incluido
  // pine_tree13(easteregg), sin mutar la caché. Quitar solo las mallas configuradas
  // evita dibujar cada piso también en su posición original durante la animación.
  const decoration = useMemo(() => {
    const clonedScene = scene.clone(true);
    const floorMeshNames = new Set(
      floors.flatMap((floor) => floor.subMeshNodes.map((node) => node.name))
    );
    const floorMeshes: THREE.Object3D[] = [];
    clonedScene.traverse((object) => {
      if (floorMeshNames.has(object.name)) floorMeshes.push(object);
    });
    for (const mesh of floorMeshes) mesh.removeFromParent();
    return clonedScene;
  }, [scene, floors]);

  return (
    // Los clones comparten geometrías/materiales con la caché de useGLTF.
    <group dispose={null}>
      <primitive object={decoration} />
      {floors.map((floor) => (
        <FloorGroup
          key={floor.meshName}
          meshName={floor.meshName}
          buildingId={floor.buildingId}
          originalPosition={floor.position}
          rotation={floor.rotation}
          scale={floor.scale}
          subMeshNodes={floor.subMeshNodes}
          floorIndex={floor.floorIndex}
          baseLift={floor.baseLift}
        />
      ))}
    </group>
  );
}
