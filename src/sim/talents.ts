import { MAX_TALENT_POINTS, TALENT_BY_ID, TALENT_TREES, type TreeName } from "../data/talentTrees";

/** Talent id -> ranks taken. Missing ids are rank 0. */
export type TalentRanks = Record<string, number>;

export function rankOf(ranks: TalentRanks, id: string): number {
  return ranks[id] ?? 0;
}

export function totalPoints(ranks: TalentRanks): number {
  return Object.values(ranks).reduce((n, r) => n + r, 0);
}

export function pointsInTree(ranks: TalentRanks, tree: TreeName, beforeRow = Infinity): number {
  const t = TALENT_TREES.find((x) => x.name === tree)!;
  return t.talents.filter((d) => d.row < beforeRow).reduce((n, d) => n + rankOf(ranks, d.id), 0);
}

/** Why `id` can't hold its current rank in `ranks`, or null if it can. */
function talentProblem(ranks: TalentRanks, id: string): string | null {
  const def = TALENT_BY_ID.get(id);
  if (!def) return `Unknown talent ${id}`;
  const r = rankOf(ranks, id);
  if (r === 0) return null;
  if (r > def.maxRank) return `${def.name} is over its max rank`;
  if (pointsInTree(ranks, def.tree, def.row) < def.requiredPoints) {
    return `Requires ${def.requiredPoints} points in ${def.tree} talents`;
  }
  if (def.requires && rankOf(ranks, def.requires.id) < def.requires.rank) {
    const req = TALENT_BY_ID.get(def.requires.id)!;
    return `Requires ${def.requires.rank} point${def.requires.rank > 1 ? "s" : ""} in ${req.name}`;
  }
  return null;
}

export function buildErrors(ranks: TalentRanks): string[] {
  const errors = Object.keys(ranks)
    .map((id) => talentProblem(ranks, id))
    .filter((e): e is string => e !== null);
  if (totalPoints(ranks) > MAX_TALENT_POINTS) errors.push(`More than ${MAX_TALENT_POINTS} points spent`);
  return errors;
}

/** Why a point can't be added to `id`, or null if it can. */
export function addBlocker(ranks: TalentRanks, id: string): string | null {
  const def = TALENT_BY_ID.get(id);
  if (!def) return "Unknown talent";
  if (rankOf(ranks, id) >= def.maxRank) return "Max rank";
  if (totalPoints(ranks) >= MAX_TALENT_POINTS) return "No talent points left";
  return talentProblem({ ...ranks, [id]: rankOf(ranks, id) + 1 }, id);
}

/** A point can come out only if every other talent stays valid (tier gates and prerequisites). */
export function canRemove(ranks: TalentRanks, id: string): boolean {
  if (rankOf(ranks, id) === 0) return false;
  const next = { ...ranks, [id]: rankOf(ranks, id) - 1 };
  return buildErrors(next).length === 0;
}

export function withRank(ranks: TalentRanks, id: string, rank: number): TalentRanks {
  const next = { ...ranks };
  if (rank > 0) next[id] = rank;
  else delete next[id];
  return next;
}

export const PRESETS: { name: string; ranks: TalentRanks }[] = [
  {
    name: "Mutilate (39/12/0)",
    ranks: {
      malice: 5, ruthlessness: 3, murder: 2, improvedSliceAndDice: 3, relentlessStrikes: 1, lethality: 5,
      vilePoisons: 5, coldBlood: 1, improvedPoisons: 5, vigor: 2, mutilate: 1, sealFate: 5, venom: 1,
      improvedEviscerate: 3, lightningReflexes: 2, puncturingWounds: 3, precision: 3, endurance: 1,
    },
  },
  {
    name: "Combat Swords (18/33/0)",
    ranks: {
      malice: 5, ruthlessness: 3, murder: 2, improvedSliceAndDice: 3, relentlessStrikes: 1, lethality: 4,
      improvedEviscerate: 3, improvedSinisterStrike: 2, deflection: 3, precision: 3, endurance: 2,
      improvedSprint: 2, flawlessExecution: 1, dualWieldSpecialization: 5, bladeFlurry: 1, hackAndSlash: 5,
      weaponExpertise: 2, aggression: 3, adrenalineRush: 1,
    },
  },
  {
    name: "Hemorrhage (19/0/32)",
    ranks: {
      malice: 5, ruthlessness: 3, murder: 2, improvedSliceAndDice: 3, relentlessStrikes: 1, lethality: 5,
      opportunity: 2, camouflage: 4, elusiveness: 2, improvedAmbush: 3, initiative: 3,
      ghostlyStrike: 1, improvedDistract: 1, heightenedSenses: 1, premeditation: 1, serratedBlades: 3,
      dirtyDeeds: 2, preparation: 1, hemorrhage: 1, quietus: 5, cutthroat: 1, thousandCuts: 1,
    },
  },
];

const perRank = (ranks: TalentRanks, id: string, value: number) => rankOf(ranks, id) * value;
const byRank = (ranks: TalentRanks, id: string, values: number[]) => values[rankOf(ranks, id)] ?? 0;
const has = (ranks: TalentRanks, id: string) => rankOf(ranks, id) > 0;

/** Combat numbers implied by a talent build. Values come from the per-rank tooltips. */
export function talentEffects(r: TalentRanks) {
  return {
    // Assassination
    maliceCrit: perRank(r, "malice", 1),
    ruthlessnessChance: perRank(r, "ruthlessness", 0.2),
    murderDamage: perRank(r, "murder", 0.02),
    improvedSndDuration: perRank(r, "improvedSliceAndDice", 0.15),
    relentlessChancePerCp: perRank(r, "relentlessStrikes", 0.2),
    relentlessEnergy: 25,
    improvedExposeArmorCost: perRank(r, "improvedExposeArmor", 5),
    improvedExposeArmorRefund: perRank(r, "improvedExposeArmor", 1),
    lethalityCritBonus: perRank(r, "lethality", 0.04),
    vilePoisonsDamage: perRank(r, "vilePoisons", 0.04),
    improvedPoisonsChance: perRank(r, "improvedPoisons", 0.02),
    vigorEnergy: perRank(r, "vigor", 5),
    improvedKidneyShotDamage: perRank(r, "improvedKidneyShot", 0.05),
    sealFateChance: perRank(r, "sealFate", 0.2),
    sealFateIcd: 0.5,
    // Combat
    improvedEviscerateDamage: byRank(r, "improvedEviscerate", [0, 0.07, 0.13, 0.2]),
    improvedSinisterStrikeCost: byRank(r, "improvedSinisterStrike", [0, 3, 5]),
    puncturingWoundsBackstabCrit: perRank(r, "puncturingWounds", 10),
    puncturingWoundsMutilateCrit: perRank(r, "puncturingWounds", 5),
    puncturingWoundsBackstabExtraCp: perRank(r, "puncturingWounds", 0.15),
    precisionHit: perRank(r, "precision", 1),
    flawlessExecutionCost: perRank(r, "flawlessExecution", 10),
    dualWieldSpecDamage: perRank(r, "dualWieldSpecialization", 0.05),
    /** Hack and Slash, by main/off-hand weapon type. */
    hackAndSlashExtraAttack: perRank(r, "hackAndSlash", 0.01),
    hackAndSlashCrit: perRank(r, "hackAndSlash", 1),
    hackAndSlashArmorPen: perRank(r, "hackAndSlash", 0.03),
    weaponExpertiseDodge: perRank(r, "weaponExpertise", 1),
    aggressionDamage: perRank(r, "aggression", 0.02),
    // Subtlety
    camouflageCooldown: byRank(r, "camouflage", [0, 2, 3, 4, 5, 6]),
    opportunityDamage: perRank(r, "opportunity", 0.05),
    elusivenessCooldown: perRank(r, "elusiveness", 45),
    improvedAmbushCrit: perRank(r, "improvedAmbush", 15),
    initiativeChance: byRank(r, "initiative", [0, 0.33, 0.67, 1]),
    serratedArmorPen: perRank(r, "serratedBlades", 0.03),
    serratedRuptureDamage: perRank(r, "serratedBlades", 0.1),
    dirtyDeedsCost: perRank(r, "dirtyDeeds", 10),
    quietusDamage: perRank(r, "quietus", 0.02),
    cutthroatChance: perRank(r, "cutthroat", 0.03),
    thousandCuts: has(r, "thousandCuts"),
  };
}

export type TalentEffects = ReturnType<typeof talentEffects>;
