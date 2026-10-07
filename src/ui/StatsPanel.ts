import { DEFAULT_CONFIG, type SimConfig } from "../sim/stats";

/** The part of the sim config this panel edits; talents live in the talent picker. */
export type StatsConfig = Pick<SimConfig, "character" | "target">;

const DEFAULT_STATS: StatsConfig = { character: DEFAULT_CONFIG.character, target: DEFAULT_CONFIG.target };

const STORAGE_KEY = "rogue-sim-config-v1";

type FieldKind = "number" | "select" | "checkbox";

interface Field {
  /** Dot path into SimConfig, e.g. "character.mh.min". */
  path: string;
  label: string;
  kind: FieldKind;
  options?: [string, string][];
  step?: number;
}

const WEAPON_TYPES: [string, string][] = [
  ["dagger", "Dagger"],
  ["sword", "Sword"],
  ["axe", "Axe"],
  ["mace", "Mace"],
  ["fist", "Fist"],
];
const POISON_OPTIONS: [string, string][] = [
  ["instant", "Instant Poison VI"],
  ["deadly", "Deadly Poison V"],
  ["none", "None"],
];

function weaponFields(hand: "mh" | "oh"): Field[] {
  return [
    { path: `character.${hand}.type`, label: "Type", kind: "select", options: WEAPON_TYPES },
    { path: `character.${hand}.min`, label: "Min damage", kind: "number" },
    { path: `character.${hand}.max`, label: "Max damage", kind: "number" },
    { path: `character.${hand}.speed`, label: "Speed (s)", kind: "number", step: 0.1 },
    { path: `character.${hand}.poison`, label: "Poison", kind: "select", options: POISON_OPTIONS },
  ];
}

const SECTIONS: { title: string; fields: Field[] }[] = [
  { title: "Main hand", fields: weaponFields("mh") },
  { title: "Off hand", fields: weaponFields("oh") },
  {
    title: "Character",
    fields: [
      { path: "character.attackPower", label: "Attack power", kind: "number" },
      { path: "character.critChance", label: "Crit % (gear + agi)", kind: "number", step: 0.1 },
      { path: "character.hitChance", label: "Hit % (gear)", kind: "number", step: 0.1 },
    ],
  },
  {
    title: "Target",
    fields: [
      {
        path: "target.level",
        label: "Level",
        kind: "select",
        options: [
          ["63", "63 (raid boss)"],
          ["60", "60"],
        ],
      },
      { path: "target.armor", label: "Armor", kind: "number" },
      { path: "target.humanoid", label: "Humanoid (Murder)", kind: "checkbox" },
      { path: "target.executePhase", label: "Below 35% health (Quietus)", kind: "checkbox" },
    ],
  },
];

function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj);
}

function set(obj: unknown, path: string, value: unknown): void {
  const keys = path.split(".");
  const last = keys.pop()!;
  const parent = keys.reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj) as Record<string, unknown>;
  parent[last] = value;
}

export function loadStats(): StatsConfig {
  const config = structuredClone(DEFAULT_STATS);
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (saved) {
      // Copy only known fields so an old or hand-edited save can't break the sim.
      for (const f of SECTIONS.flatMap((s) => s.fields)) {
        const v = get(saved, f.path);
        if (typeof v === typeof get(config, f.path)) set(config, f.path, v);
      }
    }
  } catch {
    // Storage unavailable or corrupt: use defaults.
  }
  return config;
}

function saveConfig(config: StatsConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Not persisting is fine.
  }
}

/** Renders the editable stat panel into `root`; calls onChange with a fresh config on every edit. */
export function mountStatsPanel(root: HTMLElement, initial: StatsConfig, onChange: (config: StatsConfig) => void): void {
  let config = structuredClone(initial);

  const render = () => {
    root.replaceChildren();

    const heading = document.createElement("h2");
    heading.textContent = "Rogue · Level 60";
    root.append(heading);

    for (const section of SECTIONS) {
      const fieldset = document.createElement("fieldset");
      const legend = document.createElement("legend");
      legend.textContent = section.title;
      fieldset.append(legend);
      for (const field of section.fields) fieldset.append(renderField(field));
      root.append(fieldset);
    }

    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Restore defaults";
    reset.addEventListener("click", () => {
      config = structuredClone(DEFAULT_STATS);
      commit();
      render();
    });
    root.append(reset);

    const note = document.createElement("p");
    note.className = "note";
    note.textContent = "Changing a stat resets the fight. Crit and hit are from gear and agility; talents (Malice, Precision, Hack and Slash) add on top.";
    root.append(note);
  };

  const renderField = (field: Field): HTMLElement => {
    const label = document.createElement("label");
    label.className = field.kind === "checkbox" ? "check" : "";
    const span = document.createElement("span");
    span.textContent = field.label;
    const value = get(config, field.path);

    let input: HTMLInputElement | HTMLSelectElement;
    if (field.kind === "select") {
      const select = document.createElement("select");
      for (const [v, text] of field.options!) select.add(new Option(text, v, false, String(value) === v));
      input = select;
    } else {
      const el = document.createElement("input");
      el.type = field.kind;
      if (field.kind === "checkbox") el.checked = Boolean(value);
      else {
        el.value = String(value);
        el.step = String(field.step ?? 1);
        el.min = "0";
      }
      input = el;
    }

    input.addEventListener("change", () => {
      const current = get(config, field.path);
      let next: unknown;
      if (input instanceof HTMLInputElement && input.type === "checkbox") next = input.checked;
      else if (typeof current === "number") next = Number(input.value);
      else next = input.value;
      if (typeof next === "number" && !Number.isFinite(next)) return;
      set(config, field.path, next);
      commit();
    });
    // Enter commits and hands the keyboard back to the game.
    input.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") (input as HTMLElement).blur();
    });

    if (field.kind === "checkbox") label.append(input, span);
    else label.append(span, input);
    return label;
  };

  const commit = () => {
    saveConfig(config);
    onChange(structuredClone(config));
  };

  render();
}
