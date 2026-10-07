import { BACKPEDAL_SPEED, RUN_SPEED } from "../data/abilities";
import { forward, right } from "../sim/positioning";

/** WoW's jump: launch speed and gravity in yards/sec(²). Apex ≈ 1.64 yd, airtime ≈ 0.82 s. */
export const JUMP_VELOCITY = 7.95554;
export const GRAVITY = 19.2911;

export interface MoveInput {
  /** +1 forward, -1 back. */
  forward: number;
  /** +1 right, -1 left. */
  strafe: number;
}

/** Horizontal velocity for held movement keys. Diagonals aren't faster; backpedalling is slower. */
export function groundVelocity(input: MoveInput, yaw: number, speedMultiplier: number): { x: number; z: number } {
  if (input.forward === 0 && input.strafe === 0) return { x: 0, z: 0 };
  const f = forward(yaw);
  const r = right(yaw);
  const dx = f.x * input.forward + r.x * input.strafe;
  const dz = f.z * input.forward + r.z * input.strafe;
  const len = Math.hypot(dx, dz);
  const speed = (input.forward < 0 ? BACKPEDAL_SPEED : RUN_SPEED) * speedMultiplier;
  return { x: (dx / len) * speed, z: (dz / len) * speed };
}

export interface Body {
  x: number;
  z: number;
  /** Height above the ground. */
  y: number;
  vy: number;
  /** Horizontal velocity locked at takeoff; null while grounded. */
  air: { x: number; z: number } | null;
}

/**
 * Advances the body one step. On the ground it moves with `wanted` and can jump; in the air
 * it keeps its takeoff velocity (like WoW, you can't steer mid-jump) until it lands.
 */
export function stepBody(body: Body, dt: number, wanted: { x: number; z: number }, jump: boolean): void {
  if (!body.air && jump) {
    body.air = { ...wanted };
    body.vy = JUMP_VELOCITY;
  }
  const v = body.air ?? wanted;
  body.x += v.x * dt;
  body.z += v.z * dt;
  if (body.air) {
    body.vy -= GRAVITY * dt;
    body.y += body.vy * dt;
    if (body.y <= 0) {
      body.y = 0;
      body.vy = 0;
      body.air = null;
    }
  }
}
