import Phaser from "phaser";
import { Keybinds } from "./input/keybinds";
import { ArenaScene } from "./scenes/ArenaScene";
import { HudScene } from "./scenes/HudScene";
import { Combat } from "./sim/Combat";
import { mountKeybindPanel } from "./ui/KeybindPanel";
import { loadStats, mountStatsPanel } from "./ui/StatsPanel";
import { loadTalents, mountTalentPicker } from "./ui/TalentPicker";
import "./style.css";

const stats = loadStats();
const talents = loadTalents();
const combat = new Combat({ ...stats, talents });
const keybinds = new Keybinds();

mountTalentPicker(document.getElementById("talents")!, talents, keybinds, (next) =>
  combat.configure({ ...combat.config, talents: next }),
);
mountStatsPanel(document.getElementById("stats")!, stats, (next) => combat.configure({ ...combat.config, ...next }));
mountKeybindPanel(document.getElementById("keybinds")!, keybinds, combat);

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 960,
  height: 540,
  backgroundColor: "#16181e",
  // Keys are read by a native listener in HudScene.
  input: { keyboard: false },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // ArenaScene comes first so it advances the sim before the HUD reads it each frame.
  scene: [new ArenaScene(combat), new HudScene(combat, keybinds)],
});
