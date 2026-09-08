/**
 * CampusLink — typed loader for the current campus model.
 *
 * The interactive scene reads floor node names from data/floors.ts. Keeping the
 * GLTF maps indexed makes this loader resilient to Blender adding suffixed mesh
 * names whenever a building or floor is separated.
 */

import * as THREE from 'three';
import { useGLTF } from '@react-three/drei/native';
import type { GLTF } from 'three-stdlib';

export type GLTFResult = GLTF & {
  nodes: Record<string, THREE.Mesh>;
  materials: Record<string, THREE.Material>;
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const modelAsset = require('../../../assets/models/modelomejoradojunto.glb');

/** Loads the campus GLTF and exposes its meshes and materials. */
export function useCampusGLTF() {
  return useGLTF(modelAsset) as unknown as GLTFResult;
}

/** Starts downloading and parsing the campus model before the map is opened. */
export function preloadCampusGLTF() {
  useGLTF.preload(modelAsset);
}
