// Where the rogue stands relative to the dummy. World units are yards; y is up.
// Yaw 0 faces +z, and positive yaw turns toward +x (matches three.js rotation.y).

/** Center-to-center distance for melee abilities and auto-attacks. */
export const MELEE_RANGE = 5;

export interface Placement {
  x: number;
  z: number;
  yaw: number;
}

export interface Positioning {
  distance: number;
  /** Target is within the 180° arc in front of the player. */
  facing: boolean;
  /** Player is within the 180° arc behind the target. */
  behind: boolean;
}

/** Point-blank, facing, behind: what the sim assumes when nothing reports a position. */
export const IN_POSITION: Positioning = { distance: 0, facing: true, behind: true };

export function forward(yaw: number): { x: number; z: number } {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

/** Screen-right when looking along `yaw`. */
export function right(yaw: number): { x: number; z: number } {
  return { x: -Math.cos(yaw), z: Math.sin(yaw) };
}

export function positioning(player: Placement, target: Placement): Positioning {
  const dx = target.x - player.x;
  const dz = target.z - player.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-6) return { ...IN_POSITION };
  const pf = forward(player.yaw);
  const tf = forward(target.yaw);
  return {
    distance,
    facing: pf.x * dx + pf.z * dz > 0,
    behind: tf.x * -dx + tf.z * -dz < 0,
  };
}
