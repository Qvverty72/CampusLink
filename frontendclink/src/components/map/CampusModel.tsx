/**
 * CampusLink MVP — CampusModel (3D Scene Component)
 *
 * Renders all meshes from the GLB model.
 * Handles:
 * - Multi-mesh floor groups (each floor = N sub-meshes)
 * - Explosion animation (vertical separation of floors)
 * - Dynamic rendering from floorMeshConfigs data
 *
 * Mesh selection is handled via raycast in CameraController, NOT here.
 * Each sub-mesh in a floor group has `userData.isFloor = true`.
 *
 * ARCHITECTURE:
 * - FloorGroup: wraps a floor's sub-meshes, handles Y animation
 * - CampusModelScene: renders all floors + decorative elements
 *
 * CRITICAL RULES:
 * - Never use cumulative offsets (group.position.y += x)
 * - Always compute: originalY + offset
 * - Preserve original positions from GLB
 */

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';
import { useCampusGLTF } from '@/models/CampusModel';
import { useMapStore } from '@/store/mapStore';
import {
  floorMeshConfigs,
  getFloorIndex,
} from '@/data/floors';

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Vertical spacing between exploded floors (world units) */
const EXPLOSION_SPACING = 0.04;

/** Smaller spacing for hbuilding (8 floors) to avoid excessive spread */
const EXPLOSION_SPACING_HBUILDING = 0.025;

/** Lerp speed factor (multiplied by delta for frame independence) */
const LERP_SPEED = 5;

// ─── FloorGroup Component ──────────────────────────────────────────────────────

interface FloorGroupProps {
  meshName: string;
  buildingId: string;
  originalPosition: [number, number, number];
  subMeshNodes: Array<{ name: string; geometry: THREE.BufferGeometry; material: THREE.Material }>;
}

/**
 * A floor group wraps multiple sub-meshes that together form one floor.
 * It animates the group's Y position for the explosion effect.
 * Each child mesh has userData for raycast selection.
 */
const FloorGroup = React.memo(function FloorGroup({
  meshName,
  buildingId,
  originalPosition,
  subMeshNodes,
}: FloorGroupProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Only subscribe to what's needed for animation
  const selectedBuilding = useMapStore((s) => s.selectedBuilding);
  const isExploded = useMapStore((s) => s.isExploded);

  const floorIndex = useMemo(() => getFloorIndex(meshName), [meshName]);

  // Calculate target Y position
  const targetY = useMemo(() => {
    if (!isExploded || selectedBuilding !== buildingId) {
      return originalPosition[1]; // Return to original
    }
    const spacing = buildingId === 'hbuilding' ? EXPLOSION_SPACING_HBUILDING : EXPLOSION_SPACING;
    return originalPosition[1] + floorIndex * spacing;
  }, [isExploded, selectedBuilding, buildingId, floorIndex, originalPosition]);

  // Animate Y position via lerp
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

// ─── Main Campus Model ─────────────────────────────────────────────────────────

export function CampusModelScene() {
  const { nodes, materials } = useCampusGLTF();

  // Build floor data from configs + GLB nodes
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
    <group dispose={null}>
      {/* ── Base terrain (3 sub-meshes, not interactive) ──────────────── */}
      <group position={[0.15574466, 0.00650109, 0.20599128]} scale={0.40954831}>
        <mesh geometry={nodes.Plane.geometry} material={materials.CL_Cesped} />
        <mesh geometry={nodes.Plane_1.geometry} material={materials.CL_Talud} />
        <mesh geometry={nodes.Plane_2.geometry} material={materials.CL_Pavimento} />
      </group>

      {/* ── All floor groups (dynamic from config) ───────────────────── */}
      {floors.map((floor) => (
        <FloorGroup
          key={floor.meshName}
          meshName={floor.meshName}
          buildingId={floor.buildingId}
          originalPosition={floor.position}
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

      {/* ── Road ──────────────────────────────────────────────────────── */}
      <group
        position={[0.17052113, -0.00980953, 0.59327275]}
        rotation={[-Math.PI / 2, -0.00033037, -0.01135986]}
        scale={[0.02392408, 0.02392408, 0.00039873]}
      >
        <mesh geometry={nodes.RoadFullNoSideWalks_Material001_0004.geometry} material={materials['Material.005']} />
        <mesh geometry={nodes.RoadFullNoSideWalks_Material001_0004_1.geometry} material={materials['Material.006']} />
        <mesh geometry={nodes.RoadFullNoSideWalks_Material001_0004_2.geometry} material={materials['Material.002']} />
        <mesh geometry={nodes.RoadFullNoSideWalks_Material001_0004_3.geometry} material={materials['Material.001']} />
        <mesh geometry={nodes.RoadFullNoSideWalks_Material001_0004_4.geometry} material={materials['Material.003']} />
        <mesh geometry={nodes.RoadFullNoSideWalks_Material001_0004_5.geometry} material={materials['Material.004']} />
        <mesh geometry={nodes.RoadFullNoSideWalks_Material001_0004_6.geometry} material={materials['Material.007']} />
        <mesh geometry={nodes.RoadFullNoSideWalks_Material001_0004_7.geometry} material={materials['Material.008']} />
        <mesh geometry={nodes.RoadFullNoSideWalks_Material001_0004_8.geometry} material={materials['Material.018']} />
        <mesh geometry={nodes.RoadFullNoSideWalks_Material001_0004_9.geometry} material={materials['Material.017']} />
      </group>

      {/* ── Trees ─────────────────────────────────────────────────────── */}
      <group
        position={[0.29272145, 0.01692664, 0.23237571]}
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
        <mesh geometry={nodes._9_tree__9_tree_0008_15.geometry} material={materials['9_tree.002']} />
        <mesh geometry={nodes._9_tree__9_tree_0008_16.geometry} material={materials['12_tree.002']} />
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

      {/* ── Rock walkway ──────────────────────────────────────────────── */}
      <mesh
        geometry={nodes.rockwalk.geometry}
        material={materials['PathRocks.001']}
        position={[0.04337397, -0.01008, 0.34504941]}
        rotation={[-Math.PI, 0.84153697, -Math.PI]}
        scale={0.00738812}
      />
    </group>
  );
}
