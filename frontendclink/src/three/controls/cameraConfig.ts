/** Límite superior de elevación compartido por gestos y animaciones automáticas. */
export const MIN_CAMERA_PHI = 0.3;

/**
 * Ángulo polar máximo medido desde Y+.
 * 1.2 rad mantiene la cámara unos 21 grados sobre el horizonte para que no se vea
 * la cara inferior del terreno.
 */
export const MAX_CAMERA_PHI = 1.2;

/** Aplica el mismo límite sin importar si phi cambió por gesto, inercia o zoom. */
export function clampCameraPhi(phi: number): number {
  return Math.max(MIN_CAMERA_PHI, Math.min(MAX_CAMERA_PHI, phi));
}
