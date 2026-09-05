/**
 * CampusLink MVP — GLTF Model (adapted from gltfjsx)
 *
 * This file is derived from the auto-generated gltfjsx component.
 * It loads the campus GLB and exposes nodes/materials for the CampusModel component.
 *
 * UPDATED for Modeloconmeshjunto.glb:
 * - New multi-mesh floor groups
 * - New material names (CL_ prefix)
 * - 3 separate cabin buildings
 */

import * as THREE from 'three';
import { useGLTF } from '@react-three/drei/native';
import type { GLTF } from 'three-stdlib';

export type GLTFResult = GLTF & {
  nodes: {
    // Terrain
    Plane: THREE.Mesh;
    Plane_1: THREE.Mesh;
    Plane_2: THREE.Mesh;

    // Cabin 01
    cabin01_floor1_Mesh: THREE.Mesh;
    cabin01_floor1_Mesh_1: THREE.Mesh;
    cabin01_floor1_Mesh_2: THREE.Mesh;
    cabin01_floor1_Mesh_3: THREE.Mesh;
    cabin01_floor1_Mesh_4: THREE.Mesh;
    cabin01_floor2_Mesh: THREE.Mesh;
    cabin01_floor2_Mesh_1: THREE.Mesh;
    cabin01_floor2_Mesh_2: THREE.Mesh;
    cabin01_floor2_Mesh_3: THREE.Mesh;
    cabin01_floor2_Mesh_4: THREE.Mesh;
    cabin01_floor2_Mesh_5: THREE.Mesh;

    // Cabin 02
    cabin02_floor1_Mesh: THREE.Mesh;
    cabin02_floor1_Mesh_1: THREE.Mesh;
    cabin02_floor1_Mesh_2: THREE.Mesh;
    cabin02_floor1_Mesh_3: THREE.Mesh;
    cabin02_floor1_Mesh_4: THREE.Mesh;
    cabin02_floor2_Mesh: THREE.Mesh;
    cabin02_floor2_Mesh_1: THREE.Mesh;
    cabin02_floor2_Mesh_2: THREE.Mesh;
    cabin02_floor2_Mesh_3: THREE.Mesh;
    cabin02_floor2_Mesh_4: THREE.Mesh;
    cabin02_floor2_Mesh_5: THREE.Mesh;

    // Cabin 03
    cabin03_floor1_Mesh: THREE.Mesh;
    cabin03_floor1_Mesh_1: THREE.Mesh;
    cabin03_floor1_Mesh_2: THREE.Mesh;
    cabin03_floor1_Mesh_3: THREE.Mesh;
    cabin03_floor1_Mesh_4: THREE.Mesh;
    cabin03_floor2_Mesh: THREE.Mesh;
    cabin03_floor2_Mesh_1: THREE.Mesh;
    cabin03_floor2_Mesh_2: THREE.Mesh;
    cabin03_floor2_Mesh_3: THREE.Mesh;
    cabin03_floor2_Mesh_4: THREE.Mesh;
    cabin03_floor2_Mesh_5: THREE.Mesh;

    // Cabins walkway
    cabins_walkway_floor2_Mesh: THREE.Mesh;
    cabins_walkway_floor2_Mesh_1: THREE.Mesh;
    cabins_walkway_floor2_Mesh_2: THREE.Mesh;
    cabins_walkway_floor2_Mesh_3: THREE.Mesh;
    cabins_walkway_floor2_Mesh_4: THREE.Mesh;

    // Road
    RoadFullNoSideWalks_Material001_0004: THREE.Mesh;
    RoadFullNoSideWalks_Material001_0004_1: THREE.Mesh;
    RoadFullNoSideWalks_Material001_0004_2: THREE.Mesh;
    RoadFullNoSideWalks_Material001_0004_3: THREE.Mesh;
    RoadFullNoSideWalks_Material001_0004_4: THREE.Mesh;
    RoadFullNoSideWalks_Material001_0004_5: THREE.Mesh;
    RoadFullNoSideWalks_Material001_0004_6: THREE.Mesh;
    RoadFullNoSideWalks_Material001_0004_7: THREE.Mesh;
    RoadFullNoSideWalks_Material001_0004_8: THREE.Mesh;
    RoadFullNoSideWalks_Material001_0004_9: THREE.Mesh;

    // CTI
    cti_floor1_Mesh001: THREE.Mesh;
    cti_floor1_Mesh001_1: THREE.Mesh;
    cti_floor1_Mesh001_2: THREE.Mesh;
    cti_floor1_Mesh001_3: THREE.Mesh;
    cti_floor1_Mesh001_4: THREE.Mesh;
    cti_floor1_Mesh001_5: THREE.Mesh;
    cti_floor1_Mesh001_6: THREE.Mesh;
    cti_floor1_Mesh001_7: THREE.Mesh;

    // E-Building
    ebuilding_floor1_Mesh: THREE.Mesh;
    ebuilding_floor1_Mesh_1: THREE.Mesh;
    ebuilding_floor1_Mesh_2: THREE.Mesh;
    ebuilding_floor1_Mesh_3: THREE.Mesh;
    ebuilding_floor1_Mesh_4: THREE.Mesh;
    ebuilding_floor2_Mesh: THREE.Mesh;
    ebuilding_floor2_Mesh_1: THREE.Mesh;
    ebuilding_floor2_Mesh_2: THREE.Mesh;
    ebuilding_floor2_Mesh_3: THREE.Mesh;
    ebuilding_floor2_Mesh_4: THREE.Mesh;
    ebuilding_floor3_Mesh: THREE.Mesh;
    ebuilding_floor3_Mesh_1: THREE.Mesh;
    ebuilding_floor3_Mesh_2: THREE.Mesh;
    ebuilding_floor3_Mesh_3: THREE.Mesh;
    ebuilding_floor3_Mesh_4: THREE.Mesh;
    ebuilding_floor4_Mesh: THREE.Mesh;
    ebuilding_floor4_Mesh_1: THREE.Mesh;
    ebuilding_floor4_Mesh_2: THREE.Mesh;
    ebuilding_floor4_Mesh_3: THREE.Mesh;
    ebuilding_floor4_Mesh_4: THREE.Mesh;
    ebuilding_floor5_Mesh: THREE.Mesh;
    ebuilding_floor5_Mesh_1: THREE.Mesh;
    ebuilding_floor5_Mesh_2: THREE.Mesh;
    ebuilding_floor5_Mesh_3: THREE.Mesh;
    ebuilding_floor5_Mesh_4: THREE.Mesh;

    // Trees
    _9_tree__9_tree_0008: THREE.Mesh;
    _9_tree__9_tree_0008_1: THREE.Mesh;
    _9_tree__9_tree_0008_2: THREE.Mesh;
    _9_tree__9_tree_0008_3: THREE.Mesh;
    _9_tree__9_tree_0008_4: THREE.Mesh;
    _9_tree__9_tree_0008_5: THREE.Mesh;
    _9_tree__9_tree_0008_6: THREE.Mesh;
    _9_tree__9_tree_0008_7: THREE.Mesh;
    _9_tree__9_tree_0008_8: THREE.Mesh;
    _9_tree__9_tree_0008_9: THREE.Mesh;
    _9_tree__9_tree_0008_10: THREE.Mesh;
    _9_tree__9_tree_0008_11: THREE.Mesh;
    _9_tree__9_tree_0008_12: THREE.Mesh;
    _9_tree__9_tree_0008_13: THREE.Mesh;
    _9_tree__9_tree_0008_14: THREE.Mesh;
    _9_tree__9_tree_0008_15: THREE.Mesh;
    _9_tree__9_tree_0008_16: THREE.Mesh;

    // Sports field
    Plane002: THREE.Mesh;
    Plane002_1: THREE.Mesh;

    // Structure near gym
    Object_3: THREE.Mesh;
    Object_3_1: THREE.Mesh;
    Object_3_2: THREE.Mesh;
    Object_3_3: THREE.Mesh;
    Object_3_4: THREE.Mesh;

    // Gym
    gym_floor1_Mesh001: THREE.Mesh;
    gym_floor1_Mesh001_1: THREE.Mesh;
    gym_floor1_Mesh001_2: THREE.Mesh;
    gym_floor1_Mesh001_3: THREE.Mesh;
    gym_floor1_Mesh001_4: THREE.Mesh;
    gym_floor1_Mesh001_5: THREE.Mesh;
    gym_floor1_Mesh001_6: THREE.Mesh;
    gym_floor1_Mesh001_7: THREE.Mesh;

    // H-Building
    hbuilding_floor1_Mesh: THREE.Mesh;
    hbuilding_floor1_Mesh_1: THREE.Mesh;
    hbuilding_floor1_Mesh_2: THREE.Mesh;
    hbuilding_floor1_Mesh_3: THREE.Mesh;
    hbuilding_floor1_Mesh_4: THREE.Mesh;
    hbuilding_floor2_Mesh: THREE.Mesh;
    hbuilding_floor2_Mesh_1: THREE.Mesh;
    hbuilding_floor2_Mesh_2: THREE.Mesh;
    hbuilding_floor2_Mesh_3: THREE.Mesh;
    hbuilding_floor2_Mesh_4: THREE.Mesh;
    hbuilding_floor3_Mesh: THREE.Mesh;
    hbuilding_floor3_Mesh_1: THREE.Mesh;
    hbuilding_floor3_Mesh_2: THREE.Mesh;
    hbuilding_floor3_Mesh_3: THREE.Mesh;
    hbuilding_floor3_Mesh_4: THREE.Mesh;
    hbuilding_floor3_Mesh_5: THREE.Mesh;
    hbuilding_floor4_Mesh: THREE.Mesh;
    hbuilding_floor4_Mesh_1: THREE.Mesh;
    hbuilding_floor4_Mesh_2: THREE.Mesh;
    hbuilding_floor4_Mesh_3: THREE.Mesh;
    hbuilding_floor4_Mesh_4: THREE.Mesh;
    hbuilding_floor4_Mesh_5: THREE.Mesh;
    hbuilding_floor5_Mesh: THREE.Mesh;
    hbuilding_floor5_Mesh_1: THREE.Mesh;
    hbuilding_floor5_Mesh_2: THREE.Mesh;
    hbuilding_floor5_Mesh_3: THREE.Mesh;
    hbuilding_floor5_Mesh_4: THREE.Mesh;
    hbuilding_floor5_Mesh_5: THREE.Mesh;
    hbuilding_floor6_Mesh: THREE.Mesh;
    hbuilding_floor6_Mesh_1: THREE.Mesh;
    hbuilding_floor6_Mesh_2: THREE.Mesh;
    hbuilding_floor6_Mesh_3: THREE.Mesh;
    hbuilding_floor6_Mesh_4: THREE.Mesh;
    hbuilding_floor6_Mesh_5: THREE.Mesh;
    hbuilding_floor7_Mesh: THREE.Mesh;
    hbuilding_floor7_Mesh_1: THREE.Mesh;
    hbuilding_floor7_Mesh_2: THREE.Mesh;
    hbuilding_floor7_Mesh_3: THREE.Mesh;
    hbuilding_floor7_Mesh_4: THREE.Mesh;
    hbuilding_floor8_Mesh: THREE.Mesh;
    hbuilding_floor8_Mesh_1: THREE.Mesh;
    hbuilding_floor8_Mesh_2: THREE.Mesh;
    hbuilding_floor8_Mesh_3: THREE.Mesh;
    hbuilding_floor8_Mesh_4: THREE.Mesh;

    // Entrance curves
    Curve006: THREE.Mesh;
    Curve006_1: THREE.Mesh;

    // Rock walkway
    rockwalk: THREE.Mesh;
  };
  materials: {
    CL_Cesped: THREE.MeshStandardMaterial;
    CL_Talud: THREE.MeshStandardMaterial;
    CL_Pavimento: THREE.MeshStandardMaterial;
    CL_Vidrio_azul: THREE.MeshStandardMaterial;
    CL_Madera: THREE.MeshStandardMaterial;
    CL_Cubierta: THREE.MeshStandardMaterial;
    CL_Estuco: THREE.MeshStandardMaterial;
    CL_Vidrio_variante: THREE.MeshStandardMaterial;
    CL_Aluminio: THREE.MeshStandardMaterial;
    ['CL_Hormigon.001']: THREE.MeshStandardMaterial;
    ['CL_Madera.001']: THREE.MeshStandardMaterial;
    ['CL_Cubierta.001']: THREE.MeshStandardMaterial;
    ['CL_Estuco.001']: THREE.MeshStandardMaterial;
    CL_Ribete_chapa: THREE.MeshStandardMaterial;
    ['Material.005']: THREE.MeshBasicMaterial;
    ['Material.006']: THREE.MeshBasicMaterial;
    ['Material.002']: THREE.MeshBasicMaterial;
    ['Material.001']: THREE.MeshBasicMaterial;
    ['Material.003']: THREE.MeshBasicMaterial;
    ['Material.004']: THREE.MeshBasicMaterial;
    ['Material.007']: THREE.MeshBasicMaterial;
    ['Material.008']: THREE.MeshBasicMaterial;
    ['Material.018']: THREE.MeshBasicMaterial;
    ['Material.017']: THREE.MeshBasicMaterial;
    ['CL_Vidrio_azul.001']: THREE.MeshStandardMaterial;
    ['CL_Aluminio.001']: THREE.MeshStandardMaterial;
    ['CL_Vidrio_variante.001']: THREE.MeshStandardMaterial;
    CL_Chapa_antracita: THREE.MeshStandardMaterial;
    CL_Marcos_marfil: THREE.MeshStandardMaterial;
    CL_Techo_zinc: THREE.MeshStandardMaterial;
    CL_Hormigon: THREE.MeshStandardMaterial;
    ['9_tree.003']: THREE.MeshStandardMaterial;
    ['6_tree.003']: THREE.MeshStandardMaterial;
    ['4_tree.003']: THREE.MeshStandardMaterial;
    ['7_tree.003']: THREE.MeshStandardMaterial;
    ['3_tree.003']: THREE.MeshStandardMaterial;
    ['8_tree.002']: THREE.MeshPhysicalMaterial;
    ['3_tree.002']: THREE.MeshStandardMaterial;
    ['7_tree.002']: THREE.MeshStandardMaterial;
    ['4_tree.002']: THREE.MeshStandardMaterial;
    ['6_tree.002']: THREE.MeshStandardMaterial;
    ['4_tree.005']: THREE.MeshStandardMaterial;
    ['7_tree.005']: THREE.MeshStandardMaterial;
    ['3_tree.005']: THREE.MeshStandardMaterial;
    ['6_tree.005']: THREE.MeshStandardMaterial;
    ['8_tree.004']: THREE.MeshPhysicalMaterial;
    ['9_tree.002']: THREE.MeshStandardMaterial;
    ['12_tree.002']: THREE.MeshStandardMaterial;
    ['Material.009']: THREE.MeshStandardMaterial;
    Goal_Material: THREE.MeshStandardMaterial;
    ['Material.014']: THREE.MeshStandardMaterial;
    ['Material.011']: THREE.MeshStandardMaterial;
    ['Material.012']: THREE.MeshStandardMaterial;
    ['Material.013']: THREE.MeshStandardMaterial;
    ['Material.010']: THREE.MeshStandardMaterial;
    CL_Celosia_grafito: THREE.MeshStandardMaterial;
    SVGMat: THREE.MeshStandardMaterial;
    Material: THREE.MeshStandardMaterial;
    ['PathRocks.001']: THREE.MeshStandardMaterial;
  };
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const modelAsset = require('../../assets/models/Modeloconmeshjunto.glb');

/**
 * Hook to load the campus GLTF model.
 * Returns typed nodes and materials for direct mesh access.
 */
export function useCampusGLTF() {
  const gltf = useGLTF(modelAsset) as unknown as GLTFResult;
  return gltf;
}
