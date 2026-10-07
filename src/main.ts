import Phaser from "phaser";
import { Keybinds } from "./input/keybinds";
import { loadMouseSettings, mountMouseSettings } from "./input/mouseSettings";
import { UiPointer } from "./input/uiPointer";
import { CombatTextScene } from "./scenes/CombatTextScene";
import { HudScene } from "./scenes/HudScene";
import { NameplateScene } from "./scenes/NameplateScene";
import { Combat } from "./sim/Combat";
import { mountKeybindPanel } from "./ui/KeybindPanel";
import { loadStats, mountStatsPanel } from "./ui/StatsPanel";
import { loadTalents, mountTalentPicker } from "./ui/TalentPicker";
import { World3D } from "./world/World3D";
import "./style.css";

const stats = loadStats();
const talents = loadTalents();
const combat = new Combat({ ...stats, talents });
combat.setTargeted(false); // like logging in: nothing selected until you click or Tab
const keybinds = new Keybinds();

mountTalentPicker(document.getElementById("talents")!, talents, keybinds, (next) =>
  combat.configure({ ...combat.config, talents: next }),
);
mountStatsPanel(document.getElementById("stats")!, stats, (next) => combat.configure({ ...combat.config, ...next }));
mountKeybindPanel(document.getElementById("keybinds")!, keybinds, combat);
const mouse = loadMouseSettings();
mountMouseSettings(document.getElementById("mouse")!, mouse);

// The 3D world renders the arena and advances the sim; Phaser draws the HUD on top.
const container = document.getElementById("game")!;
const ui = new UiPointer();
const world = new World3D(container, combat, keybinds, mouse, ui);

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 960,
  height: 540,
  transparent: true,
  // Keys are read by a native listener in HudScene.
  input: { keyboard: false },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // Later scenes draw on top: nameplate, then damage numbers, then the HUD.
  scene: [new NameplateScene(combat, world, ui), new CombatTextScene(combat, world), new HudScene(combat, keybinds, ui)],
});
