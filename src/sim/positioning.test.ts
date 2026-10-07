import { describe, expect, it } from "vitest";
import { forward, positioning, right } from "./positioning";

const dummy = { x: 0, z: 0, yaw: 0 }; // faces +z

describe("positioning", () => {
  it("is behind and facing when south of the dummy looking north", () => {
    expect(positioning({ x: 0, z: -3, yaw: 0 }, dummy)).toEqual({ distance: 3, facing: true, behind: true });
  });

  it("is in front of the dummy when north of it", () => {
    const p = positioning({ x: 0, z: 3, yaw: Math.PI }, dummy);
    expect(p.behind).toBe(false);
    expect(p.facing).toBe(true);
  });

  it("is not facing when looking away", () => {
    expect(positioning({ x: 0, z: -3, yaw: Math.PI }, dummy).facing).toBe(false);
  });

  it("right is 90° clockwise from forward (seen from above)", () => {
    const f = forward(0.7);
    const r = right(0.7);
    expect(f.x * r.x + f.z * r.z).toBeCloseTo(0);
    // Facing +z, screen-right is -x.
    expect(right(0).x).toBeCloseTo(-1);
  });
});
