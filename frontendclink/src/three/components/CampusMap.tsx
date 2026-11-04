/**
 * Contenedor nativo del Canvas y traductor de gestos táctiles.
 *
 * PanResponder interpreta rotación y pinch; los taps se convierten a coordenadas
 * NDC para que `CameraController` haga raycast. Ambos lados comparten una ref para
 * mover la cámara por frame sin rerenderizar la jerarquía React Native.
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
import { CampusModelScene } from '@/three/components/CampusModel';
import { CameraController } from '@/three/controls/CameraController';
import { clampCameraPhi } from '@/three/controls/cameraConfig';

// ─── Estado de gestos de cámara, compartido por View nativa y Canvas mediante ref ──

/** Estado mutable que conecta eventos de pantalla con el render loop de R3F. */
export interface CameraGestureState {
  // Parámetros esféricos de cámara.
  theta: number;        // azimuthal angle (horizontal rotation around Y)
  phi: number;          // polar angle (from Y+ axis: 0=top, PI=bottom)
  radius: number;       // Distancia desde el punto al que mira la cámara.
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

  // Detección de toques para seleccionar mallas.
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

/** Calcula la distancia entre los dos primeros puntos de un gesto pinch. */
function getTouchDistance(touches: { pageX: number; pageY: number }[]): number {
  if (touches.length < 2) return 0;
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─── Component ─────────────────────────────────────────────────────────────────

/** Conecta gestos táctiles con la escena 3D sin enviar cada frame al estado React. */
export function CampusMap() {
  // El layout permite traducir pageX/pageY del touch al rango NDC [-1, 1] que
  // espera THREE.Raycaster, independientemente del tamaño visible del Canvas.
  const layoutRef = useRef({ x: 0, y: 0, width: 1, height: 1 });

  // Los movimientos continuos no son estado declarativo de UI. Una ref ofrece al
  // controlador el valor más reciente sin generar renders durante cada gesto.
  const gestureState = useRef<CameraGestureState>({
    // Cámara inicial: vista general del campus.
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

  // PanResponder reclama pinch de inmediato, pero espera movimiento suficiente
  // para diferenciar un drag de un tap destinado a selección 3D.

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Reclama de inmediato gestos de dos dedos; deja el toque simple para Canvas.
        onStartShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length >= 2,

        // El pinch se reconoce al instante; la rotación espera movimiento de arrastre.
        onMoveShouldSetPanResponder: (evt, gs) => {
          const isPinching = evt.nativeEvent.touches.length >= 2;
          if (
            isPinching ||
            Math.abs(gs.dx) > TAP_MAX_MOVEMENT ||
            Math.abs(gs.dy) > TAP_MAX_MOVEMENT
          ) {
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
              // Cambió de rotación a zoom porque se añadió otro dedo.
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
              // Cambió de zoom a rotación porque se levantó un dedo.
              gs.gestureType = 'rotate';
              gs.lastTouchX = touches[0].pageX;
              gs.lastTouchY = touches[0].pageY;
            }
            const dx = touches[0].pageX - gs.lastTouchX;
            const dy = touches[0].pageY - gs.lastTouchY;
            const nextPhi = gs.phi + dy * ROTATE_SENSITIVITY;
            gs.theta -= dx * ROTATE_SENSITIVITY;
            gs.phi = clampCameraPhi(nextPhi);
            // Guarda la velocidad para continuar con inercia al soltar.
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

  // La detección de tap permanece en la View nativa; la consulta geométrica se
  // difiere al siguiente frame, donde ya están disponibles camera y scene.

  /** Guarda inicio, duración potencial y posición para distinguir toque de arrastre. */
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

  /** Convierte un toque corto e inmóvil a NDC para que el controlador haga raycast. */
  const handleTouchEnd = useCallback(() => {
    const gs = gestureState.current;
    const elapsed = Date.now() - gs.touchStartTime;

    if (!gs.hasMoved && elapsed < TAP_MAX_DURATION) {
      // NDC usa origen central, X hacia la derecha e Y hacia arriba; por eso Y se
      // invierte respecto de las coordenadas de pantalla de React Native.
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

  /** Conserva el rectángulo del contenedor usado para normalizar coordenadas de pantalla. */
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
        {/* Iluminación mínima sin sombras para limitar el costo en GPU móvil. */}
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 10, 5]} intensity={0.6} />

        {/* El controller consume la ref dentro de useFrame y no renderiza geometría. */}
        <CameraController gestureState={gestureState} />

        {/* useGLTF puede suspender mientras carga el asset local; la escena se monta
            únicamente cuando nodos y materiales ya están disponibles. */}
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
