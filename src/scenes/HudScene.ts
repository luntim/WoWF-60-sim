import Phaser from "phaser";
import { ABILITIES, MAX_COMBO_POINTS, type AbilityDef } from "../data/abilities";
import { bindingFromEvent, formatBinding, type Keybinds } from "../input/keybinds";
import type { UiPointer } from "../input/uiPointer";
import type { Combat } from "../sim/Combat";
import { HANDS } from "../sim/stats";
import { FONT, MONO } from "./style";

const SLOT_GAP = 6;
/** More abilities than this wraps the action bar onto two rows. */
const MAX_PER_ROW = 15;
const ENERGY_W = 240;
const SWING_W = 160;

interface Slot {
  ability: AbilityDef;
  x: number;
  y: number;
  size: number;
  /** Everything created for the slot, destroyed when the bar is rebuilt. */
  parts: Phaser.GameObjects.GameObject[];
  costText: Phaser.GameObjects.Text | null;
  sweep: Phaser.GameObjects.Graphics;
  dim: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  keyText: Phaser.GameObjects.Text;
  cdText: Phaser.GameObjects.Text;
  frame: Phaser.GameObjects.Rectangle;
  queueRing: Phaser.GameObjects.Rectangle;
  errorRing: Phaser.GameObjects.Rectangle;
  /** Icon + fallback square; pops when the ability fires. */
  button: Phaser.GameObjects.Container;
}

const iconKey = (a: AbilityDef) => `icon:${a.id}`;

const BLOCKER_TEXT: Record<string, string> = {
  noEnergy: "Not enough energy",
  noComboPoints: "No combo points",
  needsStealth: "Requires Stealth",
  needsDagger: "Requires a main-hand dagger",
  inCombat: "Can't do that while in combat",
  outOfRange: "Out of range",
  notFacing: "You are facing the wrong way!",
  notBehind: "You must be behind your target",
  noTarget: "You have no target",
  onCooldown: "Not ready yet",
  onGcd: "Not ready yet",
};

export class HudScene extends Phaser.Scene {
  private slots: Slot[] = [];
  private energyFill!: Phaser.GameObjects.Rectangle;
  private energyText!: Phaser.GameObjects.Text;
  private comboPips: Phaser.GameObjects.Arc[] = [];
  private swingFills: Phaser.GameObjects.Rectangle[] = [];
  private buffText!: Phaser.GameObjects.Text;
  private targetFrame!: Phaser.GameObjects.Container;
  private targetInfo!: Phaser.GameObjects.Text;
  private meterText!: Phaser.GameObjects.Text;
  private errorText!: Phaser.GameObjects.Text;
  private tooltip!: Phaser.GameObjects.Container;
  private tooltipBg!: Phaser.GameObjects.Rectangle;
  private tooltipText!: Phaser.GameObjects.Text;
  /** Ability ids the bar was built for; a talent change that alters them rebuilds it. */
  private barAbilities = "";
  private barTop = 0;

  constructor(
    private combat: Combat,
    private keybinds: Keybinds,
    private ui: UiPointer,
  ) {
    super({ key: "hud", active: true });
  }

  preload(): void {
    // Icons are copies of Wowhead's (wow.zamimg.com/images/wow/icons/large/<icon>.jpg).
    for (const a of ABILITIES) this.load.image(iconKey(a), `icons/${a.icon}.jpg`);
  }

  create(): void {
    const { width } = this.scale;

    this.add.text(16, 12, "WASD move · Space jump · right-drag look · click/Tab target · Esc untarget, again resets · N talents", {
      fontFamily: FONT,
      fontSize: "13px",
      color: "#8a90a0",
    });

    this.createPlayerFrame(16, 38);
    this.createTargetFrame(290, 38);

    this.meterText = this.add
      .text(width - 16, 12, "", { fontFamily: MONO, fontSize: "13px", color: "#d5d9e2", align: "right" })
      .setOrigin(1, 0);

    this.errorText = this.add
      .text(width / 2, 0, "", { fontFamily: FONT, fontSize: "16px", fontStyle: "bold", color: "#ff5050" })
      .setOrigin(0.5)
      .setShadow(1, 1, "#000000", 2);

    this.createTooltip();
    this.buildActionBar();
    const offCombat = this.combat.on((e) => {
      if (e.type === "reset" && this.abilityKey() !== this.barAbilities) this.buildActionBar();
    });

    // Native listener rather than Phaser's keyboard plugin: Phaser queues key events to the
    // next frame, which let the key pressed to set a binding also fire the ability.
    const onKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
    window.addEventListener("keydown", onKeyDown);
    const off = this.keybinds.onChange(() => this.refreshKeyLabels());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("keydown", onKeyDown);
      off();
      offCombat();
    });
  }

  private abilityKey(): string {
    return this.combat.abilities.map((a) => a.id).join();
  }

  /** Lays out one button per learned ability, centered, wrapping to two rows if needed. */
  private buildActionBar(): void {
    for (const slot of this.slots) for (const part of slot.parts) part.destroy();
    this.slots = [];
    this.tooltip.setVisible(false);
    this.barAbilities = this.abilityKey();

    const abilities = this.combat.abilities;
    const rows = abilities.length > MAX_PER_ROW ? 2 : 1;
    const size = rows === 1 ? 52 : 46;
    const perRow = Math.ceil(abilities.length / rows);
    const bottomY = rows === 1 ? 478 : 508;
    const width = this.scale.width;

    abilities.forEach((ability, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const inRow = Math.min(perRow, abilities.length - row * perRow);
      const rowWidth = inRow * size + (inRow - 1) * SLOT_GAP;
      const x = width / 2 - rowWidth / 2 + size / 2 + col * (size + SLOT_GAP);
      const y = bottomY - (rows - 1 - row) * (size + SLOT_GAP);
      this.slots.push(this.createSlot(ability, x, y, size));
    });

    this.barTop = bottomY - (rows - 1) * (size + SLOT_GAP) - size / 2;
    this.errorText.setY(this.barTop - 16);
  }

  private onKeyDown(e: KeyboardEvent): void {
    // Don't fire abilities while typing in the stats panel or choosing a keybind.
    const el = document.activeElement;
    if (this.keybinds.capturing || el instanceof HTMLInputElement || el instanceof HTMLSelectElement) return;
    if (e.code === "Escape") {
      // Esc clears the target first; with nothing targeted it resets the fight.
      if (this.combat.targeted) this.combat.setTargeted(false);
      else this.combat.reset();
      return;
    }
    const binding = bindingFromEvent(e);
    const id = binding ? this.keybinds.abilityFor(binding) : undefined;
    const slot = id && this.slots.find((s) => s.ability.id === id);
    if (!slot) return;
    // Stop the browser acting on bound combos (e.g. Ctrl+F opening find).
    e.preventDefault();
    this.press(slot);
  }

  private refreshKeyLabels(): void {
    for (const slot of this.slots) slot.keyText.setText(formatBinding(this.keybinds.get(slot.ability.id), true));
  }

  update(): void {
    for (const slot of this.slots) this.updateSlot(slot);
    this.updatePlayerFrame();
    this.updateTargetFrame();
    this.updateMeter();
  }

  // ---- Player frame: energy, combo points, swing timers, buffs ----

  private createPlayerFrame(x: number, y: number): void {
    this.add.rectangle(x, y, ENERGY_W, 18, 0x000000, 0.6).setOrigin(0).setStrokeStyle(1, 0x5a6070);
    this.energyFill = this.add.rectangle(x, y, 0, 18, 0xf2d23c).setOrigin(0);
    this.energyText = this.add
      .text(x + ENERGY_W / 2, y + 9, "", { fontFamily: FONT, fontSize: "12px", fontStyle: "bold", color: "#ffffff", stroke: "#000000", strokeThickness: 3 })
      .setOrigin(0.5);

    for (let i = 0; i < MAX_COMBO_POINTS; i++) {
      this.comboPips.push(this.add.circle(x + 9 + i * 22, y + 34, 8, 0x000000, 0.6).setStrokeStyle(2, 0x6a3a2a));
    }

    HANDS.forEach((hand, i) => {
      const yy = y + 52 + i * 12;
      this.add.text(x, yy - 4, hand.toUpperCase(), { fontFamily: FONT, fontSize: "10px", color: "#8a90a0" });
      this.add.rectangle(x + 24, yy, SWING_W, 5, 0x000000, 0.6).setOrigin(0, 0.5);
      this.swingFills.push(this.add.rectangle(x + 24, yy, 0, 5, 0xbfc7d5).setOrigin(0, 0.5));
    });

    this.buffText = this.add.text(x, y + 82, "", { fontFamily: FONT, fontSize: "13px", color: "#e0c060", lineSpacing: 2 });
  }

  private updatePlayerFrame(): void {
    const c = this.combat;
    this.energyFill.width = ENERGY_W * (c.energy / c.maxEnergy);
    this.energyText.setText(`${Math.floor(c.energy)} / ${c.maxEnergy}`);
    this.comboPips.forEach((pip, i) => pip.setFillStyle(i < c.comboPoints ? 0xff5a2a : 0x000000, i < c.comboPoints ? 1 : 0.6));
    HANDS.forEach((hand, i) => {
      this.swingFills[i].width = SWING_W * c.swingProgress(hand);
      this.swingFills[i].setFillStyle(c.autoAttacking ? 0xbfc7d5 : 0x555b68);
    });
    this.buffText.setText(c.playerBuffs.map((b) => `${b.name}${formatRemaining(b.remaining)}`));
  }

  // ---- Target frame: shown while the dummy is targeted (its debuffs are on the nameplate) ----

  private createTargetFrame(x: number, y: number): void {
    const name = this.add.text(x, y - 2, "Training Dummy", { fontFamily: FONT, fontSize: "15px", fontStyle: "bold", color: "#e8d6b0" });
    this.targetInfo = this.add.text(x, y + 18, "", { fontFamily: FONT, fontSize: "12px", color: "#8a90a0" });
    this.targetFrame = this.add.container(0, 0, [name, this.targetInfo]);
  }

  private updateTargetFrame(): void {
    this.targetFrame.setVisible(this.combat.targeted);
    if (!this.combat.targeted) return;
    const t = this.combat.config.target;
    this.targetInfo.setText(
      `Level ${t.level}${t.humanoid ? " Humanoid" : ""} · ${t.armor} armor`,
    );
  }

  // ---- Action bar ----

  private createSlot(ability: AbilityDef, x: number, y: number, size: number): Slot {
    const parts: Phaser.GameObjects.GameObject[] = [];
    const add = <T extends Phaser.GameObjects.GameObject>(obj: T): T => {
      parts.push(obj);
      return obj;
    };

    // Colored square doubles as the click target and as a fallback if the icon didn't load.
    const hitArea = this.add.rectangle(0, 0, size, size, ability.color, 0.9).setInteractive({ useHandCursor: true });
    const button = add(this.add.container(x, y, [hitArea]));
    const hasIcon = this.textures.exists(iconKey(ability));
    if (hasIcon) button.add(this.add.image(0, 0, iconKey(ability)).setDisplaySize(size, size));

    const label = add(
      this.add
        .text(x, y + 2, ability.label, {
          fontFamily: FONT,
          fontSize: "15px",
          fontStyle: "bold",
          color: "#ffffff",
          stroke: "#000000",
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setVisible(!hasIcon),
    );

    const dim = add(this.add.rectangle(x, y, size, size, 0x10121a, 0.6).setVisible(false));

    // Mask the circular sweep to the square button.
    const maskShape = add(this.make.graphics({}, false));
    maskShape.fillRect(x - size / 2, y - size / 2, size, size);
    const sweep = add(this.add.graphics().setMask(maskShape.createGeometryMask()));

    const frame = add(this.add.rectangle(x, y, size, size).setStrokeStyle(2, 0x000000));

    const keyText = add(
      this.add.text(x - size / 2 + 3, y - size / 2 + 1, formatBinding(this.keybinds.get(ability.id), true), {
        fontFamily: FONT,
        fontSize: "11px",
        fontStyle: "bold",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
      }),
    );
    const costText =
      ability.cost > 0
        ? add(
            this.add
              .text(x + size / 2 - 3, y + size / 2 - 1, "", {
                fontFamily: FONT,
                fontSize: "10px",
                color: "#f2d23c",
                stroke: "#000000",
                strokeThickness: 3,
              })
              .setOrigin(1, 1),
          )
        : null;

    const cdText = add(
      this.add
        .text(x, y, "", { fontFamily: FONT, fontSize: "18px", fontStyle: "bold", color: "#ffffff", stroke: "#000000", strokeThickness: 4 })
        .setOrigin(0.5),
    );

    const queueRing = add(this.add.rectangle(x, y, size + 5, size + 5).setStrokeStyle(3, 0xffd23f));
    const errorRing = add(this.add.rectangle(x, y, size + 5, size + 5).setStrokeStyle(3, 0xff4040).setAlpha(0));

    const slot: Slot = { ability, x, y, size, parts, costText, sweep, dim, label, keyText, cdText, frame, queueRing, errorRing, button };
    hitArea.on("pointerdown", () => {
      this.ui.claim();
      this.press(slot);
    });
    hitArea.on("pointerover", () => this.showTooltip(slot));
    hitArea.on("pointerout", () => this.tooltip.setVisible(false));
    return slot;
  }

  private press(slot: Slot): void {
    const result = this.combat.use(slot.ability.id);
    if (result === "ok") {
      this.tweens.killTweensOf(slot.button);
      slot.button.setScale(1);
      this.tweens.add({ targets: slot.button, scale: 0.9, duration: 50, yoyo: true });
    } else if (result !== "queued") {
      this.tweens.killTweensOf(slot.errorRing);
      slot.errorRing.setAlpha(1);
      this.tweens.add({ targets: slot.errorRing, alpha: 0, duration: 350 });
      this.showError(BLOCKER_TEXT[result] ?? "");
    }
  }

  private showError(message: string): void {
    this.tweens.killTweensOf(this.errorText);
    this.errorText.setText(message).setAlpha(1);
    this.tweens.add({ targets: this.errorText, alpha: 0, delay: 700, duration: 400 });
  }

  private updateSlot(slot: Slot): void {
    const { remaining, total } = this.combat.readiness(slot.ability);
    slot.sweep.clear();
    if (remaining > 0 && total > 0) {
      // Dark wedge for the not-yet-ready fraction, unwinding clockwise from 12 o'clock.
      const top = -Math.PI / 2;
      slot.sweep.fillStyle(0x000000, 0.65);
      slot.sweep.slice(slot.x, slot.y, slot.size, top + (1 - remaining / total) * Math.PI * 2, top + Math.PI * 2);
      slot.sweep.fillPath();
    }

    // WoW-style: red when out of range or facing away, dark when otherwise unusable.
    const reason = this.combat.unusableReason(slot.ability);
    const positional = reason === "outOfRange" || reason === "notFacing" || reason === "notBehind";
    slot.dim.setVisible(reason !== null).setFillStyle(positional ? 0x9a1010 : 0x10121a, positional ? 0.5 : 0.6);
    slot.costText?.setText(`${this.combat.cost(slot.ability)}`);

    const cd = this.combat.cooldownRemaining(slot.ability.id);
    slot.cdText.setText(cd <= 0 ? "" : formatCooldown(cd));
    slot.label.setVisible(cd <= 0 && !this.textures.exists(iconKey(slot.ability)));
    slot.queueRing.setVisible(this.combat.queuedAbility === slot.ability);

    const active =
      (slot.ability.id === "stealth" && this.combat.stealthed) ||
      this.combat.playerBuffs.some((b) => b.id === slot.ability.id);
    slot.frame.setStrokeStyle(2, active ? 0xffffff : 0x000000);
  }

  // ---- Tooltip ----

  private createTooltip(): void {
    this.tooltipBg = this.add.rectangle(0, 0, 10, 10, 0x0d0f16, 0.95).setOrigin(0.5, 1).setStrokeStyle(1, 0x5a6070);
    this.tooltipText = this.add
      .text(0, 0, "", { fontFamily: FONT, fontSize: "12px", color: "#d5d9e2", wordWrap: { width: 260 }, lineSpacing: 2 })
      .setOrigin(0.5, 1);
    this.tooltip = this.add.container(0, 0, [this.tooltipBg, this.tooltipText]).setVisible(false).setDepth(10);
  }

  private showTooltip(slot: Slot): void {
    const a = slot.ability;
    const binding = formatBinding(this.keybinds.get(a.id));
    const meta = [binding ? `Key: ${binding}` : "Unbound", a.cost > 0 ? `${this.combat.cost(a)} Energy` : "", a.cooldown > 0 ? `${formatCooldown(a.cooldown)} cooldown` : "", a.triggersGcd ? "" : "Off GCD"]
      .filter(Boolean)
      .join(" · ");
    this.tooltipText.setText([a.name, meta, "", a.description].filter((l, i) => i !== 1 || l));
    this.tooltipBg.setSize(this.tooltipText.width + 16, this.tooltipText.height + 12);
    const half = this.tooltipBg.width / 2;
    const x = Phaser.Math.Clamp(slot.x, half + 4, this.scale.width - half - 4);
    this.tooltipText.setPosition(0, -6);
    this.tooltip.setPosition(x, this.barTop - 8).setVisible(true);
  }

  // ---- Damage meter ----

  private updateMeter(): void {
    const { meter, time } = this.combat;
    const elapsed = meter.elapsed(time);
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60).toString().padStart(2, "0");

    const lines = [
      `DPS   ${Math.round(meter.dps(time)).toLocaleString()}`,
      `Total ${meter.total.toLocaleString()}`,
      `Time  ${mins}:${secs}`,
      "",
    ];
    const rows = [...meter.rows.values()].sort((a, b) => b.damage - a.damage);
    for (const row of rows) {
      const pct = meter.total > 0 ? Math.round((row.damage / meter.total) * 100) : 0;
      lines.push(`${row.name.padEnd(15)} ${row.damage.toLocaleString().padStart(7)} ${String(pct).padStart(3)}%`);
    }
    this.meterText.setText(lines);
  }
}

export function formatCooldown(s: number): string {
  if (s >= 60) return `${Math.ceil(s / 60)}m`;
  return s >= 1 ? `${Math.ceil(s)}` : s.toFixed(1);
}

function formatRemaining(s: number): string {
  return Number.isFinite(s) ? `  ${Math.max(0, s).toFixed(1)}s` : "";
}
