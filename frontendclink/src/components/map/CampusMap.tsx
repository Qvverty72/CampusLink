/**
 * CampusLink MVP — CampusMap (3D Canvas wrapper)
 *
 * Custom touch-based camera controls using PanResponder + spherical coordinates.
 * - Single finger drag → orbit rotation
 * - Pinch gesture → zoom in/out
 * - Short tap → mesh selection via raycast
 * - Inertia/damping after gesture release
 *
 * The PanResponder only claims the gesture after significant movement (>8px),
 * so quick taps pass through and are handled as mesh selection.
 */

import React, { Suspense, useRef, useMemo, useCallback } from 'react';
import {
  View,
  PanResponder,
  StyleSheet,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { Canvas } from '@react-three/fiber/native';
import { CampusModelScene } from '@/components/map/CampusModel';
import { CameraController } from '@/components/map/CameraController';
import { clampCameraPhi } from '@/components/map/cameraConfig';

// ─── Camera Gesture State (shared between RN View and R3F Canvas via ref) ──────

export interface CameraGestureState {
  // Spherical camera parameters
  theta: number;        // azimuthal angle (horizontal rotation around Y)
  phi: number;          // polar angle (from Y+ axis: 0=top, PI=bottom)
  radius: number;       // distance from look-at target
  targetX: number;      // look-at target X
  targetY: number;      // look-at target Y
  targetZ: number;      // look-at target Z

  // Inertia / momentum
  velocityTheta: number;
  velocityPhi: number;

  // Gesture tracking
  isGesturing: boolean;
  gestureType: 'none' | 'rotate' | 'zoom';
  lastTouchX: number;
  lastTouchY: number;
  pinchStartDist: number;
  startRadius: number;

  // Tap detection for mesh selection
  tapX: number;         // NDC x (-1 to 1)
  tapY: number;         // NDC y (-1 to 1)
  hasPendingTap: boolean;
  touchStartTime: number;
  touchStartX: number;  // screen px
  touchStartY: number;  // screen px
  hasMoved: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const ROTATE_SENSITIVITY = 0.008;
const MIN_RADIUS = 0.08;
const MAX_RADIUS = 1.5;
const TAP_MAX_DURATION = 300;  // ms
const TAP_MAX_MOVEMENT = 8;   // px — threshold before a touch becomes a drag

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getTouchDistance(touches: { pageX: number; pageY: number }[]): number {
  if (touches.length < 2) return 0;
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function CampusMap() {
  const layoutRef = useRef({ x: 0, y: 0, width: 1, height: 1 });

  const gestureState = useRef<CameraGestureState>({
    // Initial camera: overview of the full campus
    theta: Math.PI / 4,
    phi: 0.85,
    radius: 0.8,
    targetX: 0.15,
    targetY: 0,
    targetZ: 0.2,
    velocityTheta: 0,
    velocityPhi: 0,
    isGesturing: false,
    gestureType: 'none',
    lastTouchX: 0,
    lastTouchY: 0,
    pinchStartDist: 0,
    startRadius: 0,
    tapX: 0,
    tapY: 0,
    hasPendingTap: false,
    touchStartTime: 0,
    touchStartX: 0,
    touchStartY: 0,
    hasMoved: false,
  });

  // ─── PanResponder (camera rotation & zoom) ────────────────────────────────

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Don't claim on touch start — let taps pass through to Canvas
        onStartShouldSetPanResponder: () => false,

        // Only claim after significant movement (drag, not tap)
        onMoveShouldSetPanResponder: (_, gs) => {
          if (Math.abs(gs.dx) > TAP_MAX_MOVEMENT || Math.abs(gs.dy) > TAP_MAX_MOVEMENT) {
            gestureState.current.hasMoved = true;
            return true;
          }
          return false;
        },

        onPanResponderGrant: (evt) => {
          const touches = evt.nativeEvent.touches as unknown as { pageX: number; pageY: number }[];
          const gs = gestureState.current;
          gs.isGesturing = true;
          gs.velocityTheta = 0;
          gs.velocityPhi = 0;

          if (touches.length >= 2) {
            gs.gestureType = 'zoom';
            gs.pinchStartDist = getTouchDistance(touches);
            gs.startRadius = gs.radius;
          } else if (touches.length >= 1) {
            gs.gestureType = 'rotate';
            gs.lastTouchX = touches[0].pageX;
            gs.lastTouchY = touches[0].pageY;
          }
        },

        onPanResponderMove: (evt) => {
          const touches = evt.nativeEvent.touches as unknown as { pageX: number; pageY: number }[];
          const gs = gestureState.current;

          if (touches.length >= 2) {
            // ── Pinch Zoom ──────────────────────────────────────────────
            if (gs.gestureType !== 'zoom') {
              // Switched from rotate → zoom (user added a finger)
              gs.gestureType = 'zoom';
              gs.pinchStartDist = getTouchDistance(touches);
              gs.startRadius = gs.radius;
            }
            const dist = getTouchDistance(touches);
            if (gs.pinchStartDist > 0 && dist > 0) {
              const scale = gs.pinchStartDist / dist;
              gs.radius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, gs.startRadius * scale));
            }
          } else if (touches.length === 1) {
            // ── Orbit Rotation ──────────────────────────────────────────
            if (gs.gestureType !== 'rotate') {
              // Switched from zoom → rotate (user lifted a finger)
              gs.gestureType = 'rotate';
              gs.lastTouchX = touches[0].pageX;
              gs.lastTouchY = touches[0].pageY;
            }
            const dx = touches[0].pageX - gs.lastTouchX;
            const dy = touches[0].pageY - gs.lastTouchY;
            const nextPhi = gs.phi + dy * ROTATE_SENSITIVITY;
            gs.theta -= dx * ROTATE_SENSITIVITY;
            gs.phi = clampCameraPhi(nextPhi);
            // Store velocity for inertia
            gs.velocityTheta = -dx * ROTATE_SENSITIVITY;
            gs.velocityPhi = gs.phi === nextPhi
              ? dy * ROTATE_SENSITIVITY * 0.5
              : 0;
            gs.lastTouchX = touches[0].pageX;
            gs.lastTouchY = touches[0].pageY;
          }
        },

        onPanResponderRelease: () => {
          gestureState.current.isGesturing = false;
          gestureState.current.gestureType = 'none';
        },

        onPanResponderTerminate: () => {
          gestureState.current.isGesturing = false;
          gestureState.current.gestureType = 'none';
        },
      }),
    []
  );

  // ─── Touch event handlers (tap detection) ─────────────────────────────────

  const handleTouchStart = useCallback((e: GestureResponderEvent) => {
    const touches = e.nativeEvent.touches as unknown as { pageX: number; pageY: number }[];
    const gs = gestureState.current;

    if (touches.length === 1) {
      gs.touchStartTime = Date.now();
      gs.touchStartX = touches[0].pageX;
      gs.touchStartY = touches[0].pageY;
      gs.hasMoved = false;
    } else {
      // Multi-touch ≠ tap
      gs.hasMoved = true;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    const gs = gestureState.current;
    const elapsed = Date.now() - gs.touchStartTime;

    if (!gs.hasMoved && elapsed < TAP_MAX_DURATION) {
      // Detected a tap → convert screen coords to NDC for raycasting
      const l = layoutRef.current;
      const canvasX = gs.touchStartX - l.x;
      const canvasY = gs.touchStartY - l.y;
      gs.tapX = (canvasX / l.width) * 2 - 1;
      gs.tapY = -(canvasY / l.height) * 2 + 1;
      gs.hasPendingTap = true;
    }

    gs.isGesturing = false;
    gs.gestureType = 'none';
  }, []);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    layoutRef.current = e.nativeEvent.layout;
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View
      style={styles.container}
      onLayout={handleLayout}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      {...panResponder.panHandlers}
    >
      <Canvas
        camera={{ fov: 50, near: 0.01, far: 100 }}
        style={styles.canvas}
      >
        {/* Minimal lighting — no shadows for mobile performance */}
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 10, 5]} intensity={0.6} />

        {/* Custom camera controller reads gesture state from refs */}
        <CameraController gestureState={gestureState} />

        {/* Model with async loading */}
        <Suspense fallback={null}>
          <CampusModelScene />
        </Suspense>
      </Canvas>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#87CEEB',
  },
  canvas: {
    flex: 1,
  },
});
