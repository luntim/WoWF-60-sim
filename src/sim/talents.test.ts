import { describe, expect, it } from "vitest";
import { PRESETS, addBlocker, buildErrors, canRemove, talentEffects, totalPoints } from "./talents";

describe("talent rules", () => {
  it.each(PRESETS)("preset $name is a legal 51-point build", ({ ranks }) => {
    expect(buildErrors(ranks)).toEqual([]);
    expect(totalPoints(ranks)).toBe(51);
  });

  it("gates tiers on points spent in earlier rows", () => {
    expect(addBlocker({}, "malice")).toBeNull();
    expect(addBlocker({}, "ruthlessness")).toBe("Requires 5 points in Assassination talents");
    expect(addBlocker({ malice: 5 }, "ruthlessness")).toBeNull();
  });

  it("enforces prerequisites", () => {
    const tier2 = { remorselessAttacks: 2, improvedGouge: 3, malice: 4, murder: 2 };
    expect(addBlocker(tier2, "lethality")).toBe("Requires 5 points in Malice");
    expect(addBlocker({ ...tier2, malice: 5 }, "lethality")).toBeNull();
  });

  it("caps ranks and total points", () => {
    expect(addBlocker({ malice: 5 }, "malice")).toBe("Max rank");
    expect(addBlocker(PRESETS[0].ranks, "lightningReflexes")).toBe("No talent points left");
  });

  it("refuses removals that would break the build", () => {
    const ranks = { malice: 5, ruthlessness: 1 };
    expect(canRemove(ranks, "malice")).toBe(false); // Ruthlessness needs 5 points above it
    expect(canRemove(ranks, "ruthlessness")).toBe(true);
    expect(canRemove({ malice: 5, murder: 2, improvedGouge: 3, lethality: 1 }, "malice")).toBe(false); // prerequisite
  });

  it("derives effects from ranks", () => {
    const fx = talentEffects({ improvedEviscerate: 2, malice: 3, initiative: 1 });
    expect(fx.improvedEviscerateDamage).toBe(0.13);
    expect(fx.maliceCrit).toBe(3);
    expect(fx.initiativeChance).toBe(0.33);
    expect(fx.sealFateChance).toBe(0);
  });
});
