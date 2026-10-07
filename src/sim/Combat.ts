import {
  ABILITIES,
  BASE_MAX_ENERGY,
  ENERGY_PER_TICK,
  ENERGY_TICK_INTERVAL,
  GCD,
  MAX_COMBO_POINTS,
  MISS_REFUND,
  OFFHAND_PENALTY,
  POISONS,
  SPELL,
  STEALTH_COOLDOWN,
  STEALTH_SPEED_PENALTY,
  type AbilityDef,
  type AbilityId,
} from "../data/abilities";
import { Meter } from "./Meter";
import { IN_POSITION, MELEE_RANGE, type Positioning } from "./positioning";
import { HANDS, HIT_TABLES, armorMultiplier, type Hand, type HitTable, type SimConfig, type Weapon } from "./stats";
import { rankOf, talentEffects, type TalentEffects } from "./talents";

/** A press this close to being usable gets queued instead of rejected. */
export const QUEUE_WINDOW = 0.4;

export type Outcome = "hit" | "crit" | "glance" | "miss" | "dodge" | "resist";
export type School = "physical" | "bleed" | "nature";

export type CombatEvent =
  | { type: "use"; ability: AbilityDef }
  | {
      type: "damage";
      sourceId: string;
      name: string;
      amount: number;
      outcome: Outcome;
      school: School;
      periodic: boolean;
      hand?: Hand;
    }
  | { type: "stealth"; active: boolean }
  | { type: "target"; active: boolean }
  | { type: "reset" };

export type UseResult =
  | "ok"
  | "queued"
  | "onCooldown"
  | "onGcd"
  | "noEnergy"
  | "noComboPoints"
  | "needsStealth"
  | "needsDagger"
  | "inCombat"
  | "noTarget"
  | "outOfRange"
  | "notFacing"
  | "notBehind"
  | "notLearned"
  | "unknown";

type Blocker = Exclude<UseResult, "queued" | "unknown">;
const QUEUEABLE = new Set<Blocker>(["onCooldown", "onGcd", "noEnergy"]);

type BuffId = "sliceAndDice" | "venom" | "coldBlood" | "bladeFlurry" | "adrenalineRush" | "cutthroat" | "thousandCuts";
const BUFF_NAMES: Record<BuffId, string> = {
  sliceAndDice: "Slice and Dice",
  venom: "Venom",
  coldBlood: "Cold Blood",
  bladeFlurry: "Blade Flurry",
  adrenalineRush: "Adrenaline Rush",
  cutthroat: "Cutthroat",
  thousandCuts: "Thousand Cuts",
};

interface Buff {
  end: number;
  stacks?: number;
}

interface Dot {
  name: string;
  perTick: number;
  ticksLeft: number;
  nextTick: number;
  interval: number;
}

/** Debuff icons (Wowhead icon names) for the nameplate. */
export const DEBUFF_ICONS: Record<string, string> = {
  deadly: "ability_rogue_dualweild",
  rupture: "ability_rogue_rupture",
  garrote: "ability_rogue_garrote",
  exposeArmor: "ability_warrior_riposte",
  hemorrhage: "spell_shadow_lifedrain",
  kidneyShot: "ability_rogue_kidneyshot",
};

export interface StatusEntry {
  id: string;
  name: string;
  /** Wowhead icon name (debuffs only). */
  icon?: string;
  /** Seconds; Infinity for until-used buffs. */
  remaining: number;
  stacks?: number;
}

/** Yellow-strike options shared by the combo-point builders. */
interface StrikeOptions {
  weaponPct: number;
  bonus: number;
  critBonus: number;
  lethality: boolean;
  /** Extra damage multiplier from talents etc. */
  mult: number;
}

/**
 * Level-60 rogue vs a target dummy, no rendering. Advance with update(dt),
 * drive with use(id), observe via on(). Random rolls go through `rng` so tests
 * can make them deterministic.
 */
export class Combat {
  time = 0;
  energy = 0;
  comboPoints = 0;
  inCombat = false;
  stealthed = false;
  autoAttacking = false;
  meter = new Meter();
  /** Talent-derived numbers for the current build. */
  fx: TalentEffects;
  /** Abilities this build can use (trained + talented). */
  abilities: AbilityDef[] = [];
  /** Reported each frame by the 3D world; defaults to standing right behind the dummy. */
  position: Positioning = { ...IN_POSITION };
  /** Whether the dummy is selected. Survives fight resets; the game starts untargeted. */
  targeted = true;

  private nextEnergyTick = 0;
  private gcdEnd = 0;
  private cooldownEnd = new Map<AbilityId, number>();
  private queued: AbilityDef | null = null;
  /** Swing timer progress, 0..1; a swing lands at 1. */
  private swing: Record<Hand, number> = { mh: 1, oh: 0.5 };
  private buffs = new Map<BuffId, Buff>();
  private deadly: { stacks: number; end: number; nextTick: number } | null = null;
  private dots = new Map<"rupture" | "garrote", Dot>();
  private exposeArmor: { amount: number; end: number } | null = null;
  private hemorrhageEnd = -Infinity;
  private kidneyShotEnd = -Infinity;
  /** Premeditation's combo points vanish at this time unless combo points change first. */
  private premeditationEnd: number | null = null;
  private lastSealFate = -Infinity;
  private listeners = new Set<(e: CombatEvent) => void>();

  constructor(
    public config: SimConfig,
    private rng: () => number = Math.random,
  ) {
    this.fx = talentEffects(config.talents);
    this.abilities = this.learnedAbilities();
    this.reset();
  }

  on(fn: (e: CombatEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  configure(config: SimConfig): void {
    this.config = config;
    this.fx = talentEffects(config.talents);
    this.abilities = this.learnedAbilities();
    this.reset();
  }

  reset(): void {
    this.time = 0;
    this.energy = this.maxEnergy;
    this.comboPoints = 0;
    this.inCombat = false;
    this.stealthed = false;
    this.autoAttacking = false;
    this.meter = new Meter();
    // Energy ticks on a fixed clock; you don't control its phase.
    this.nextEnergyTick = this.rng() * ENERGY_TICK_INTERVAL;
    this.gcdEnd = 0;
    this.cooldownEnd.clear();
    this.queued = null;
    this.swing = { mh: 1, oh: 0.5 };
    this.buffs.clear();
    this.deadly = null;
    this.dots.clear();
    this.exposeArmor = null;
    this.hemorrhageEnd = -Infinity;
    this.kidneyShotEnd = -Infinity;
    this.premeditationEnd = null;
    this.lastSealFate = -Infinity;
    this.emit({ type: "reset" });
  }

  setPositioning(p: Positioning): void {
    this.position = p;
  }

  /** Select or clear the target. Clearing it stops auto-attacks and drops a queued press, as in WoW. */
  setTargeted(on: boolean): void {
    if (this.targeted === on) return;
    this.targeted = on;
    if (!on) {
      this.autoAttacking = false;
      this.queued = null;
    }
    this.emit({ type: "target", active: on });
  }

  /** Movement speed multiplier: Stealth slows you, Camouflage reduces the penalty. */
  get speedMultiplier(): number {
    return this.stealthed ? 1 - Math.max(0, STEALTH_SPEED_PENALTY - this.fx.camouflageSpeed) : 1;
  }

  get inMeleeRange(): boolean {
    return this.targeted && this.position.distance <= MELEE_RANGE && this.position.facing;
  }

  get maxEnergy(): number {
    return BASE_MAX_ENERGY + this.fx.vigorEnergy;
  }

  private get energyPerTick(): number {
    return ENERGY_PER_TICK * (this.buffs.has("adrenalineRush") ? SPELL.adrenalineRush.regenMult : 1);
  }

  update(dt: number): void {
    this.time += dt;

    while (this.time >= this.nextEnergyTick) {
      this.energy = Math.min(this.maxEnergy, this.energy + this.energyPerTick);
      this.nextEnergyTick += ENERGY_TICK_INTERVAL;
    }

    for (const [id, buff] of this.buffs) if (this.time >= buff.end) this.buffs.delete(id);
    if (this.exposeArmor && this.time >= this.exposeArmor.end) this.exposeArmor = null;
    if (this.premeditationEnd !== null && this.time >= this.premeditationEnd) {
      this.premeditationEnd = null;
      this.comboPoints = Math.max(0, this.comboPoints - SPELL.premeditation.comboPoints);
    }

    this.tickDeadlyPoison();
    this.tickDots();
    this.tickSwings(dt);

    if (this.queued) {
      const blocker = this.blocker(this.queued);
      if (blocker === "ok") {
        const ability = this.queued;
        this.queued = null;
        this.execute(ability);
      } else if (!QUEUEABLE.has(blocker)) {
        // Walked out of range or turned away: a queued press shouldn't fire later by surprise.
        this.queued = null;
      }
    }
  }

  use(id: AbilityId): UseResult {
    const ability = ABILITIES.find((a) => a.id === id);
    if (!ability) return "unknown";
    if (!this.abilities.includes(ability)) return "notLearned";

    // Stealth is a toggle.
    if (id === "stealth" && this.stealthed) {
      this.breakStealth();
      return "ok";
    }

    const blocker = this.blocker(ability);
    if (blocker === "ok") {
      this.execute(ability);
      return "ok";
    }
    if (QUEUEABLE.has(blocker) && this.waitTime(ability) <= QUEUE_WINDOW) {
      this.queued = ability;
      return "queued";
    }
    return blocker;
  }

  // ---- State queries for the HUD ----

  /** Energy cost after talents (Improved Sinister Strike, Thousand Cuts, ...). */
  cost(a: AbilityDef): number {
    const fx = this.fx;
    let reduction = 0;
    if (a.id === "sinisterStrike") reduction = fx.improvedSinisterStrikeCost;
    if (a.id === "eviscerate") reduction = fx.flawlessExecutionCost;
    if (a.id === "exposeArmor") reduction = fx.improvedExposeArmorCost;
    if (a.id === "garrote") reduction = fx.dirtyDeedsCost;
    if (a.id === "backstab" || a.id === "hemorrhage") {
      reduction = (this.buffs.get("thousandCuts")?.stacks ?? 0) * SPELL.thousandCuts.costPerStack;
    }
    return Math.max(0, a.cost - reduction);
  }

  cooldownRemaining(id: AbilityId): number {
    return Math.max(0, (this.cooldownEnd.get(id) ?? 0) - this.time);
  }

  gcdRemaining(): number {
    return Math.max(0, this.gcdEnd - this.time);
  }

  /** What the button's sweep should show: the longer of its cooldown and the GCD. */
  readiness(ability: AbilityDef): { remaining: number; total: number } {
    const cd = this.cooldownRemaining(ability.id);
    const gcd = ability.triggersGcd ? this.gcdRemaining() : 0;
    return cd >= gcd ? { remaining: cd, total: this.cooldownOf(ability) } : { remaining: gcd, total: GCD };
  }

  /** Why the ability can't be used right now, ignoring cooldown/GCD (those are shown by the sweep). */
  unusableReason(ability: AbilityDef): Blocker | null {
    if (ability.id === "stealth" && this.stealthed) return null;
    const b = this.blocker(ability);
    // WoW doesn't grey out buttons for having no target; pressing one just says so.
    return b === "ok" || b === "onCooldown" || b === "onGcd" || b === "noTarget" ? null : b;
  }

  get queuedAbility(): AbilityDef | null {
    return this.queued;
  }

  swingProgress(hand: Hand): number {
    return Math.min(1, this.swing[hand]);
  }

  get playerBuffs(): StatusEntry[] {
    const list: StatusEntry[] = [...this.buffs].map(([id, b]) => ({
      id,
      name: BUFF_NAMES[id],
      remaining: b.end - this.time,
      stacks: b.stacks,
    }));
    if (this.stealthed) list.unshift({ id: "stealth", name: "Stealth", remaining: Infinity });
    return list;
  }

  get targetDebuffs(): StatusEntry[] {
    return this.debuffList().map((d) => ({ ...d, icon: DEBUFF_ICONS[d.id] }));
  }

  private debuffList(): StatusEntry[] {
    const list: StatusEntry[] = [];
    if (this.deadly) {
      list.push({ id: "deadly", name: "Deadly Poison", remaining: this.deadly.end - this.time, stacks: this.deadly.stacks });
    }
    for (const [id, dot] of this.dots) {
      list.push({ id, name: dot.name, remaining: dot.nextTick - this.time + (dot.ticksLeft - 1) * dot.interval });
    }
    if (this.exposeArmor) {
      list.push({ id: "exposeArmor", name: `Expose Armor (-${this.exposeArmor.amount})`, remaining: this.exposeArmor.end - this.time });
    }
    if (this.time < this.hemorrhageEnd) list.push({ id: "hemorrhage", name: "Hemorrhage", remaining: this.hemorrhageEnd - this.time });
    if (this.time < this.kidneyShotEnd) list.push({ id: "kidneyShot", name: "Kidney Shot", remaining: this.kidneyShotEnd - this.time });
    return list;
  }

  // ---- Rules ----

  private learnedAbilities(): AbilityDef[] {
    return ABILITIES.filter((a) => !a.talent || rankOf(this.config.talents, a.talent) > 0);
  }

  private get table(): HitTable {
    return HIT_TABLES[this.config.target.level];
  }

  private get hitChance(): number {
    return this.config.character.hitChance + this.fx.precisionHit;
  }

  private weapon(hand: Hand): Weapon {
    return this.config.character[hand];
  }

  /** Melee crit % for attacks with `hand`'s weapon, before ability-specific bonuses. */
  critChance(hand: Hand): number {
    const type = this.weapon(hand).type;
    const hackAndSlash = type === "dagger" || type === "fist" ? this.fx.hackAndSlashCrit : 0;
    return this.config.character.critChance + this.fx.maliceCrit + hackAndSlash - this.table.critSuppression;
  }

  private cooldownOf(a: AbilityDef): number {
    if (a.id === "stealth") return Math.max(0, STEALTH_COOLDOWN - this.fx.camouflageCooldown);
    if (a.id === "vanish") return Math.max(0, a.cooldown - this.fx.elusivenessCooldown);
    return a.cooldown;
  }

  private blocker(a: AbilityDef): Blocker {
    if (a.requiresOutOfCombat && this.inCombat) return "inCombat";
    const cutthroatAmbush = a.id === "ambush" && this.buffs.has("cutthroat");
    if (a.requiresStealth && !this.stealthed && !cutthroatAmbush) return "needsStealth";
    if (a.requiresDagger && this.weapon("mh").type !== "dagger") return "needsDagger";
    if (a.range !== undefined && !this.targeted) return "noTarget";
    if (a.range !== undefined && this.position.distance > a.range) return "outOfRange";
    if (a.range === MELEE_RANGE && !this.position.facing) return "notFacing";
    const anyAngle = a.id === "garrote" && this.fx.garroteFromAnyAngle;
    if (a.requiresBehind && !this.position.behind && !anyAngle) return "notBehind";
    if (this.cooldownRemaining(a.id) > 0) return "onCooldown";
    if (a.triggersGcd && this.gcdRemaining() > 0) return "onGcd";
    if (this.energy < this.cost(a)) return "noEnergy";
    if (a.finisher && this.comboPoints === 0) return "noComboPoints";
    return "ok";
  }

  private waitTime(a: AbilityDef): number {
    const gcd = a.triggersGcd ? this.gcdRemaining() : 0;
    const cost = this.cost(a);
    let energy = 0;
    if (this.energy < cost) {
      const ticks = Math.ceil((cost - this.energy) / this.energyPerTick);
      energy = this.nextEnergyTick - this.time + (ticks - 1) * ENERGY_TICK_INTERVAL;
    }
    return Math.max(this.cooldownRemaining(a.id), gcd, energy);
  }

  private execute(a: AbilityDef): void {
    const cost = this.cost(a);
    if (a.triggersGcd) this.gcdEnd = this.time + GCD;
    if (a.cooldown > 0 && a.id !== "stealth") this.cooldownEnd.set(a.id, this.time + this.cooldownOf(a));
    this.energy -= cost;
    if (a.id === "backstab" || a.id === "hemorrhage") this.buffs.delete("thousandCuts");
    if (a.offensive) this.engage();
    this.emit({ type: "use", ability: a });
    this.effects[a.id](a, cost);
  }

  private engage(): void {
    if (this.stealthed) this.breakStealth();
    this.inCombat = true;
    this.autoAttacking = true;
  }

  private breakStealth(): void {
    this.stealthed = false;
    this.cooldownEnd.set("stealth", this.time + this.cooldownOf(ABILITIES.find((a) => a.id === "stealth")!));
    this.emit({ type: "stealth", active: false });
  }

  private enterStealth(): void {
    this.stealthed = true;
    this.autoAttacking = false;
    this.emit({ type: "stealth", active: true });
  }

  private readonly effects: Record<AbilityId, (a: AbilityDef, cost: number) => void> = {
    mutilate: (a, cost) => {
      if (!this.landsYellow(a, cost)) return;
      const fx = this.fx;
      const M = SPELL.mutilate;
      const coldBlood = this.consumeColdBlood();
      const mult = (this.deadly ? 1 + M.poisonedBonus : 1) * (1 + fx.opportunityDamage);
      let anyCrit = false;
      for (const hand of HANDS) {
        // ASSUMPTION: Mutilate's off-hand strike ignores the dual-wield penalty (as in TBC),
        // but Dual Wield Specialization still raises it.
        const handMult = hand === "oh" ? 1 + fx.dualWieldSpecDamage : 1;
        const raw = (this.weaponDamage(hand) * M.weaponPct + M.bonusPerHand) * mult * handMult;
        const crit = this.rollCrit(hand, fx.puncturingWoundsMutilateCrit + coldBlood);
        anyCrit ||= crit;
        this.dealPhysical(a.id, a.name, raw, crit ? this.critMult(true) : 1, crit ? "crit" : "hit", hand);
        this.onWeaponHit(hand);
      }
      this.addComboPoints(M.comboPoints, anyCrit);
    },

    eviscerate: (a, cost) => {
      if (!this.landsYellow(a, cost)) return;
      const E = SPELL.eviscerate;
      const fx = this.fx;
      const cp = this.spendComboPoints();
      const crit = this.rollCrit("mh", this.consumeColdBlood());
      const stacks = this.deadly?.stacks ?? 0;
      const raw =
        (this.randRange(E.min, E.max) + E.perCp * cp + E.apPerCp * cp * this.config.character.attackPower) *
        (1 + fx.improvedEviscerateDamage) *
        (1 + fx.aggressionDamage) *
        (1 + SPELL.coupDeGrace.perStack * stacks);
      this.dealPhysical(a.id, a.name, raw, crit ? this.critMult(false) : 1, crit ? "crit" : "hit", "mh");
      this.onWeaponHit("mh");
    },

    sliceAndDice: () => {
      const cp = this.spendComboPoints();
      this.setBuff("sliceAndDice", SPELL.sliceAndDice.duration[cp - 1] * (1 + this.fx.improvedSndDuration));
    },

    rupture: (a, cost) => {
      if (!this.landsYellow(a, cost)) return;
      const R = SPELL.rupture;
      const cp = this.spendComboPoints();
      const total = (R.total[cp - 1] + R.apCoeff[cp - 1] * this.config.character.attackPower) * (1 + this.fx.serratedRuptureDamage);
      const ticks = R.duration[cp - 1] / R.interval;
      this.dots.set("rupture", { name: a.name, perTick: total / ticks, ticksLeft: ticks, nextTick: this.time + R.interval, interval: R.interval });
    },

    venom: () => {
      const cp = this.spendComboPoints();
      this.setBuff("venom", SPELL.venom.duration[cp - 1]);
    },

    exposeArmor: (a, cost) => {
      if (!this.landsYellow(a, cost)) return;
      const cp = this.spendComboPoints();
      this.exposeArmor = { amount: SPELL.exposeArmor.perCp * cp, end: this.time + SPELL.exposeArmor.duration };
      if (cp === MAX_COMBO_POINTS && this.fx.improvedExposeArmorRefund > 0) {
        this.comboPoints = Math.min(MAX_COMBO_POINTS, this.comboPoints + this.fx.improvedExposeArmorRefund);
      }
    },

    kidneyShot: (a, cost) => {
      if (!this.landsYellow(a, cost)) return;
      const cp = this.spendComboPoints();
      this.kidneyShotEnd = this.time + SPELL.kidneyShot.duration[cp - 1];
    },

    backstab: (a, cost) => {
      if (!this.landsYellow(a, cost)) return;
      const fx = this.fx;
      const crit = this.strike(a, "mh", {
        ...SPELL.backstab,
        critBonus: fx.puncturingWoundsBackstabCrit + this.consumeColdBlood(),
        lethality: true,
        mult: (1 + fx.aggressionDamage) * (1 + fx.opportunityDamage),
      });
      const extra = this.chance(fx.puncturingWoundsBackstabExtraCp) ? 1 : 0;
      this.addComboPoints(1 + extra, crit);
      if (this.chance(fx.cutthroatChance)) this.setBuff("cutthroat", SPELL.cutthroat.duration);
    },

    sinisterStrike: (a, cost) => {
      if (!this.landsYellow(a, cost)) return;
      const crit = this.strike(a, "mh", {
        weaponPct: 1,
        bonus: SPELL.sinisterStrike.bonus,
        critBonus: this.consumeColdBlood(),
        lethality: true,
        mult: (1 + this.fx.aggressionDamage) * this.quietusMult(),
      });
      this.addComboPoints(1, crit);
    },

    ghostlyStrike: (a, cost) => {
      if (!this.landsYellow(a, cost)) return;
      const G = SPELL.ghostlyStrike;
      const dagger = this.weapon("mh").type === "dagger";
      const crit = this.strike(a, "mh", {
        weaponPct: dagger ? G.daggerWeaponPct : G.weaponPct,
        bonus: 0,
        critBonus: 0,
        lethality: true,
        mult: this.quietusMult(),
      });
      this.addComboPoints(1, crit);
    },

    hemorrhage: (a, cost) => {
      if (!this.landsYellow(a, cost)) return;
      const H = SPELL.hemorrhage;
      const dagger = this.weapon("mh").type === "dagger";
      const crit = this.strike(a, "mh", {
        weaponPct: dagger ? H.daggerWeaponPct : H.weaponPct,
        bonus: 0,
        critBonus: 0,
        lethality: true,
        mult: this.quietusMult(),
      });
      this.hemorrhageEnd = this.time + H.duration;
      this.addComboPoints(1, crit);
    },

    ambush: (a, cost) => {
      this.buffs.delete("cutthroat");
      if (!this.landsYellow(a, cost)) return;
      const fx = this.fx;
      const crit = this.strike(a, "mh", {
        ...SPELL.ambush,
        critBonus: fx.improvedAmbushCrit + this.consumeColdBlood(),
        lethality: false,
        mult: 1 + fx.opportunityDamage,
      });
      this.addComboPoints(1 + (this.chance(fx.initiativeChance) ? 1 : 0), crit);
    },

    garrote: (a, cost) => {
      if (!this.landsYellow(a, cost)) return;
      const G = SPELL.garrote;
      const fx = this.fx;
      const total = (G.total + G.apCoeff * this.config.character.attackPower) * (1 + fx.opportunityDamage);
      const ticks = G.duration / G.interval;
      this.dots.set("garrote", { name: a.name, perTick: total / ticks, ticksLeft: ticks, nextTick: this.time + G.interval, interval: G.interval });
      this.addComboPoints(1 + (this.chance(fx.initiativeChance) ? 1 : 0), false);
    },

    coldBlood: () => this.setBuff("coldBlood", Infinity),

    bladeFlurry: () => this.setBuff("bladeFlurry", SPELL.bladeFlurry.duration),

    adrenalineRush: () => this.setBuff("adrenalineRush", SPELL.adrenalineRush.duration),

    premeditation: () => {
      this.comboPoints = Math.min(MAX_COMBO_POINTS, this.comboPoints + SPELL.premeditation.comboPoints);
      this.premeditationEnd = this.time + SPELL.premeditation.expiry;
    },

    preparation: () => {
      for (const id of this.cooldownEnd.keys()) {
        if (id !== "preparation" && !ABILITIES.find((a) => a.id === id)?.item) this.cooldownEnd.delete(id);
      }
    },

    thistleTea: () => {
      this.energy = Math.min(this.maxEnergy, this.energy + SPELL.thistleTea.energy);
    },

    stealth: () => this.enterStealth(),

    vanish: () => {
      this.inCombat = false;
      this.enterStealth();
    },
  };

  /** A weapon-damage yellow strike that already passed the hit roll. Returns whether it crit. */
  private strike(a: AbilityDef, hand: Hand, o: StrikeOptions): boolean {
    const crit = this.rollCrit(hand, o.critBonus);
    const raw = (this.weaponDamage(hand) * o.weaponPct + o.bonus) * o.mult;
    this.dealPhysical(a.id, a.name, raw, crit ? this.critMult(o.lethality) : 1, crit ? "crit" : "hit", hand);
    this.onWeaponHit(hand);
    return crit;
  }

  /** Rolls the yellow hit table. On a miss/dodge, refunds energy and reports it. */
  private landsYellow(a: AbilityDef, cost: number): boolean {
    const r = this.rng() * 100;
    const miss = Math.max(0, this.table.yellowMiss - this.hitChance);
    const dodge = Math.max(0, this.table.dodge - this.fx.weaponExpertiseDodge);
    const outcome: Outcome | null = r < miss ? "miss" : r < miss + dodge ? "dodge" : null;
    if (!outcome) return true;
    this.energy = Math.min(this.maxEnergy, this.energy + Math.floor(cost * MISS_REFUND));
    this.emit({ type: "damage", sourceId: a.id, name: a.name, amount: 0, outcome, school: "physical", periodic: false });
    return false;
  }

  /** Rolls only when there's a chance, so builds without a talent don't consume random numbers for it. */
  private chance(p: number): boolean {
    return p > 0 && this.rng() < p;
  }

  private rollCrit(hand: Hand, bonus: number): boolean {
    return this.rng() * 100 < this.critChance(hand) + bonus;
  }

  private critMult(lethality: boolean): number {
    return 2 + (lethality ? this.fx.lethalityCritBonus : 0);
  }

  private consumeColdBlood(): number {
    if (!this.buffs.has("coldBlood")) return 0;
    this.buffs.delete("coldBlood");
    return 100;
  }

  private setBuff(id: BuffId, duration: number, stacks?: number): void {
    this.buffs.set(id, { end: this.time + duration, stacks });
  }

  private quietusMult(): number {
    return this.config.target.executePhase ? 1 + this.fx.quietusDamage : 1;
  }

  private addComboPoints(n: number, crit: boolean): void {
    let gain = n;
    if (crit && this.time - this.lastSealFate >= this.fx.sealFateIcd && this.chance(this.fx.sealFateChance)) {
      this.lastSealFate = this.time;
      gain++;
    }
    this.comboPoints = Math.min(MAX_COMBO_POINTS, this.comboPoints + gain);
    this.premeditationEnd = null;
  }

  private spendComboPoints(): number {
    const cp = this.comboPoints;
    this.comboPoints = 0;
    this.premeditationEnd = null;
    if (this.chance(this.fx.relentlessChancePerCp * cp)) {
      this.energy = Math.min(this.maxEnergy, this.energy + this.fx.relentlessEnergy);
    }
    if (this.chance(this.fx.ruthlessnessChance)) this.comboPoints = 1;
    return cp;
  }

  private randRange(min: number, max: number): number {
    return min + this.rng() * (max - min);
  }

  private weaponDamage(hand: Hand): number {
    const w = this.weapon(hand);
    return this.randRange(w.min, w.max) + (this.config.character.attackPower / 14) * w.speed;
  }

  /** Applies to everything: Murder vs Humanoids, Improved Kidney Shot while stunned. */
  private globalMult(): number {
    const murder = this.config.target.humanoid ? 1 + this.fx.murderDamage : 1;
    const kidney = this.time < this.kidneyShotEnd ? 1 + this.fx.improvedKidneyShotDamage : 1;
    return murder * kidney;
  }

  private poisonMult(): number {
    const venom = this.buffs.has("venom") ? 1 + SPELL.venom.poisonDamage : 1;
    return (1 + this.fx.vilePoisonsDamage) * venom * this.globalMult();
  }

  private armorMult(hand: Hand): number {
    const mace = this.weapon(hand).type === "mace" ? this.fx.hackAndSlashArmorPen : 0;
    const armor = (this.config.target.armor - (this.exposeArmor?.amount ?? 0)) * (1 - this.fx.serratedArmorPen - mace);
    return armorMultiplier(armor);
  }

  private dealPhysical(sourceId: string, name: string, raw: number, mult: number, outcome: Outcome, hand: Hand): void {
    const amount = Math.round(raw * mult * this.armorMult(hand) * this.globalMult());
    this.deal(sourceId, name, amount, outcome, "physical", false, hand);
  }

  private deal(sourceId: string, name: string, amount: number, outcome: Outcome, school: School, periodic: boolean, hand?: Hand): void {
    this.meter.record(this.time, sourceId, name, amount);
    this.emit({ type: "damage", sourceId, name, amount, outcome, school, periodic, hand });
  }

  private tickSwings(dt: number): void {
    const snd = this.buffs.has("sliceAndDice") ? 1 + SPELL.sliceAndDice.haste : 1;
    const flurry = this.buffs.has("bladeFlurry") ? 1 + SPELL.bladeFlurry.haste : 1;
    const haste = snd * flurry;
    for (const hand of HANDS) {
      // The swing timer keeps running while not attacking (or out of reach) but holds at "ready".
      this.swing[hand] += (dt * haste) / this.weapon(hand).speed;
      if (!this.autoAttacking || !this.inMeleeRange) {
        this.swing[hand] = Math.min(this.swing[hand], 1);
      } else if (this.swing[hand] >= 1) {
        this.swing[hand] = Math.min(this.swing[hand] - 1, 1);
        this.autoAttack(hand, true);
      }
    }
  }

  /** One-roll white hit table: miss, dodge, glance, crit, hit. */
  private autoAttack(hand: Hand, canProcExtra: boolean): void {
    const t = this.table;
    const r = this.rng() * 100;
    const miss = Math.max(0, t.whiteMiss - this.hitChance);
    let edge = miss;
    const outcome: Outcome =
      r < edge ? "miss"
      : r < (edge += Math.max(0, t.dodge - this.fx.weaponExpertiseDodge)) ? "dodge"
      : r < (edge += t.glanceChance) ? "glance"
      : r < (edge += this.critChance(hand)) ? "crit"
      : "hit";

    if (outcome === "miss" || outcome === "dodge") {
      this.emit({ type: "damage", sourceId: "melee", name: "Auto Attack", amount: 0, outcome, school: "physical", periodic: false, hand });
      return;
    }
    const handMult = hand === "oh" ? OFFHAND_PENALTY * (1 + this.fx.dualWieldSpecDamage) : 1;
    const mult = handMult * (outcome === "glance" ? t.glanceMult : outcome === "crit" ? 2 : 1);
    this.dealPhysical("melee", "Auto Attack", this.weaponDamage(hand), mult, outcome, hand);
    this.onWeaponHit(hand, canProcExtra);
  }

  /** Poison application and Hack and Slash sword/axe extra attacks after a landed weapon hit. */
  private onWeaponHit(hand: Hand, canProcExtra = true): void {
    this.tryPoison(hand);
    const type = this.weapon(hand).type;
    if (canProcExtra && (type === "sword" || type === "axe") && this.chance(this.fx.hackAndSlashExtraAttack)) {
      this.autoAttack(hand, false);
    }
  }

  private tryPoison(hand: Hand): void {
    const kind = this.weapon(hand).poison;
    if (kind === "none") return;
    const P = POISONS[kind];
    const chance = P.chance + this.fx.improvedPoisonsChance + (this.buffs.has("venom") ? SPELL.venom.applyChance : 0);
    if (this.rng() >= chance) return;

    const sourceId = `${kind}Poison`;
    if (this.rng() * 100 < this.table.spellMiss) {
      this.emit({ type: "damage", sourceId, name: P.name, amount: 0, outcome: "resist", school: "nature", periodic: false });
      return;
    }

    if (kind === "instant") {
      const I = POISONS.instant;
      // ASSUMPTION: poisons crit only from Malice (rogues have ~0 spell crit), for 1.5x.
      const crit = this.rng() * 100 < this.fx.maliceCrit;
      const amount = Math.round(this.randRange(I.min, I.max) * this.poisonMult() * (crit ? 1.5 : 1));
      this.deal(sourceId, P.name, amount, crit ? "crit" : "hit", "nature", false);
    } else {
      const D = POISONS.deadly;
      if (!this.deadly) {
        this.deadly = { stacks: 1, end: this.time + D.duration, nextTick: this.time + D.interval };
      } else {
        this.deadly.stacks = Math.min(D.maxStacks, this.deadly.stacks + 1);
        this.deadly.end = this.time + D.duration;
      }
    }
  }

  private tickDeadlyPoison(): void {
    const d = this.deadly;
    if (!d) return;
    const D = POISONS.deadly;
    while (this.time >= d.nextTick && d.nextTick <= d.end) {
      this.deal("deadlyPoison", D.name, Math.round(D.perTick * d.stacks * this.poisonMult()), "hit", "nature", true);
      d.nextTick += D.interval;
    }
    if (this.time >= d.end) this.deadly = null;
  }

  private tickDots(): void {
    for (const [id, dot] of this.dots) {
      while (dot.ticksLeft > 0 && this.time >= dot.nextTick) {
        const hemorrhage = id === "rupture" && this.time < this.hemorrhageEnd ? 1 + SPELL.hemorrhage.ruptureBonus : 1;
        this.deal(id, dot.name, Math.round(dot.perTick * hemorrhage * this.globalMult()), "hit", "bleed", true);
        if (id === "rupture" && this.fx.thousandCuts) {
          const TC = SPELL.thousandCuts;
          const stacks = Math.min(TC.maxStacks, (this.buffs.get("thousandCuts")?.stacks ?? 0) + 1);
          this.setBuff("thousandCuts", TC.duration, stacks);
        }
        dot.ticksLeft--;
        dot.nextTick += dot.interval;
      }
      if (dot.ticksLeft === 0) this.dots.delete(id);
    }
  }

  private emit(e: CombatEvent): void {
    for (const fn of this.listeners) fn(e);
  }
}
