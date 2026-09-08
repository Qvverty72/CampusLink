/**
 * CampusLink MVP — Camera Controller
 *
 * Runs inside the R3F Canvas. Responsibilities:
 * 1. Read gesture state from shared ref → update camera position (spherical coords)
 * 2. Apply inertia/damping after gesture release
 * 3. Animate camera zoom to selected building
 * 4. Animate back to the campus overview when the selection is closed
 * 5. Process pending taps → raycast for mesh selection
 *
 * DESIGN NOTES:
 * - Camera position is computed from spherical coordinates every frame
 * - All state is in refs (no React state updates in the render loop)
 * - Mesh selection is done via manual raycasting, not onPointerDown
 */

import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';
import { useMapStore } from '@/three/store/mapStore';
import { buildingConfigs, getBuildingForMesh } from '@/three/data/floors';
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

export function CameraController({ gestureState }: CameraControllerProps) {
  const { camera, scene } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const ndcVec = useRef(new THREE.Vector2());

  // Zustand selectors
  const selectedBuilding = useMapStore((s) => s.selectedBuilding);
  const isExploded = useMapStore((s) => s.isExploded);
  const isFloorModalOpen = useMapStore((s) => s.isFloorModalOpen);
  const selectBuilding = useMapStore((s) => s.selectBuilding);
  const selectFloor = useMapStore((s) => s.selectFloor);

  // Animation state (all refs — no re-renders)
  const isAnimating = useRef(false);
  const animTheta = useRef(INITIAL.theta);
  const animPhi = useRef(INITIAL.phi);
  const animRadius = useRef(INITIAL.radius);
  const animTarget = useRef(INITIAL.target.clone());
  const animationElapsed = useRef(0);
  const previousSelectedBuilding = useRef<BuildingId | null>(null);

  // ─── Animate to building when selected ──────────────────────────────────

  useEffect(() => {
    if (selectedBuilding && buildingConfigs[selectedBuilding]) {
      const config = buildingConfigs[selectedBuilding];
      const focusPos = new THREE.Vector3(...config.focusPosition);
      const focusTarget = new THREE.Vector3(...config.focusTarget);
      const offset = focusPos.clone().sub(focusTarget);

      const r = offset.length();
      const phi = Math.acos(Math.max(-1, Math.min(1, offset.y / r)));
      const theta = Math.atan2(offset.x, offset.z);

      animRadius.current = r;
      animPhi.current = clampCameraPhi(phi);
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

    gestureState.current.velocityTheta = 0;
    gestureState.current.velocityPhi = 0;
    previousSelectedBuilding.current = selectedBuilding;
  }, [selectedBuilding]);

  // ─── Per-frame update ───────────────────────────────────────────────────

  useFrame((_, delta) => {
    const gs = gestureState.current;

    // Manual rotation or zoom always takes priority over an automatic transition.
    if (gs.isGesturing && isAnimating.current) {
      isAnimating.current = false;
      animationElapsed.current = 0;
    }

    // 1. Programmatic camera animation (lerp towards target)
    if (isAnimating.current) {
      animationElapsed.current += delta;
      const factor = 1 - Math.exp(-CAMERA_ANIM_SPEED * delta);
      gs.theta = THREE.MathUtils.lerp(gs.theta, animTheta.current, factor);
      gs.phi = THREE.MathUtils.lerp(gs.phi, animPhi.current, factor);
      gs.radius = THREE.MathUtils.lerp(gs.radius, animRadius.current, factor);
      gs.targetX = THREE.MathUtils.lerp(gs.targetX, animTarget.current.x, factor);
      gs.targetY = THREE.MathUtils.lerp(gs.targetY, animTarget.current.y, factor);
      gs.targetZ = THREE.MathUtils.lerp(gs.targetZ, animTarget.current.z, factor);

      // Animation completes only after the full view reaches its destination.
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

    // 2. Apply inertia damping when not actively gesturing or animating
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

    // Absolute safety limit for gestures, inertia and programmatic animations.
    gs.phi = clampCameraPhi(gs.phi);

    // 3. Compute camera position from spherical coordinates
    const sinPhi = Math.sin(gs.phi);
    const cosPhi = Math.cos(gs.phi);
    const sinTheta = Math.sin(gs.theta);
    const cosTheta = Math.cos(gs.theta);

    camera.position.x = gs.targetX + gs.radius * sinPhi * sinTheta;
    camera.position.y = gs.targetY + gs.radius * cosPhi;
    camera.position.z = gs.targetZ + gs.radius * sinPhi * cosTheta;
    camera.lookAt(gs.targetX, gs.targetY, gs.targetZ);

    // 4. Process pending tap → raycast for mesh selection
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
          // If another building is selected, ignore until the current view is closed.
        }
      }
    }

  });

  // This component renders nothing — it only drives the camera
  return null;
}
