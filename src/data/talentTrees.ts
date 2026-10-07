// WoW Forever rogue talent trees, trimmed from Wowhead's talent calculator data
// (nether.wowhead.com/forever/data/talents-classic). Raw dump: wowhead-rogue-talents-forever.json.
import trees from "./talentTrees.json";

export type TreeName = "Assassination" | "Combat" | "Subtlety";

export interface TalentDef {
  /** camelCase of the name, e.g. "sealFate". */
  id: string;
  name: string;
  row: number;
  col: number;
  maxRank: number;
  /** Wowhead icon name; file at public/icons/<icon>.jpg. */
  icon: string;
  /** Points that must be spent in this tree's earlier rows. */
  requiredPoints: number;
  requires?: { id: string; rank: number };
  /** Tooltip text for each rank (index 0 = rank 1). */
  ranks: string[];
}

export interface TalentTree {
  name: TreeName;
  talents: TalentDef[];
}

export const TALENT_TREES = trees as TalentTree[];
export const MAX_TALENT_POINTS = 51;
export const TREE_ROWS = 7;
export const TREE_COLS = 4;

export const TALENT_BY_ID = new Map<string, TalentDef & { tree: TreeName }>(
  TALENT_TREES.flatMap((tree) => tree.talents.map((t) => [t.id, { ...t, tree: tree.name }] as const)),
);

/** Talents with nothing to simulate against a dummy that never fights back. */
export const NOT_SIMULATED = new Set([
  "improvedGouge",
  "remorselessAttacks",
  "lightningReflexes",
  "deflection",
  "riposte",
  "endurance",
  "improvedSprint",
  "improvedKick",
  "masterOfDeception",
  "setup",
  "dirtyTricks",
  "improvedDistract",
  "heightenedSenses",
]);
