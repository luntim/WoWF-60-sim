import { describe, expect, it } from "vitest";
import { GCD } from "../data/abilities";
import { Combat } from "./Combat";
import { DEFAULT_CONFIG, type SimConfig } from "./stats";
import { PRESETS, type TalentRanks } from "./talents";

/** rng that always returns `v`: 0.99 → every roll hits, no crit, no procs. */
const constant = (v: number) => () => v;

/** rng that returns `values` in order, then 0.99. */
function scripted(values: number[]) {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0.99);
}

/** Reach private state for setup that would otherwise need long rng scripts. */
function internals(c: Combat) {
  return c as unknown as { deadly: object | null; tryPoison(hand: "mh" | "oh"): void };
}

/** Level-60 target so 0.99 rolls land as hits, with poisons off unless a test enables them. */
function config(overrides: Partial<SimConfig["character"]> = {}, talents: TalentRanks = PRESETS[0].ranks): SimConfig {
  return {
    character: {
      ...DEFAULT_CONFIG.character,
      mh: { ...DEFAULT_CONFIG.character.mh, poison: "none" },
      oh: { ...DEFAULT_CONFIG.character.oh, poison: "none" },
      ...overrides,
    },
    target: { level: 60, armor: 0, humanoid: false, executePhase: false },
    talents,
  };
}

function step(c: Combat, seconds: number, dt = 0.01) {
  for (let t = 0; t < seconds - 1e-9; t += dt) c.update(dt);
}

describe("Combat", () => {
  it("spends energy and awards combo points for Mutilate", () => {
    const c = new Combat(config(), constant(0.99));
    expect(c.use("mutilate")).toBe("ok");
    expect(c.energy).toBe(c.maxEnergy - 60);
    expect(c.comboPoints).toBe(2);
  });

  it("blocks abilities on the GCD and without enough energy", () => {
    const c = new Combat(config(), constant(0.99));
    c.use("mutilate");
    expect(c.use("mutilate")).toBe("onGcd");
    c.energy = 10;
    step(c, GCD);
    expect(c.use("mutilate")).toBe("noEnergy");
  });

  it("regenerates 1 energy every 0.1 seconds (10 per second)", () => {
    // rng 0.99 puts the first tick at 0.099s.
    const c = new Combat(config(), constant(0.99));
    c.energy = 0;
    step(c, 0.35);
    expect(c.energy).toBe(3);
    step(c, 1);
    expect(c.energy).toBe(13);
  });

  it("Adrenaline Rush doubles energy regeneration", () => {
    const c = new Combat(config({}, PRESETS[1].ranks), constant(0.99));
    c.use("adrenalineRush");
    c.energy = 0;
    step(c, 1);
    expect(c.energy).toBe(20);
  });

  it("requires combo points for finishers and consumes them", () => {
    const c = new Combat(config(), constant(0.99));
    expect(c.use("eviscerate")).toBe("noComboPoints");
    c.use("mutilate");
    step(c, GCD);
    c.energy = 100;
    expect(c.use("eviscerate")).toBe("ok");
    // rng 0.99 fails Ruthlessness (60%), so nothing is left over.
    expect(c.comboPoints).toBe(0);
  });

  it("Mutilate crits trigger Seal Fate once per cast", () => {
    // Roll order: energy-tick phase (reset), hit table, per hand (damage, crit), Seal Fate.
    const c = new Combat(config(), scripted([0.5, 0.99, 0.5, 0, 0.5, 0, 0.5]));
    c.use("mutilate");
    expect(c.comboPoints).toBe(3);
  });

  it("does 20% more Mutilate damage to a target with Deadly Poison", () => {
    const plain = new Combat(config(), constant(0.99));
    plain.use("mutilate");

    const poisoned = new Combat(config(), constant(0.99));
    internals(poisoned).deadly = { stacks: 1, end: 99, nextTick: 99 };
    poisoned.use("mutilate");

    expect(poisoned.meter.total / plain.meter.total).toBeCloseTo(1.2, 2);
  });

  it("stacks Deadly Poison to 5 and ticks for stacks × 23 × Vile Poisons", () => {
    const cfg = config();
    cfg.character.oh.poison = "deadly";
    // Energy-tick phase, then per application: proc roll (0 = procs), spell-hit roll (0.99 = not resisted).
    const c = new Combat(cfg, scripted([0.5, ...Array(6).fill([0, 0.99]).flat()]));
    for (let i = 0; i < 6; i++) internals(c).tryPoison("oh");
    expect(c.targetDebuffs[0]).toMatchObject({ name: "Deadly Poison", stacks: 5 });

    step(c, 3.01);
    expect(c.meter.total).toBe(Math.round(23 * 5 * 1.2));
  });

  it("Slice and Dice speeds up auto attacks", () => {
    const slow = new Combat(config(), constant(0.99));
    slow.use("sinisterStrike");
    step(slow, 20);

    const fast = new Combat(config(), constant(0.99));
    fast.comboPoints = 5;
    fast.use("sliceAndDice");
    step(fast, GCD);
    fast.use("sinisterStrike");
    step(fast, 20 - GCD);

    const swings = (c: Combat) => c.meter.rows.get("melee")?.hits ?? 0;
    expect(swings(fast)).toBeGreaterThan(swings(slow));
  });

  it("Stealth gates Garrote/Ambush and breaks on attack", () => {
    const c = new Combat(config(), constant(0.99));
    expect(c.use("garrote")).toBe("needsStealth");
    expect(c.use("stealth")).toBe("ok");
    expect(c.use("ambush")).toBe("ok");
    expect(c.stealthed).toBe(false);
    expect(c.inCombat).toBe(true);
    expect(c.use("stealth")).toBe("inCombat");
  });

  it("Vanish drops combat and allows another opener", () => {
    const c = new Combat(config(), constant(0.99));
    c.use("sinisterStrike");
    expect(c.use("vanish")).toBe("ok");
    expect(c.inCombat).toBe(false);
    step(c, GCD);
    expect(c.use("garrote")).toBe("ok");
  });

  it("Backstab needs a main-hand dagger", () => {
    const c = new Combat(config({ mh: { ...DEFAULT_CONFIG.character.mh, type: "sword" } }), constant(0.99));
    expect(c.use("backstab")).toBe("needsDagger");
  });

  it("refunds 80% energy when a yellow attack misses", () => {
    // Level 63 target, no hit: rng 0 lands in the miss band.
    const c = new Combat({ ...config({ hitChance: 0 }), target: { level: 63, armor: 0, humanoid: false, executePhase: false } }, constant(0));
    c.use("mutilate");
    expect(c.energy).toBe(c.maxEnergy - 60 + 48);
    expect(c.comboPoints).toBe(0);
  });

  it("only offers talent abilities when the talent is taken", () => {
    const c = new Combat(config({}, { malice: 5 }), constant(0.99));
    expect(c.abilities.some((a) => a.id === "mutilate")).toBe(false);
    expect(c.use("mutilate")).toBe("notLearned");
    expect(c.abilities.some((a) => a.id === "kidneyShot")).toBe(true);
  });

  it("applies cost reductions from talents", () => {
    const c = new Combat(config({}, PRESETS[1].ranks), constant(0.99));
    const cost = (id: string) => c.cost(c.abilities.find((a) => a.id === id)!);
    expect(cost("sinisterStrike")).toBe(40); // Improved Sinister Strike 2/2
    expect(cost("eviscerate")).toBe(25); // Flawless Execution
  });

  it("Hack and Slash gives swords extra attacks", () => {
    const sword = { ...DEFAULT_CONFIG.character.mh, type: "sword" as const, poison: "none" as const };
    // Energy phase, SS hit roll, crit roll, damage roll, extra-attack roll (0 = proc); the extra swing then uses 0.99s.
    const c = new Combat(config({ mh: sword }, PRESETS[1].ranks), scripted([0.5, 0.99, 0.99, 0.5, 0]));
    c.use("sinisterStrike");
    expect(c.meter.rows.get("melee")?.hits).toBe(1);

    const noProc = new Combat(config({ mh: sword }, PRESETS[1].ranks), constant(0.99));
    noProc.use("sinisterStrike");
    expect(noProc.meter.rows.get("melee")).toBeUndefined();
  });

  it("Preparation resets other cooldowns", () => {
    const c = new Combat(config({}, PRESETS[2].ranks), constant(0.99));
    c.use("sinisterStrike");
    c.use("vanish");
    expect(c.cooldownRemaining("vanish")).toBeGreaterThan(0);
    c.use("preparation");
    expect(c.cooldownRemaining("vanish")).toBe(0);
    expect(c.cooldownRemaining("preparation")).toBe(600);
  });

  it("Premeditation's combo points expire after 20 seconds unless used", () => {
    const c = new Combat(config({}, PRESETS[2].ranks), constant(0.99));
    c.use("premeditation");
    expect(c.comboPoints).toBe(2);
    step(c, 20.05);
    expect(c.comboPoints).toBe(0);
  });

  it("Elusiveness shortens Vanish and Camouflage shortens Stealth", () => {
    const c = new Combat(config({}, PRESETS[2].ranks), constant(0.99));
    c.use("vanish");
    expect(c.cooldownRemaining("vanish")).toBe(300 - 90);
    c.use("stealth"); // cancel stealth: cooldown starts
    expect(c.cooldownRemaining("stealth")).toBe(10 - 5);
  });

  it("Thistle Tea restores 100 energy off the GCD, and Preparation doesn't reset it", () => {
    const c = new Combat(config({}, PRESETS[2].ranks), constant(0.99));
    c.use("sinisterStrike");
    c.energy = 5;
    expect(c.use("thistleTea")).toBe("ok");
    expect(c.energy).toBe(100); // capped at max energy (no Vigor in this build)
    expect(c.use("thistleTea")).toBe("onCooldown");
    c.use("preparation");
    expect(c.cooldownRemaining("thistleTea")).toBe(300);
  });

  it("needs melee range, facing, and (for Backstab) being behind", () => {
    const c = new Combat(config(), constant(0.99));
    c.setPositioning({ distance: 8, facing: true, behind: true });
    expect(c.use("mutilate")).toBe("outOfRange");
    c.setPositioning({ distance: 3, facing: false, behind: true });
    expect(c.use("mutilate")).toBe("notFacing");
    c.setPositioning({ distance: 3, facing: true, behind: false });
    expect(c.use("backstab")).toBe("notBehind");
    expect(c.use("mutilate")).toBe("ok"); // Mutilate has no positional requirement in Forever
  });

  it("Dirty Deeds lets Garrote be used from the front", () => {
    const c = new Combat(config({}, PRESETS[2].ranks), constant(0.99));
    c.setPositioning({ distance: 3, facing: true, behind: false });
    c.use("stealth");
    expect(c.use("garrote")).toBe("ok");
  });

  it("pauses auto-attacks out of range and resumes when back", () => {
    const c = new Combat(config(), constant(0.99));
    c.use("sinisterStrike");
    c.setPositioning({ distance: 10, facing: true, behind: true });
    const before = c.meter.rows.get("melee")?.hits ?? 0;
    step(c, 5);
    expect(c.meter.rows.get("melee")?.hits ?? 0).toBe(before);
    c.setPositioning({ distance: 3, facing: true, behind: true });
    step(c, 2);
    expect(c.meter.rows.get("melee")?.hits ?? 0).toBeGreaterThan(before);
  });

  it("Stealth slows movement, Camouflage softens it", () => {
    const plain = new Combat(config(), constant(0.99));
    plain.use("stealth");
    expect(plain.speedMultiplier).toBeCloseTo(0.7);
    const camo = new Combat(config({}, PRESETS[2].ranks), constant(0.99)); // Camouflage 4/5
    camo.use("stealth");
    expect(camo.speedMultiplier).toBeCloseTo(0.82);
  });

  it("needs a target for attacks; clearing it stops auto-attacks", () => {
    const c = new Combat(config(), constant(0.99));
    c.setTargeted(false);
    expect(c.use("mutilate")).toBe("noTarget");
    expect(c.use("sliceAndDice")).toBe("noComboPoints"); // self buffs don't need a target
    c.setTargeted(true);
    c.use("mutilate");
    expect(c.autoAttacking).toBe(true);
    c.setTargeted(false);
    expect(c.autoAttacking).toBe(false);
    c.reset();
    expect(c.targeted).toBe(false); // a fight reset keeps the selection
  });
});
