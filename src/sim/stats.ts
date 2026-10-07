import { PRESETS, type TalentRanks } from "./talents";

export type WeaponType = "dagger" | "sword" | "axe" | "mace" | "fist";
export type PoisonKind = "instant" | "deadly" | "none";
export type Hand = "mh" | "oh";
export const HANDS: Hand[] = ["mh", "oh"];

export interface Weapon {
  type: WeaponType;
  min: number;
  max: number;
  /** Seconds per swing. */
  speed: number;
  poison: PoisonKind;
}

export interface CharacterStats {
  mh: Weapon;
  oh: Weapon;
  attackPower: number;
  /** Crit % from gear and agility, before talents. */
  critChance: number;
  /** Melee hit % from gear, before talents. */
  hitChance: number;
}

export type TargetLevel = 60 | 63;

export interface TargetStats {
  level: TargetLevel;
  armor: number;
  /** Murder applies against Humanoid/Giant targets. */
  humanoid: boolean;
  /** Target below 35% health (Quietus). */
  executePhase: boolean;
}

export interface SimConfig {
  character: CharacterStats;
  target: TargetStats;
  talents: TalentRanks;
}

/** Rough fresh-60 dual-dagger rogue in pre-raid gear. */
export const DEFAULT_CONFIG: SimConfig = {
  character: {
    mh: { type: "dagger", min: 54, max: 101, speed: 1.7, poison: "instant" },
    oh: { type: "dagger", min: 41, max: 77, speed: 1.5, poison: "deadly" },
    attackPower: 1000,
    critChance: 20,
    hitChance: 5,
  },
  target: { level: 63, armor: 3731, humanoid: true, executePhase: false },
  talents: PRESETS[0].ranks,
};

/**
 * Vanilla combat table with 300 weapon skill. ASSUMPTION: Forever keeps these.
 * Percentages are 0–100.
 */
export interface HitTable {
  yellowMiss: number;
  /** White-hit miss chance while dual wielding. */
  whiteMiss: number;
  dodge: number;
  glanceChance: number;
  /** Damage multiplier on a glancing blow. */
  glanceMult: number;
  /** Subtracted from crit chance. */
  critSuppression: number;
  /** Poison (spell) miss chance. */
  spellMiss: number;
}

export const HIT_TABLES: Record<TargetLevel, HitTable> = {
  60: { yellowMiss: 5, whiteMiss: 24, dodge: 5, glanceChance: 10, glanceMult: 0.95, critSuppression: 0, spellMiss: 4 },
  63: { yellowMiss: 9, whiteMiss: 28, dodge: 6.5, glanceChance: 40, glanceMult: 0.65, critSuppression: 3, spellMiss: 17 },
};

/** Physical damage multiplier from armor, for a level-60 attacker. */
export function armorMultiplier(armor: number): number {
  const a = Math.max(0, armor);
  return 1 - a / (a + 400 + 85 * 60);
}
