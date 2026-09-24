/**
 * Ensambla la escena visible usando geometría/materiales del GLB y configuración
 * lógica de `floors.ts`.
 *
 * `FloorGroup` convierte varios submeshes en un piso seleccionable y animable.
 * `CampusModelScene` añade esos pisos junto con terreno y decoración estática.
 * La selección no ocurre aquí: `CameraController` hace raycast sobre el `userData`
 * que este componente adjunta a cada mesh interactivo.
 */

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';
import { useCampusGLTF } from '@/three/models/CampusModel';
import { useMapStore } from '@/three/store/mapStore';
import type { BuildingId } from '@/three/types/map';
import {
  floorMeshConfigs,
  getFloorIndex,
} from '@/three/data/floors';

// ─── Constants ─────────────────────────────────────────────────────────────────

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

/** Elevación inicial necesaria para que las cabañas no intersecten el terreno. */
const CABIN_EXPLOSION_BASE_LIFT = 0.03;

/** Velocidad del lerp; se combina con delta para no depender del framerate. */
const LERP_SPEED = 5;

// ─── FloorGroup Component ──────────────────────────────────────────────────────

interface FloorGroupProps {
  meshName: string;
  buildingId: BuildingId;
  originalPosition: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  subMeshNodes: Array<{ name: string; geometry: THREE.BufferGeometry; material: THREE.Material }>;
}

/**
 * Renderiza un piso como un group compuesto por varios submeshes del GLB.
 *
 * El group conserva el transform original y modifica solo su Y durante el
 * exploded view. Así geometría, materiales y futuros POI del piso se desplazan
 * como una sola unidad lógica aunque Blender los haya exportado por separado.
 */
const FloorGroup = React.memo(function FloorGroup({
  meshName,
  buildingId,
  originalPosition,
  rotation,
  scale,
  subMeshNodes,
}: FloorGroupProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Cada piso se suscribe solo a los campos que afectan su posición; el resto del
  // store no debe provocar rerenders de toda la geometría.
  const selectedBuilding = useMapStore((s) => s.selectedBuilding);
  const isExploded = useMapStore((s) => s.isExploded);

  const floorIndex = useMemo(() => getFloorIndex(meshName), [meshName]);

  // El destino siempre se calcula desde el Y original. Evitar offsets acumulativos
  // impide que abrir/cerrar repetidamente desplace el modelo fuera de su posición.
  const targetY = useMemo(() => {
    if (!isExploded || selectedBuilding !== buildingId) {
      return originalPosition[1]; // Return to original
    }
    const spacing = EXPLOSION_SPACING_BY_BUILDING[buildingId];
    const baseLift = buildingId.startsWith('cabin') ? CABIN_EXPLOSION_BASE_LIFT : 0;
    return originalPosition[1] + baseLift + floorIndex * spacing;
  }, [isExploded, selectedBuilding, buildingId, floorIndex, originalPosition]);

  // La interpolación exponencial produce una velocidad consistente entre equipos
  // con distinto framerate sin guardar la animación en estado React.
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
    }
  });

  return (
    <group
      ref={groupRef}
      position={[originalPosition[0], originalPosition[1], originalPosition[2]]}
      rotation={rotation}
      scale={scale}
    >
      {/* El transform vive en el group; cada mesh hijo aporta solo su geometría y
          material. `userData` crea el puente que consume el raycast de selección. */}
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

// ─── Main Campus Model ─────────────────────────────────────────────────────────

/**
 * Resuelve la configuración de pisos contra los nodos cargados del GLB y monta la
 * escena completa. Los elementos decorativos no reciben `isFloor`, por lo que un
 * raycast puede atravesarlos pero nunca los convierte en una selección lógica.
 */
export function CampusModelScene() {
  const { nodes, materials } = useCampusGLTF();

  // Convierte nombres de submesh declarados en configuración en referencias reales
  // de geometry/material. Esta unión separa metadata mutable de geometría local.
  const floors = useMemo(() => {
    return floorMeshConfigs.map((config) => {
      const subMeshNodes = config.subMeshes
        .map((nodeName) => {
          const node = (nodes as Record<string, THREE.Mesh>)[nodeName];
          if (!node || !('geometry' in node)) return null;
          return {
            name: nodeName,
            geometry: node.geometry as THREE.BufferGeometry,
            material: node.material as THREE.Material,
          };
        })
        .filter((n): n is NonNullable<typeof n> => n !== null);

      return {
        ...config,
        subMeshNodes,
      };
    });
  }, [nodes]);

  return (
    // `dispose={null}` evita liberar recursos compartidos que useGLTF mantiene en
    // caché y que pueden reutilizarse al salir y volver a entrar a la pantalla.
    <group dispose={null}>
      {/* ── Base terrain (3 sub-meshes, not interactive) ──────────────── */}
      <group position={[0.15574466, 0.00650109, 0.20599128]} scale={0.40954831}>
        <mesh geometry={nodes.Plane.geometry} material={materials.CL_Cesped} />
        <mesh geometry={nodes.Plane_1.geometry} material={materials.CL_Talud} />
        <mesh geometry={nodes.Plane_2.geometry} material={materials.CL_Pavimento} />
      </group>

      {/* Los pisos son dinámicos desde la configuración; terreno y decoración
          continúan acoplados explícitamente a nodos fijos del GLB local. */}
      {floors.map((floor) => (
        <FloorGroup
          key={floor.meshName}
          meshName={floor.meshName}
          buildingId={floor.buildingId}
          originalPosition={floor.position}
          rotation={floor.rotation}
          scale={floor.scale}
          subMeshNodes={floor.subMeshNodes}
        />
      ))}

      {/* ── Cabins walkway (decorative, not interactive) ──────────────── */}
      <group position={[0.11178111, 0.09316424, 0.01925423]}>
        <mesh geometry={nodes.cabins_walkway_floor2_Mesh.geometry} material={materials['CL_Hormigon.001']} />
        <mesh geometry={nodes.cabins_walkway_floor2_Mesh_1.geometry} material={materials['CL_Madera.001']} />
        <mesh geometry={nodes.cabins_walkway_floor2_Mesh_2.geometry} material={materials['CL_Cubierta.001']} />
        <mesh geometry={nodes.cabins_walkway_floor2_Mesh_3.geometry} material={materials['CL_Estuco.001']} />
        <mesh geometry={nodes.cabins_walkway_floor2_Mesh_4.geometry} material={materials.CL_Ribete_chapa} />
      </group>

      {/* ── Trees ─────────────────────────────────────────────────────── */}
      <group
        position={[0.12381645, 0.05227022, 0.12459003]}
        rotation={[-Math.PI / 2, -1.2e-7, -Math.PI / 2]}
        scale={0.00199722}
      >
        <mesh geometry={nodes._9_tree__9_tree_0008.geometry} material={materials['9_tree.003']} />
        <mesh geometry={nodes._9_tree__9_tree_0008_1.geometry} material={materials['6_tree.003']} />
        <mesh geometry={nodes._9_tree__9_tree_0008_2.geometry} material={materials['4_tree.003']} />
        <mesh geometry={nodes._9_tree__9_tree_0008_3.geometry} material={materials['7_tree.003']} />
        <mesh geometry={nodes._9_tree__9_tree_0008_4.geometry} material={materials['3_tree.003']} />
        <mesh geometry={nodes._9_tree__9_tree_0008_5.geometry} material={materials['8_tree.002']} />
        <mesh geometry={nodes._9_tree__9_tree_0008_6.geometry} material={materials['3_tree.002']} />
        <mesh geometry={nodes._9_tree__9_tree_0008_7.geometry} material={materials['7_tree.002']} />
        <mesh geometry={nodes._9_tree__9_tree_0008_8.geometry} material={materials['4_tree.002']} />
        <mesh geometry={nodes._9_tree__9_tree_0008_9.geometry} material={materials['6_tree.002']} />
        <mesh geometry={nodes._9_tree__9_tree_0008_10.geometry} material={materials['4_tree.005']} />
        <mesh geometry={nodes._9_tree__9_tree_0008_11.geometry} material={materials['7_tree.005']} />
        <mesh geometry={nodes._9_tree__9_tree_0008_12.geometry} material={materials['3_tree.005']} />
        <mesh geometry={nodes._9_tree__9_tree_0008_13.geometry} material={materials['6_tree.005']} />
        <mesh geometry={nodes._9_tree__9_tree_0008_14.geometry} material={materials['8_tree.004']} />
        <mesh geometry={nodes._9_tree__9_tree_0008_15.geometry} material={materials['12_tree.002']} />
        <mesh geometry={nodes._9_tree__9_tree_0008_16.geometry} material={materials['9_tree.002']} />
      </group>

      {/* ── Sports field ──────────────────────────────────────────────── */}
      <group position={[0.26633492, -0.00038007, 0.29866001]} scale={0.04947871}>
        <mesh geometry={nodes.Plane002.geometry} material={materials['Material.009']} />
        <mesh geometry={nodes.Plane002_1.geometry} material={materials.Goal_Material} />
      </group>

      {/* ── Structure near gym ────────────────────────────────────────── */}
      <group
        position={[0.38647196, 0.00453778, 0.46089113]}
        rotation={[-Math.PI, 1.56773362, -Math.PI]}
        scale={[0.0052582, 0.00525821, 0.00525821]}
      >
        <mesh geometry={nodes.Object_3.geometry} material={materials['Material.014']} />
        <mesh geometry={nodes.Object_3_1.geometry} material={materials['Material.011']} />
        <mesh geometry={nodes.Object_3_2.geometry} material={materials['Material.012']} />
        <mesh geometry={nodes.Object_3_3.geometry} material={materials['Material.013']} />
        <mesh geometry={nodes.Object_3_4.geometry} material={materials['Material.010']} />
      </group>

      {/* ── Entrance curves ───────────────────────────────────────────── */}
      <group position={[0.17781176, -0.00931277, 0.46023273]} scale={0.18593901}>
        <mesh geometry={nodes.Curve006.geometry} material={materials.SVGMat} />
        <mesh geometry={nodes.Curve006_1.geometry} material={materials.Material} />
      </group>

      {/* ── Rock walkway / road ───────────────────────────────────────── */}
      <group
        position={[0.01802168, -0.00956216, 0.38782692]}
        rotation={[-Math.PI, 1.46606875, -Math.PI]}
        scale={0.00738812}
      >
        <mesh geometry={nodes.RockPath_Round_Wide013.geometry} material={materials['PathRocks.001']} />
        <mesh geometry={nodes.RockPath_Round_Wide013_1.geometry} material={materials['Material.005']} />
        <mesh geometry={nodes.RockPath_Round_Wide013_2.geometry} material={materials['Material.006']} />
        <mesh geometry={nodes.RockPath_Round_Wide013_3.geometry} material={materials['Material.002']} />
        <mesh geometry={nodes.RockPath_Round_Wide013_4.geometry} material={materials['Material.001']} />
        <mesh geometry={nodes.RockPath_Round_Wide013_5.geometry} material={materials['Material.018']} />
        <mesh geometry={nodes.RockPath_Round_Wide013_6.geometry} material={materials['Material.017']} />
        <mesh geometry={nodes.RockPath_Round_Wide013_7.geometry} material={materials['Material.003']} />
        <mesh geometry={nodes.RockPath_Round_Wide013_8.geometry} material={materials['Material.004']} />
        <mesh geometry={nodes.RockPath_Round_Wide013_9.geometry} material={materials['Material.007']} />
        <mesh geometry={nodes.RockPath_Round_Wide013_10.geometry} material={materials['Material.008']} />
      </group>
    </group>
  );
}
