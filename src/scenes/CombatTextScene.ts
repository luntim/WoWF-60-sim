import Phaser from "phaser";
import { ABILITIES } from "../data/abilities";
import type { Combat, CombatEvent } from "../sim/Combat";
import type { World3D } from "../world/World3D";
import { worldToGame } from "./projection";
import { FONT, toCss } from "./style";

const SOURCE_COLORS: Record<string, number> = {
  melee: 0xffffff,
  instantPoison: 0x7bd84a,
  deadlyPoison: 0x4f9e35,
  rupture: 0xd9403a,
  garrote: 0xd9403a,
  ...Object.fromEntries(ABILITIES.map((a) => [a.id, a.color])),
};

/** Floating damage numbers over the 3D dummy, drawn on the HUD layer. */
export class CombatTextScene extends Phaser.Scene {
  constructor(
    private combat: Combat,
    private world: World3D,
  ) {
    super({ key: "combatText", active: true });
  }

  create(): void {
    const off = this.combat.on((e) => {
      if (e.type === "damage") this.floatText(e);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  }

  private floatText(e: Extract<CombatEvent, { type: "damage" }>): void {
    // Numbers start at the dummy's chest and float up past the nameplate.
    const at = worldToGame(this, this.world, this.world.dummyPoint(1.6));
    if (!at) return;

    const auto = e.sourceId === "melee";
    const crit = e.outcome === "crit";
    let label: string;
    if (e.amount === 0) label = e.outcome === "resist" ? "Resist" : e.outcome === "dodge" ? "Dodge" : "Miss";
    else label = crit ? `${e.amount}!` : `${e.amount}`;

    const size = crit ? (auto ? 24 : 32) : e.periodic || auto ? 16 : 22;
    const color =
      e.amount === 0 ? "#9aa0ad"
      : e.outcome === "glance" ? "#b8bcc6"
      : crit && !e.periodic ? "#ffd23f"
      : toCss(SOURCE_COLORS[e.sourceId] ?? 0xffffff);

    // Spread sources so simultaneous numbers don't stack on each other.
    const x = at.x + (e.school === "nature" ? 60 : e.school === "bleed" ? -60 : 0) + Phaser.Math.Between(-25, 25);
    const text = this.add
      .text(x, at.y + Phaser.Math.Between(-10, 10), label, {
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
