import Phaser from "phaser";
import { DEBUFF_ICONS, type Combat } from "../sim/Combat";
import type { UiPointer } from "../input/uiPointer";
import type { World3D } from "../world/World3D";
import { worldToGame } from "./projection";
import { FONT } from "./style";

const BAR_W = 110;
const BAR_H = 9;
const ICON = 22;
const ICON_GAP = 3;
const MAX_ICONS = 8;
const TARGET_SCALE = 1.3;
/** Height above the dummy's feet where the nameplate sits. */
const PLATE_HEIGHT = 2.75;

interface DebuffSlot {
  root: Phaser.GameObjects.Container;
  icon: Phaser.GameObjects.Image;
  timer: Phaser.GameObjects.Text;
  stacks: Phaser.GameObjects.Text;
}

const textureKey = (icon: string) => `debuff:${icon}`;

/** WoW-style nameplate over the dummy: name, health, level, and your debuffs with timers. */
export class NameplateScene extends Phaser.Scene {
  private plate!: Phaser.GameObjects.Container;
  private outline!: Phaser.GameObjects.Rectangle;
  private health!: Phaser.GameObjects.Rectangle;
  private level!: Phaser.GameObjects.Text;
  private slots: DebuffSlot[] = [];

  constructor(
    private combat: Combat,
    private world: World3D,
    private ui: UiPointer,
  ) {
    super({ key: "nameplate", active: true });
  }

  preload(): void {
    for (const icon of Object.values(DEBUFF_ICONS)) this.load.image(textureKey(icon), `icons/${icon}.jpg`);
  }

  create(): void {
    const text = (x: number, y: number, size: number, color: string) =>
      this.add
        .text(x, y, "", { fontFamily: FONT, fontSize: `${size}px`, fontStyle: "bold", color, stroke: "#000000", strokeThickness: 3 })
        .setResolution(2);

    // Thin yellow outline shown while targeted.
    this.outline = this.add.rectangle(0, 0, BAR_W + 4, BAR_H + 4).setStrokeStyle(1.5, 0xffd200);
    const bar = this.add.rectangle(0, 0, BAR_W, BAR_H, 0x000000, 0.75).setStrokeStyle(1, 0x000000);
    this.health = this.add.rectangle(-BAR_W / 2 + 1, 0, BAR_W - 2, BAR_H - 2, 0xc0281e).setOrigin(0, 0.5);
    const name = text(0, -BAR_H / 2 - 1, 11, "#ffffff").setOrigin(0.5, 1).setText("Training Dummy");
    this.level = text(BAR_W / 2 + 5, 0, 10, "#ff4040").setOrigin(0, 0.5);

    // Debuff row above the name.
    const row = this.add.container(0, -BAR_H / 2 - 17 - ICON / 2);
    for (let i = 0; i < MAX_ICONS; i++) {
      const icon = this.add.image(0, 0, textureKey(DEBUFF_ICONS.deadly)).setDisplaySize(ICON, ICON);
      const border = this.add.rectangle(0, 0, ICON, ICON).setStrokeStyle(1, 0x000000);
      const timer = text(0, 0, 10, "#ffffff").setOrigin(0.5);
      const stacks = text(ICON / 2, ICON / 2, 9, "#ffd200").setOrigin(1, 1);
      const root = this.add.container(0, 0, [icon, border, timer, stacks]).setVisible(false);
      row.add(root);
      this.slots.push({ root, icon, timer, stacks });
    }

    this.plate = this.add.container(0, 0, [row, this.outline, bar, this.health, name, this.level]);

    // Clicking the nameplate targets the dummy, as in WoW.
    bar.setInteractive({ useHandCursor: true, hitArea: new Phaser.Geom.Rectangle(0, -14, BAR_W, BAR_H + 18), hitAreaCallback: Phaser.Geom.Rectangle.Contains });
    bar.on("pointerdown", () => {
      this.ui.claim();
      this.combat.setTargeted(true);
    });
  }

  update(): void {
    const at = worldToGame(this, this.world, this.world.dummyPoint(PLATE_HEIGHT));
    this.plate.setVisible(at !== null);
    if (!at) return;

    const targeted = this.combat.targeted;
    const target = this.combat.config.target;
    this.plate.setPosition(at.x, at.y).setScale(targeted ? TARGET_SCALE : 1).setAlpha(targeted ? 1 : 0.8);
    this.outline.setVisible(targeted);
    // The dummy never dies; show it below 35% when the execute-phase option is on.
    this.health.width = (BAR_W - 2) * (target.executePhase ? 0.3 : 1);
    this.level.setText(String(target.level));

    const debuffs = this.combat.targetDebuffs.filter((d) => d.icon).slice(0, MAX_ICONS);
    const rowWidth = debuffs.length * ICON + Math.max(0, debuffs.length - 1) * ICON_GAP;
    this.slots.forEach((slot, i) => {
      const d = debuffs[i];
      slot.root.setVisible(d !== undefined);
      if (!d) return;
      slot.root.setX(-rowWidth / 2 + ICON / 2 + i * (ICON + ICON_GAP));
      slot.icon.setTexture(textureKey(d.icon!)).setDisplaySize(ICON, ICON);
      slot.timer.setText(formatTimer(d.remaining));
      slot.stacks.setText(d.stacks && d.stacks > 1 ? String(d.stacks) : "");
    });
  }
}

function formatTimer(s: number): string {
  if (!Number.isFinite(s)) return "";
  if (s >= 60) return `${Math.ceil(s / 60)}m`;
  return s >= 3 ? String(Math.ceil(s)) : Math.max(0, s).toFixed(1);
}
