// Level-60 rogue abilities with WoW Forever values (top trained rank), from
// https://www.wowhead.com/forever/spells/abilities/rogue. Raw tooltips: wowhead-rogue-forever.json.
// Values marked ASSUMPTION are not stated on Wowhead and are borrowed from vanilla/TBC.
import { MELEE_RANGE } from "../sim/positioning";

export type AbilityId =
  | "mutilate"
  | "eviscerate"
  | "sliceAndDice"
  | "rupture"
  | "venom"
  | "exposeArmor"
  | "backstab"
  | "sinisterStrike"
  | "coldBlood"
  | "garrote"
  | "ambush"
  | "stealth"
  | "vanish"
  | "kidneyShot"
  | "bladeFlurry"
  | "adrenalineRush"
  | "ghostlyStrike"
  | "hemorrhage"
  | "premeditation"
  | "preparation"
  | "thistleTea";

export interface AbilityDef {
  id: AbilityId;
  name: string;
  /** Short text shown on the action button if its icon fails to load. */
  label: string;
  /** Wowhead icon name; the file lives at public/icons/<icon>.jpg. */
  icon: string;
  /** Default keybind, see input/keybinds.ts for the format. */
  defaultBinding: string;
  cost: number;
  /** Seconds. */
  cooldown: number;
  triggersGcd: boolean;
  finisher?: boolean;
  requiresStealth?: boolean;
  requiresDagger?: boolean;
  requiresOutOfCombat?: boolean;
  /** Max distance to the target in yards. Melee-range abilities also need you to face the target. */
  range?: number;
  requiresBehind?: boolean;
  /** Breaks stealth and starts auto-attacking. */
  offensive: boolean;
  /** Talent id that grants this ability; absent = trained. */
  talent?: string;
  /** A consumable rather than a rogue ability (Preparation doesn't reset it). */
  item?: boolean;
  color: number;
  description: string;
}

export const GCD = 1;
export const BASE_MAX_ENERGY = 100;
// WoW Forever: energy flows continuously at 1 per 0.1 sec (10/sec) instead of vanilla's 20 per 2 sec tick.
export const ENERGY_PER_TICK = 1;
export const ENERGY_TICK_INTERVAL = 0.1;
export const MAX_COMBO_POINTS = 5;
/** Energy refunded when a yellow attack misses or is dodged (vanilla rule). */
export const MISS_REFUND = 0.8;
export const OFFHAND_PENALTY = 0.5;
export const STEALTH_COOLDOWN = 10;
/** Run speed in yards/sec, backpedal speed, and Stealth's movement penalty. */
export const RUN_SPEED = 7;
export const BACKPEDAL_SPEED = 4.5;
export const STEALTH_SPEED_PENALTY = 0.3;

export const SPELL = {
  // Mutilate Rank 4 (spell 1241584)
  mutilate: { weaponPct: 0.75, bonusPerHand: 50, poisonedBonus: 0.2, comboPoints: 2 },
  // Eviscerate Rank 9 (spell 31016). ASSUMPTION: 3% AP per combo point (tooltip says "increased by Attack Power").
  eviscerate: { min: 54, max: 162, perCp: 170, apPerCp: 0.03 },
  // Slice and Dice Rank 2 (spell 6774)
  sliceAndDice: { haste: 0.3, duration: [9, 12, 15, 18, 21] },
  // Rupture Rank 6 (spell 11275). ASSUMPTION: TBC AP coefficients.
  rupture: {
    total: [159, 222, 295, 377, 469],
    duration: [8, 10, 12, 14, 16],
    apCoeff: [0.04, 0.1, 0.18, 0.21, 0.24],
    interval: 2,
  },
  // Venom talent (spell 1310703)
  venom: { poisonDamage: 0.3, applyChance: 0.1, duration: [9, 12, 15, 18, 21] },
  // Expose Armor Rank 5 (spell 11198)
  exposeArmor: { perCp: 450, duration: 30 },
  // Backstab Rank 9 (spell 25300)
  backstab: { weaponPct: 1.5, bonus: 150 },
  // Sinister Strike Rank 8 (spell 11294)
  sinisterStrike: { bonus: 68 },
  // Ambush Rank 6 (spell 11269)
  ambush: { weaponPct: 2.5, bonus: 290 },
  // Garrote Rank 6 (spell 11290). ASSUMPTION: 18% AP over the duration.
  garrote: { total: 552, apCoeff: 0.18, duration: 18, interval: 3 },
  // Kidney Shot Rank 2 (spell 8643): stun 2/3/4/5/6 sec
  kidneyShot: { duration: [2, 3, 4, 5, 6] },
  // Blade Flurry talent (spell 13877)
  bladeFlurry: { haste: 0.2, duration: 15 },
  // Adrenaline Rush talent (spell 13750): energy regen +100%
  adrenalineRush: { regenMult: 2, duration: 15 },
  // Ghostly Strike talent (spell 14278)
  ghostlyStrike: { weaponPct: 1.25, daggerWeaponPct: 1.8 },
  // Hemorrhage talent (spell 16511)
  hemorrhage: { weaponPct: 1, daggerWeaponPct: 1.45, ruptureBonus: 0.15, duration: 15 },
  // Premeditation talent (spell 14183)
  premeditation: { comboPoints: 2, expiry: 20 },
  // Cutthroat window and Thousand Cuts stacks (talents)
  cutthroat: { duration: 10 },
  thousandCuts: { costPerStack: 3, maxStacks: 5, duration: 10 },
  // Thistle Tea (item 7676)
  thistleTea: { energy: 100 },
  // Coup de Grace (spell 1310709): Eviscerate +2% per Deadly Poison stack.
  coupDeGrace: { perStack: 0.02 },
};

export const POISONS = {
  // Instant Poison VI (item 8928)
  instant: { name: "Instant Poison", chance: 0.2, min: 76, max: 100 },
  // Deadly Poison V (item 20844): 92 over 12s = 23 per 3s tick, per stack
  deadly: { name: "Deadly Poison", chance: 0.3, perTick: 23, interval: 3, duration: 12, maxStacks: 5 },
};

export const ABILITIES: AbilityDef[] = [
  {
    id: "mutilate",
    range: MELEE_RANGE,
    talent: "mutilate",
    name: "Mutilate",
    label: "Mut",
    icon: "ability_rogue_deadlybrew",
    defaultBinding: "Digit1",
    cost: 60,
    cooldown: 0,
    triggersGcd: true,
    offensive: true,
    color: 0x3fae5a,
    description:
      "Attacks with both weapons for 75% weapon damage plus 50 each. +20% damage against Poisoned targets. Awards 2 combo points.",
  },
  {
    id: "eviscerate",
    range: MELEE_RANGE,
    name: "Eviscerate",
    label: "Evis",
    icon: "ability_rogue_eviscerate",
    defaultBinding: "Digit2",
    cost: 35,
    cooldown: 0,
    triggersGcd: true,
    finisher: true,
    offensive: true,
    color: 0xc23b3b,
    description:
      "Finisher. 54–162 + 170 per combo point damage, increased by Attack Power. +2% per Deadly Poison stack (Coup de Grace).",
  },
  {
    id: "sliceAndDice",
    name: "Slice and Dice",
    label: "SnD",
    icon: "ability_rogue_slicedice",
    defaultBinding: "Digit3",
    cost: 25,
    cooldown: 0,
    triggersGcd: true,
    finisher: true,
    offensive: false,
    color: 0xe0b23a,
    description: "Finisher. +30% melee attack speed for 9/12/15/18/21 sec.",
  },
  {
    id: "rupture",
    range: MELEE_RANGE,
    name: "Rupture",
    label: "Rup",
    icon: "ability_rogue_rupture",
    defaultBinding: "Digit4",
    cost: 25,
    cooldown: 0,
    triggersGcd: true,
    finisher: true,
    offensive: true,
    color: 0x9c1f2e,
    description: "Finisher. Bleed for 159/222/295/377/469 over 8/10/12/14/16 sec, increased by Attack Power. Ignores armor.",
  },
  {
    id: "venom",
    talent: "venom",
    name: "Venom",
    label: "Ven",
    icon: "inv_sword_31",
    defaultBinding: "Digit5",
    cost: 25,
    cooldown: 0,
    triggersGcd: true,
    finisher: true,
    offensive: false,
    color: 0x6fd14a,
    description: "Finisher. Poisons deal 30% more damage and are 10% more likely to apply for 9/12/15/18/21 sec.",
  },
  {
    id: "exposeArmor",
    range: MELEE_RANGE,
    name: "Expose Armor",
    label: "EA",
    icon: "ability_warrior_riposte",
    defaultBinding: "Digit6",
    cost: 25,
    cooldown: 0,
    triggersGcd: true,
    finisher: true,
    offensive: true,
    color: 0x8a7f6a,
    description: "Finisher. Reduces target armor by 450 per combo point for 30 sec.",
  },
  {
    id: "backstab",
    range: MELEE_RANGE,
    requiresBehind: true,
    name: "Backstab",
    label: "BS",
    icon: "ability_backstab",
    defaultBinding: "KeyQ",
    cost: 60,
    cooldown: 0,
    triggersGcd: true,
    requiresDagger: true,
    offensive: true,
    color: 0x5b6fd6,
    description:
      "150% weapon damage plus 150. Must be behind the target. Requires a dagger in the main hand. Awards 1 combo point.",
  },
  {
    id: "sinisterStrike",
    range: MELEE_RANGE,
    name: "Sinister Strike",
    label: "SS",
    icon: "spell_shadow_ritualofsacrifice",
    defaultBinding: "KeyE",
    cost: 45,
    cooldown: 0,
    triggersGcd: true,
    offensive: true,
    color: 0xb0b6c2,
    description: "Weapon damage plus 68. Awards 1 combo point.",
  },
  {
    id: "coldBlood",
    talent: "coldBlood",
    name: "Cold Blood",
    label: "CB",
    icon: "spell_ice_lament",
    defaultBinding: "KeyR",
    cost: 0,
    cooldown: 180,
    triggersGcd: false,
    offensive: false,
    color: 0x48b7d6,
    description: "Your next Sinister Strike, Backstab, Ambush, Eviscerate, or Mutilate gets +100% crit chance. Off the GCD.",
  },
  {
    id: "garrote",
    range: MELEE_RANGE,
    requiresBehind: true,
    name: "Garrote",
    label: "Gar",
    icon: "ability_rogue_garrote",
    defaultBinding: "KeyF",
    cost: 50,
    cooldown: 0,
    triggersGcd: true,
    requiresStealth: true,
    offensive: true,
    color: 0x7a2330,
    description: "Requires Stealth and being behind the target. Bleed for 552 over 18 sec, increased by Attack Power. Awards 1 combo point.",
  },
  {
    id: "ambush",
    range: MELEE_RANGE,
    requiresBehind: true,
    name: "Ambush",
    label: "Amb",
    icon: "ability_rogue_ambush",
    defaultBinding: "KeyG",
    cost: 60,
    cooldown: 0,
    triggersGcd: true,
    requiresStealth: true,
    requiresDagger: true,
    offensive: true,
    color: 0x6a4bb8,
    description: "Requires Stealth, a dagger, and being behind the target. 250% weapon damage plus 290. Awards 1 combo point.",
  },
  {
    id: "stealth",
    name: "Stealth",
    label: "Stl",
    icon: "ability_stealth",
    defaultBinding: "KeyT",
    cost: 0,
    cooldown: STEALTH_COOLDOWN,
    triggersGcd: false,
    requiresOutOfCombat: true,
    offensive: false,
    color: 0x3a3f5c,
    description: "Enter Stealth (out of combat only). Press again to cancel. 10 sec cooldown after Stealth ends.",
  },
  {
    id: "vanish",
    name: "Vanish",
    label: "Van",
    icon: "ability_vanish",
    defaultBinding: "KeyV",
    cost: 0,
    cooldown: 300,
    triggersGcd: false,
    offensive: false,
    color: 0x27293a,
    description: "Drop combat and enter Stealth, enabling another Garrote or Ambush. 5 min cooldown.",
  },
  {
    id: "kidneyShot",
    range: MELEE_RANGE,
    name: "Kidney Shot",
    label: "KS",
    icon: "ability_rogue_kidneyshot",
    defaultBinding: "KeyX",
    cost: 25,
    cooldown: 20,
    triggersGcd: true,
    finisher: true,
    offensive: true,
    color: 0x9a6a3a,
    description: "Finisher. Stuns the target for 2/3/4/5/6 sec. Pairs with Improved Kidney Shot.",
  },
  {
    id: "bladeFlurry",
    talent: "bladeFlurry",
    name: "Blade Flurry",
    label: "BF",
    icon: "ability_warrior_punishingblow",
    defaultBinding: "KeyC",
    cost: 25,
    cooldown: 120,
    triggersGcd: true,
    offensive: false,
    color: 0xb04a2a,
    description: "+20% melee attack speed for 15 sec. (The extra target does nothing against one dummy.)",
  },
  {
    id: "adrenalineRush",
    talent: "adrenalineRush",
    name: "Adrenaline Rush",
    label: "AR",
    icon: "spell_shadow_shadowworddominate",
    defaultBinding: "KeyZ",
    cost: 0,
    cooldown: 300,
    triggersGcd: false,
    offensive: false,
    color: 0xd6a020,
    description: "Doubles energy regeneration for 15 sec. Off the GCD.",
  },
  {
    id: "ghostlyStrike",
    range: MELEE_RANGE,
    talent: "ghostlyStrike",
    name: "Ghostly Strike",
    label: "GS",
    icon: "spell_shadow_curse",
    defaultBinding: "Digit7",
    cost: 40,
    cooldown: 20,
    triggersGcd: true,
    offensive: true,
    color: 0x5a7a9a,
    description: "125% weapon damage (180% with a main-hand dagger). Awards 1 combo point.",
  },
  {
    id: "hemorrhage",
    range: MELEE_RANGE,
    talent: "hemorrhage",
    name: "Hemorrhage",
    label: "Hemo",
    icon: "spell_shadow_lifedrain",
    defaultBinding: "Digit8",
    cost: 35,
    cooldown: 0,
    triggersGcd: true,
    offensive: true,
    color: 0x8a1a2a,
    description: "100% weapon damage (145% with a dagger). Target takes 15% more Rupture damage for 15 sec. Awards 1 combo point.",
  },
  {
    id: "premeditation",
    range: 20,
    talent: "premeditation",
    name: "Premeditation",
    label: "Pre",
    icon: "spell_shadow_possession",
    defaultBinding: "KeyH",
    cost: 0,
    cooldown: 120,
    triggersGcd: false,
    offensive: false,
    color: 0x4a3a6a,
    description: "Adds 2 combo points. Add to or spend them within 20 sec or they are lost. Off the GCD.",
  },
  {
    id: "preparation",
    talent: "preparation",
    name: "Preparation",
    label: "Prep",
    icon: "spell_shadow_antishadow",
    defaultBinding: "KeyB",
    cost: 0,
    cooldown: 600,
    triggersGcd: false,
    offensive: false,
    color: 0x3a4a5a,
    description: "Finishes the cooldown on your other rogue abilities. 10 min cooldown.",
  },
  {
    id: "thistleTea",
    item: true,
    name: "Thistle Tea",
    label: "Tea",
    icon: "inv_drink_milk_05",
    defaultBinding: "Shift+KeyC",
    cost: 0,
    cooldown: 300,
    triggersGcd: false,
    offensive: false,
    color: 0x7a9a4a,
    description: "Item. Instantly restores 100 energy. Off the GCD. 5 min cooldown.",
  },
];
