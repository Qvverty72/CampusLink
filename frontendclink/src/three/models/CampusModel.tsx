/**
 * Carga tipada del GLB que contiene la geometría y los materiales del campus.
 *
 * El archivo permanece empaquetado en la aplicación: MongoDB no guarda triángulos,
 * texturas ni materiales. La configuración lógica indica qué nombres de nodo del
 * GLB forman cada piso y puede migrar a la API sin cambiar este asset local.
 */

import * as THREE from 'three';
import { useGLTF } from '@react-three/drei/native';
import type { GLTF } from 'three-stdlib';

export type GLTFResult = GLTF & {
  // El acceso por nombre permite resolver los `subMeshes` declarados en la
  // configuración sin generar una propiedad TypeScript por cada nodo del GLB.
  nodes: Record<string, THREE.Mesh>;
  materials: Record<string, THREE.Material>;
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
// `require` permite que Metro incluya el binario en el bundle y entregue a useGLTF
// una referencia de asset válida tanto en desarrollo como en builds nativos.
const modelAsset = require('../../../assets/models/modelomejoradojunto.glb');

/**
 * Devuelve el GLB parseado desde la caché de `useGLTF` para que la escena pueda
 * combinar geometría/materiales locales con la metadata del mapa.
 */
export function useCampusGLTF() {
  return useGLTF(modelAsset) as unknown as GLTFResult;
}

/**
 * Inicia la carga y el parseo antes de abrir el mapa para reducir el tiempo en que
 * el `Suspense` de la escena permanece sin contenido.
 */
export function preloadCampusGLTF() {
  useGLTF.preload(modelAsset);
}
