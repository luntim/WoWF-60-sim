import { describe, expect, it } from "vitest";
import { Keybinds, bindingFromEvent, formatBinding } from "./keybinds";

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

const press = (code: string, mods: { ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean } = {}) => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("bindingFromEvent", () => {
  it("combines modifiers with the physical key", () => {
    expect(bindingFromEvent(press("Digit1"))).toBe("Digit1");
    expect(bindingFromEvent(press("Digit1", { shiftKey: true }))).toBe("Shift+Digit1");
    expect(bindingFromEvent(press("KeyQ", { ctrlKey: true, altKey: true }))).toBe("Ctrl+Alt+KeyQ");
  });

  it("ignores lone modifier presses", () => {
    expect(bindingFromEvent(press("ShiftLeft", { shiftKey: true }))).toBeNull();
  });
});

describe("formatBinding", () => {
  it("formats long and short forms", () => {
    expect(formatBinding("Shift+Digit1")).toBe("Shift+1");
    expect(formatBinding("Shift+Digit1", true)).toBe("S1");
    expect(formatBinding("Ctrl+KeyQ", true)).toBe("CQ");
    expect(formatBinding("Backquote")).toBe("`");
    expect(formatBinding(null)).toBe("");
  });
});

describe("Keybinds", () => {
  it("starts with defaults and looks abilities up by binding", () => {
    const k = new Keybinds(memoryStorage());
    expect(k.get("mutilate")).toBe("Digit1");
    expect(k.abilityFor("KeyQ")).toBe("backstab");
  });

  it("steals a binding from the ability that had it", () => {
    const k = new Keybinds(memoryStorage());
    k.set("eviscerate", "Digit1");
    expect(k.get("eviscerate")).toBe("Digit1");
    expect(k.get("mutilate")).toBeNull();
  });

  it("refuses reserved keys", () => {
    const k = new Keybinds(memoryStorage());
    k.set("mutilate", "Escape");
    expect(k.get("mutilate")).toBe("Digit1");
  });

  it("persists across instances and resets to defaults", () => {
    const storage = memoryStorage();
    new Keybinds(storage).set("vanish", "Shift+KeyV");
    const k = new Keybinds(storage);
    expect(k.get("vanish")).toBe("Shift+KeyV");
    k.resetToDefaults();
    expect(new Keybinds(storage).get("vanish")).toBe("KeyV");
  });

  it("gives newly added abilities their default key unless a saved binding already uses it", () => {
    const storage = memoryStorage();
    // A save from before Thistle Tea existed, with Shift+C already bound to Vanish.
    storage.setItem("rogue-sim-keybinds-v1", JSON.stringify({ vanish: "Shift+KeyC", mutilate: "Digit1" }));
    const k = new Keybinds(storage);
    expect(k.get("thistleTea")).toBeNull();
    expect(k.get("vanish")).toBe("Shift+KeyC");

    const fresh = new Keybinds(memoryStorage());
    expect(fresh.get("thistleTea")).toBe("Shift+KeyC");
  });
});
