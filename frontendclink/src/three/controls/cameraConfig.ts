/** Camera elevation limits shared by gestures and frame-based animations. */
export const MIN_CAMERA_PHI = 0.3;

/**
 * Maximum polar angle measured from Y+.
 * 1.2 rad keeps the camera about 21 degrees above the horizon, preventing the
 * underside of the terrain from entering the frame.
 */
export const MAX_CAMERA_PHI = 1.2;

export function clampCameraPhi(phi: number): number {
  return Math.max(MIN_CAMERA_PHI, Math.min(MAX_CAMERA_PHI, phi));
}
