import Phaser from "phaser";
import { ABILITIES } from "../data/abilities";
import type { Combat, CombatEvent } from "../sim/Combat";
import { FONT, toCss } from "./style";

export const FLOOR_Y = 400;
const PLAYER_X = 420;
export const DUMMY_X = 600;
const DUMMY_BODY_COLOR = 0xc8a165;

const SOURCE_COLORS: Record<string, number> = {
  melee: 0xffffff,
  instantPoison: 0x7bd84a,
  deadlyPoison: 0x4f9e35,
  rupture: 0xd9403a,
  garrote: 0xd9403a,
  ...Object.fromEntries(ABILITIES.map((a) => [a.id, a.color])),
};

export class ArenaScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private dummy!: Phaser.GameObjects.Container;
  private dummyBody!: Phaser.GameObjects.Ellipse;

  constructor(private combat: Combat) {
    super("arena");
  }

  create(): void {
    const { width } = this.scale;
    this.add.rectangle(width / 2, FLOOR_Y + 70, width, 140, 0x1f222a);
    this.add.rectangle(width / 2, FLOOR_Y, width, 3, 0x343946);

    // The rogue stands behind the dummy (Backstab/Ambush/Garrote positioning).
    this.player = this.add.container(PLAYER_X, FLOOR_Y, [
      this.add.rectangle(0, -45, 36, 70, 0x2d2a3a).setStrokeStyle(2, 0x111018),
      this.add.circle(0, -95, 17, 0xf1c9a5).setStrokeStyle(2, 0x6b4a2f),
      this.add.rectangle(0, -103, 38, 10, 0x2d2a3a), // hood
      this.add.rectangle(26, -55, 30, 5, 0xbfc7d5).setAngle(-25), // main-hand dagger
      this.add.rectangle(-22, -45, 26, 5, 0xbfc7d5).setAngle(20), // off-hand dagger
    ]);

    // Container origin is the dummy's base so it wobbles like it's planted in the ground.
    this.dummyBody = this.add.ellipse(0, -80, 70, 90, DUMMY_BODY_COLOR).setStrokeStyle(3, 0x6b5232);
    this.dummy = this.add.container(DUMMY_X, FLOOR_Y, [
      this.add.rectangle(0, -40, 10, 80, 0x6b4a2f),
      this.add.rectangle(0, -95, 120, 10, 0x6b4a2f),
      this.dummyBody,
      this.add.circle(0, -145, 24, DUMMY_BODY_COLOR).setStrokeStyle(3, 0x6b5232),
      this.add.circle(0, -80, 14).setStrokeStyle(3, 0xb3412f),
    ]);

    const off = this.combat.on((e) => this.onCombatEvent(e));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  }

  update(_time: number, delta: number): void {
    // Clamp so a backgrounded tab doesn't resolve a huge chunk of time at once.
    this.combat.update(Math.min(delta, 100) / 1000);
  }

  private onCombatEvent(e: CombatEvent): void {
    switch (e.type) {
      case "use":
        if (e.ability.offensive) this.lunge();
        break;
      case "damage":
        if (e.amount > 0 && !e.periodic) this.hitDummy(e.outcome === "crit");
        this.floatText(e);
        break;
      case "stealth":
        // Set directly: lunge() kills the player's tweens, which would strand a fade halfway.
        this.player.setAlpha(e.active ? 0.35 : 1);
        break;
      case "reset":
        if (this.player) this.player.setAlpha(1);
        break;
    }
  }

  private lunge(): void {
    this.tweens.killTweensOf(this.player);
    this.player.x = PLAYER_X;
    this.tweens.add({ targets: this.player, x: PLAYER_X + 30, duration: 70, yoyo: true, ease: "Quad.easeOut" });
  }

  private hitDummy(crit: boolean): void {
    this.tweens.killTweensOf(this.dummy);
    this.dummy.setAngle(0);
    this.tweens.add({ targets: this.dummy, angle: crit ? -10 : -4, duration: 60, yoyo: true, ease: "Sine.easeOut" });
    this.dummyBody.setFillStyle(0xffffff);
    this.time.delayedCall(50, () => this.dummyBody.setFillStyle(DUMMY_BODY_COLOR));
  }

  private floatText(e: Extract<CombatEvent, { type: "damage" }>): void {
    const auto = e.sourceId === "melee";
    const crit = e.outcome === "crit";
    let label: string;
    if (e.amount === 0) label = e.outcome === "resist" ? "Resist" : e.outcome === "dodge" ? "Dodge" : "Miss";
    else label = crit ? `${e.amount}!` : `${e.amount}`;

    const size = crit ? (auto ? 24 : 32) : e.periodic || auto ? 16 : 22;
    const color = e.amount === 0 ? "#9aa0ad" : e.outcome === "glance" ? "#b8bcc6" : crit && !e.periodic ? "#ffd23f" : toCss(SOURCE_COLORS[e.sourceId] ?? 0xffffff);

    // Spread sources so simultaneous numbers don't stack on each other.
    const x = DUMMY_X + (e.school === "nature" ? 60 : e.school === "bleed" ? -60 : 0) + Phaser.Math.Between(-25, 25);
    const text = this.add
      .text(x, FLOOR_Y - 150 + Phaser.Math.Between(-10, 10), label, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        fontStyle: "bold",
        color,
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setScale(crit ? 1.5 : 1);

    if (crit) this.tweens.add({ targets: text, scale: 1, duration: 150, ease: "Back.easeOut" });
    this.tweens.add({
      targets: text,
      y: text.y - 80,
      alpha: 0,
      duration: 1100,
      ease: "Cubic.easeIn",
      onComplete: () => text.destroy(),
    });
  }
}
