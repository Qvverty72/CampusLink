/**
 * Controla cámara y selección dentro del Canvas de React Three Fiber.
 *
 * Consume gestos escritos por React Native en una ref compartida, calcula la cámara
 * en coordenadas esféricas, aplica inercia/transiciones y procesa taps con raycast.
 * Las refs evitan provocar renders React a 60 FPS; Zustand se usa solo para cambios
 * semánticos como seleccionar un edificio o abrir un piso.
 */

import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';
import { useMapStore } from '@/three/store/mapStore';
import { useMapDataStore } from '@/three/store/mapDataStore';
import type { BuildingId } from '@/three/types/map';
import type { CameraGestureState } from '@/three/components/CampusMap';
import { clampCameraPhi } from './cameraConfig';

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Speed of programmatic camera animation */
const CAMERA_ANIM_SPEED = 4;

/** Safety limit so an automatic camera transition can never hold input forever. */
const MAX_CAMERA_ANIMATION_SECONDS = 2;

/** Inertia decay factor (0-1, lower = more friction) */
const DAMPING_FACTOR = 0.92;

/** Initial camera overview parameters */
const INITIAL = {
  theta: Math.PI / 4,
  phi: 0.85,
  radius: 0.8,
  target: new THREE.Vector3(0.15, 0, 0.2),
};

/** Returns the equivalent target angle reached through the shortest rotation. */
function getNearestEquivalentAngle(target: number, current: number): number {
  const shortestDelta = Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current)
  );
  return current + shortestDelta;
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface CameraControllerProps {
  gestureState: React.MutableRefObject<CameraGestureState>;
}

/**
 * Adaptador entre la interacción 2D de la pantalla y la escena 3D.
 * No renderiza objetos: muta la cámara activa y publica selecciones en el store.
 */
export function CameraController({ gestureState }: CameraControllerProps) {
  const { camera, scene } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const ndcVec = useRef(new THREE.Vector2());

  // Selectores independientes mantienen separada la interacción semántica del
  // mapa de la información de alta frecuencia guardada en `gestureState`.
  const selectedBuilding = useMapStore((s) => s.selectedBuilding);
  const isExploded = useMapStore((s) => s.isExploded);
  const isFloorModalOpen = useMapStore((s) => s.isFloorModalOpen);
  const selectBuilding = useMapStore((s) => s.selectBuilding);
  const selectFloor = useMapStore((s) => s.selectFloor);
  const buildingConfigs = useMapDataStore(
    (s) => s.data?.buildingConfigs
  );

  // Destinos y progreso de cámara viven en refs porque cambian dentro de useFrame.
  const isAnimating = useRef(false);
  const animTheta = useRef(INITIAL.theta);
  const animPhi = useRef(INITIAL.phi);
  const animRadius = useRef(INITIAL.radius);
  const animTarget = useRef(INITIAL.target.clone());
  const animationElapsed = useRef(0);
  const previousSelectedBuilding = useRef<BuildingId | null>(null);

  // ─── Animate to building when selected ──────────────────────────────────

  useEffect(() => {
    const config = selectedBuilding
      ? buildingConfigs?.[selectedBuilding]
      : undefined;

    if (config) {
      const focusPos = new THREE.Vector3(...config.focusPosition);
      const focusTarget = new THREE.Vector3(...config.focusTarget);
      const offset = focusPos.clone().sub(focusTarget);

      // La configuración expresa posición/target cartesianos en world space. Se
      // convierten a radio/phi/theta porque ese es el modelo que usan los gestos.
      const r = offset.length();
      const phi = Math.acos(Math.max(-1, Math.min(1, offset.y / r)));
      const theta = Math.atan2(offset.x, offset.z);

      animRadius.current = r;
      animPhi.current = clampCameraPhi(phi);
      // Dos ángulos separados por 2π representan la misma vista; elegir el más
      // cercano evita que la cámara dé una vuelta completa al enfocar.
      animTheta.current = getNearestEquivalentAngle(
        theta,
        gestureState.current.theta
      );
      animTarget.current.copy(focusTarget);
      animationElapsed.current = 0;
      isAnimating.current = true;
    } else if (previousSelectedBuilding.current) {
      animTheta.current = getNearestEquivalentAngle(
        INITIAL.theta,
        gestureState.current.theta
      );
      animPhi.current = INITIAL.phi;
      animRadius.current = INITIAL.radius;
      animTarget.current.copy(INITIAL.target);
      animationElapsed.current = 0;
      isAnimating.current = true;

      gestureState.current.isGesturing = false;
      gestureState.current.gestureType = 'none';
      gestureState.current.hasPendingTap = false;
    }

    // Una transición programática cancela la inercia anterior para que no compita
    // con el nuevo destino de cámara.
    gestureState.current.velocityTheta = 0;
    gestureState.current.velocityPhi = 0;
    previousSelectedBuilding.current = selectedBuilding;
  }, [buildingConfigs, gestureState, selectedBuilding]);

  // ─── Per-frame update ───────────────────────────────────────────────────

  useFrame((_, delta) => {
    const gs = gestureState.current;

    // Un gesto manual siempre tiene prioridad y toma control desde la posición
    // interpolada actual, evitando saltos al interrumpir una transición.
    if (gs.isGesturing && isAnimating.current) {
      isAnimating.current = false;
      animationElapsed.current = 0;
    }

    // 1. Interpola todos los componentes de la vista, incluido el look-at target.
    if (isAnimating.current) {
      animationElapsed.current += delta;
      const factor = 1 - Math.exp(-CAMERA_ANIM_SPEED * delta);
      gs.theta = THREE.MathUtils.lerp(gs.theta, animTheta.current, factor);
      gs.phi = THREE.MathUtils.lerp(gs.phi, animPhi.current, factor);
      gs.radius = THREE.MathUtils.lerp(gs.radius, animRadius.current, factor);
      gs.targetX = THREE.MathUtils.lerp(gs.targetX, animTarget.current.x, factor);
      gs.targetY = THREE.MathUtils.lerp(gs.targetY, animTarget.current.y, factor);
      gs.targetZ = THREE.MathUtils.lerp(gs.targetZ, animTarget.current.z, factor);

      // Radio, orientación y target deben converger juntos. El timeout impide que
      // errores de precisión mantengan la interacción bloqueada indefinidamente.
      const targetDistance = Math.sqrt(
        (gs.targetX - animTarget.current.x) ** 2 +
        (gs.targetY - animTarget.current.y) ** 2 +
        (gs.targetZ - animTarget.current.z) ** 2
      );
      const didConverge =
        Math.abs(gs.radius - animRadius.current) < 0.003 &&
        Math.abs(gs.theta - animTheta.current) < 0.003 &&
        Math.abs(gs.phi - animPhi.current) < 0.003 &&
        targetDistance < 0.003;

      if (
        didConverge ||
        animationElapsed.current >= MAX_CAMERA_ANIMATION_SECONDS
      ) {
        gs.theta = animTheta.current;
        gs.phi = animPhi.current;
        gs.radius = animRadius.current;
        gs.targetX = animTarget.current.x;
        gs.targetY = animTarget.current.y;
        gs.targetZ = animTarget.current.z;
        animationElapsed.current = 0;
        isAnimating.current = false;
      }
    }

    // 2. Continúa brevemente el movimiento al soltar y reduce su velocidad por frame.
    if (!gs.isGesturing && !isAnimating.current) {
      if (Math.abs(gs.velocityTheta) > 0.0001 || Math.abs(gs.velocityPhi) > 0.0001) {
        gs.theta += gs.velocityTheta;
        const nextPhi = gs.phi + gs.velocityPhi;
        gs.phi = clampCameraPhi(nextPhi);
        if (gs.phi !== nextPhi) gs.velocityPhi = 0;
        gs.velocityTheta *= DAMPING_FACTOR;
        gs.velocityPhi *= DAMPING_FACTOR;
        if (Math.abs(gs.velocityTheta) < 0.00005) gs.velocityTheta = 0;
        if (Math.abs(gs.velocityPhi) < 0.00005) gs.velocityPhi = 0;
      }
    }

    // El clamp final cubre todas las fuentes de cambio y evita cruzar bajo el terreno.
    gs.phi = clampCameraPhi(gs.phi);

    // 3. Convierte radio/phi/theta a world space alrededor del target actual.
    const sinPhi = Math.sin(gs.phi);
    const cosPhi = Math.cos(gs.phi);
    const sinTheta = Math.sin(gs.theta);
    const cosTheta = Math.cos(gs.theta);

    camera.position.x = gs.targetX + gs.radius * sinPhi * sinTheta;
    camera.position.y = gs.targetY + gs.radius * cosPhi;
    camera.position.z = gs.targetZ + gs.radius * sinPhi * cosTheta;
    camera.lookAt(gs.targetX, gs.targetY, gs.targetZ);

    // 4. Convierte el tap NDC en un rayo desde la cámara y busca el primer mesh
    // interactivo. FloorGroup marca esos meshes mediante `userData.isFloor`.
    if (gs.hasPendingTap) {
      gs.hasPendingTap = false;

      if (!isFloorModalOpen) {
        ndcVec.current.set(gs.tapX, gs.tapY);
        raycaster.current.setFromCamera(ndcVec.current, camera);
        const intersects = raycaster.current.intersectObjects(scene.children, true);

        // Find the first intersected floor mesh
        const hit = intersects.find(
          (i) => i.object.userData && i.object.userData.isFloor
        );

        if (hit) {
          const meshName: string = hit.object.userData.meshName;
          const buildingId = hit.object.userData.buildingId as BuildingId;

          if (selectedBuilding === buildingId && isExploded) {
            // Building already exploded → select this floor
            selectFloor(meshName);
          } else if (!selectedBuilding) {
            // No building selected → select this building
            selectBuilding(buildingId);
          }
          // Si hay otro edificio activo se ignora el hit: primero debe cerrarse la
          // vista actual para mantener una única selección/explosión consistente.
        }
      }
    }

  });

  // Es un componente de control dentro del render loop; no agrega geometría al scene.
  return null;
}
