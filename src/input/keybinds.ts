import { ABILITIES, type AbilityId } from "../data/abilities";

const STORAGE_KEY = "rogue-sim-keybinds-v1";

/**
 * Modifiers plus a physical KeyboardEvent.code, e.g. "Digit1", "Shift+KeyQ", "Ctrl+Alt+F1".
 * Codes (not .key) so Shift+1 stays "1" instead of "!" and bindings survive keyboard layouts.
 */
export type Binding = string;

/** Keys the game uses itself and can't be bound. */
export const RESERVED: Binding[] = ["Escape"];

const MODIFIER_CODES = new Set([
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
]);

const CODE_NAMES: Record<string, string> = {
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Space: "Space",
  CapsLock: "Caps",
  Backspace: "Bksp",
  Delete: "Del",
  Insert: "Ins",
  PageUp: "PgUp",
  PageDown: "PgDn",
};

/** The binding for a key press, or null for a lone modifier key. */
export function bindingFromEvent(e: Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey">): Binding | null {
  if (!e.code || MODIFIER_CODES.has(e.code)) return null;
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift"].filter(Boolean);
  return [...mods, e.code].join("+");
}

/**
 * Human-readable binding. `short` gives the compact action-button form WoW uses,
 * e.g. "Shift+Digit1" -> "S1", "Ctrl+KeyQ" -> "CQ".
 */
export function formatBinding(binding: Binding | null, short = false): string {
  if (!binding) return "";
  const parts = binding.split("+");
  const code = parts.pop()!;
  const key =
    code.startsWith("Key") ? code.slice(3)
    : code.startsWith("Digit") ? code.slice(5)
    : code.startsWith("Numpad") ? `N${code.slice(6)}`
    : (CODE_NAMES[code] ?? code);
  return short ? parts.map((m) => m[0]).join("") + key : [...parts, key].join("+");
}

function defaults(): Map<AbilityId, Binding | null> {
  return new Map(ABILITIES.map((a) => [a.id, a.defaultBinding]));
}

/** Ability keybinds, persisted to localStorage. */
export class Keybinds {
  /** True while the panel is waiting for a key to bind; the game ignores key presses meanwhile. */
  capturing = false;
  private map: Map<AbilityId, Binding | null>;
  private listeners = new Set<() => void>();

  constructor(private storage: Pick<Storage, "getItem" | "setItem"> | null = safeLocalStorage()) {
    this.map = this.load();
  }

  get(id: AbilityId): Binding | null {
    return this.map.get(id) ?? null;
  }

  abilityFor(binding: Binding): AbilityId | undefined {
    for (const [id, b] of this.map) if (b === binding) return id;
    return undefined;
  }

  /** Binds `id` to `binding`, unbinding whatever ability had it. Pass null to unbind. */
  set(id: AbilityId, binding: Binding | null): void {
    if (binding && RESERVED.includes(binding)) return;
    if (binding) {
      const previous = this.abilityFor(binding);
      if (previous && previous !== id) this.map.set(previous, null);
    }
    this.map.set(id, binding);
    this.changed();
  }

  resetToDefaults(): void {
    this.map = defaults();
    this.changed();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(this.map)));
    } catch {
      // Not persisting is fine.
    }
    for (const fn of this.listeners) fn();
  }

  private load(): Map<AbilityId, Binding | null> {
    const map = defaults();
    try {
      const saved = JSON.parse(this.storage?.getItem(STORAGE_KEY) ?? "null") as Record<string, unknown> | null;
      if (saved) {
        const missing: AbilityId[] = [];
        for (const id of map.keys()) {
          const b = saved[id];
          if (b === null || (typeof b === "string" && !RESERVED.includes(b))) map.set(id, b);
          else missing.push(id);
        }
        // Abilities added since the save keep their default key unless the player already uses it.
        for (const id of missing) {
          const taken = [...map].some(([other, b]) => other !== id && !missing.includes(other) && b === map.get(id));
          if (taken) map.set(id, null);
        }
      }
    } catch {
      // Corrupt save: use defaults.
    }
    return map;
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
