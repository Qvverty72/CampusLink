/**
 * CampusLink MVP — Camera Controller
 *
 * Runs inside the R3F Canvas. Responsibilities:
 * 1. Read gesture state from shared ref → update camera position (spherical coords)
 * 2. Apply inertia/damping after gesture release
 * 3. Animate camera zoom to selected building
 * 4. Detect zoom-out threshold → trigger building reunification
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
import { useMapStore } from '@/store/mapStore';
import { buildingConfigs, getBuildingForMesh } from '@/data/floors';
import type { BuildingId } from '@/types/map';
import type { CameraGestureState } from './CampusMap';

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Distance at which zooming out triggers building reunification */
const BUILDING_EXIT_DISTANCE = 0.65;

/** Speed of programmatic camera animation */
const CAMERA_ANIM_SPEED = 4;

/** Inertia decay factor (0-1, lower = more friction) */
const DAMPING_FACTOR = 0.92;

/** Min/max phi applied during damping */
const MIN_PHI = 0.3;
const MAX_PHI = 1.45;

/** Initial camera overview parameters */
const INITIAL = {
  theta: Math.PI / 4,
  phi: 0.85,
  radius: 0.8,
  target: new THREE.Vector3(0.15, 0, 0.2),
};

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
  const resetBuilding = useMapStore((s) => s.resetBuilding);

  // Animation state (all refs — no re-renders)
  const isAnimating = useRef(false);
  const animTheta = useRef(INITIAL.theta);
  const animPhi = useRef(INITIAL.phi);
  const animRadius = useRef(INITIAL.radius);
  const animTarget = useRef(INITIAL.target.clone());
  const prevRadius = useRef<number | null>(null);

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
      animPhi.current = phi;
      animTheta.current = theta;
      animTarget.current.copy(focusTarget);
      isAnimating.current = true;
      prevRadius.current = null;
    }
  }, [selectedBuilding]);

  // ─── Per-frame update ───────────────────────────────────────────────────

  useFrame((_, delta) => {
    const gs = gestureState.current;

    // 1. Programmatic camera animation (lerp towards target)
    if (isAnimating.current) {
      const factor = 1 - Math.exp(-CAMERA_ANIM_SPEED * delta);
      gs.theta = THREE.MathUtils.lerp(gs.theta, animTheta.current, factor);
      gs.phi = THREE.MathUtils.lerp(gs.phi, animPhi.current, factor);
      gs.radius = THREE.MathUtils.lerp(gs.radius, animRadius.current, factor);
      gs.targetX = THREE.MathUtils.lerp(gs.targetX, animTarget.current.x, factor);
      gs.targetY = THREE.MathUtils.lerp(gs.targetY, animTarget.current.y, factor);
      gs.targetZ = THREE.MathUtils.lerp(gs.targetZ, animTarget.current.z, factor);

      // Animation complete check
      if (Math.abs(gs.radius - animRadius.current) < 0.003) {
        isAnimating.current = false;
      }
    }

    // 2. Apply inertia damping when not actively gesturing or animating
    if (!gs.isGesturing && !isAnimating.current) {
      if (Math.abs(gs.velocityTheta) > 0.0001 || Math.abs(gs.velocityPhi) > 0.0001) {
        gs.theta += gs.velocityTheta;
        gs.phi = Math.max(MIN_PHI, Math.min(MAX_PHI, gs.phi + gs.velocityPhi));
        gs.velocityTheta *= DAMPING_FACTOR;
        gs.velocityPhi *= DAMPING_FACTOR;
        if (Math.abs(gs.velocityTheta) < 0.00005) gs.velocityTheta = 0;
        if (Math.abs(gs.velocityPhi) < 0.00005) gs.velocityPhi = 0;
      }
    }

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
          // If another building is selected, ignore (user must zoom out first)
        }
      }
    }

    // 5. Zoom-out threshold detection
    if (selectedBuilding && isExploded && !isAnimating.current && !isFloorModalOpen) {
      if (prevRadius.current !== null) {
        const wasBelow = prevRadius.current < BUILDING_EXIT_DISTANCE;
        const isAbove = gs.radius >= BUILDING_EXIT_DISTANCE;

        if (wasBelow && isAbove) {
          // User zoomed out past threshold → reunify building
          resetBuilding();
          // Animate back to campus overview
          animTheta.current = INITIAL.theta;
          animPhi.current = INITIAL.phi;
          animRadius.current = INITIAL.radius;
          animTarget.current.copy(INITIAL.target);
          isAnimating.current = true;
        }
      }
      prevRadius.current = gs.radius;
    }

    // Reset distance tracking when no building is selected
    if (!selectedBuilding) {
      prevRadius.current = null;
    }
  });

  // This component renders nothing — it only drives the camera
  return null;
}
