import { describe, expect, it } from "vitest";
import { GRAVITY, JUMP_VELOCITY, groundVelocity, stepBody, type Body } from "./movement";

const grounded = (): Body => ({ x: 0, z: 0, y: 0, vy: 0, air: null });

function simulateJump(body: Body, wanted = { x: 0, z: 0 }, dt = 1 / 120) {
  let apex = 0;
  let time = 0;
  stepBody(body, dt, wanted, true);
  time += dt;
  while (body.air) {
    apex = Math.max(apex, body.y);
    stepBody(body, dt, { x: 0, z: 0 }, false); // keys released mid-air
    time += dt;
  }
  return { apex, time };
}

describe("movement", () => {
  it("runs at 7 yd/s, diagonals included, and backpedals at 4.5", () => {
    expect(Math.hypot(...Object.values(groundVelocity({ forward: 1, strafe: 0 }, 0, 1)))).toBeCloseTo(7);
    expect(Math.hypot(...Object.values(groundVelocity({ forward: 1, strafe: 1 }, 1.2, 1)))).toBeCloseTo(7);
    expect(Math.hypot(...Object.values(groundVelocity({ forward: -1, strafe: 0 }, 0, 1)))).toBeCloseTo(4.5);
    expect(Math.hypot(...Object.values(groundVelocity({ forward: 1, strafe: 0 }, 0, 0.7)))).toBeCloseTo(4.9);
  });

  it("jumps about 1.64 yd high and lands after about 0.82 s", () => {
    const { apex, time } = simulateJump(grounded());
    expect(apex).toBeCloseTo(JUMP_VELOCITY ** 2 / (2 * GRAVITY), 1);
    expect(apex).toBeCloseTo(1.64, 1);
    expect(time).toBeCloseTo((2 * JUMP_VELOCITY) / GRAVITY, 1);
  });

  it("keeps takeoff momentum in the air even after keys are released", () => {
    const body = grounded();
    const { time } = simulateJump(body, { x: 0, z: 7 });
    expect(body.z).toBeCloseTo(7 * time, 0);
    expect(body.y).toBe(0);
  });

  it("can't jump again while airborne", () => {
    const body = grounded();
    stepBody(body, 0.1, { x: 0, z: 0 }, true);
    const vy = body.vy;
    stepBody(body, 0.1, { x: 0, z: 0 }, true);
    expect(body.vy).toBeCloseTo(vy - GRAVITY * 0.1);
  });
});
