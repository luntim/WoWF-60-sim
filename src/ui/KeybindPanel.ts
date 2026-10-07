import type { AbilityId } from "../data/abilities";
import { RESERVED, bindingFromEvent, formatBinding, type Keybinds } from "../input/keybinds";
import type { Combat } from "../sim/Combat";

/**
 * Lists every ability with its key. Click a key, then press the new one
 * (modifiers allowed). Esc cancels, Backspace/Delete unbinds.
 */
export function mountKeybindPanel(root: HTMLElement, keybinds: Keybinds, combat: Combat): void {
  let listening: { id: AbilityId; stop: () => void } | null = null;

  const section = document.createElement("details");
  section.open = true;
  const summary = document.createElement("summary");
  summary.textContent = "Keybinds";
  const hint = document.createElement("p");
  hint.className = "note";
  hint.textContent = "Click a key, then press the new one. Modifiers work (Shift+1). Backspace unbinds, Esc cancels.";
  const list = document.createElement("div");
  list.className = "keybinds";
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "Restore default keys";
  reset.addEventListener("click", () => keybinds.resetToDefaults());
  section.append(summary, hint, list, reset);
  root.append(section);

  const render = () => {
    list.replaceChildren(
      // Only abilities the current talent build has.
      ...combat.abilities.map((a) => {
        const row = document.createElement("div");
        row.className = "keybind";

        const icon = document.createElement("img");
        icon.src = `icons/${a.icon}.jpg`;
        icon.alt = "";
        const name = document.createElement("span");
        name.textContent = a.name;

        const key = document.createElement("button");
        key.type = "button";
        const isListening = listening?.id === a.id;
        key.className = isListening ? "listening" : "";
        key.textContent = isListening ? "Press a key…" : formatBinding(keybinds.get(a.id)) || "Unbound";
        key.addEventListener("click", () => (isListening ? stopListening() : startListening(a.id)));

        row.append(icon, name, key);
        return row;
      }),
    );
  };

  const startListening = (id: AbilityId) => {
    stopListening();
    const onKey = (e: KeyboardEvent) => {
      // Capture phase on window runs before the game's listener; stop it seeing this press.
      e.preventDefault();
      e.stopImmediatePropagation();
      const binding = bindingFromEvent(e);
      if (!binding) return; // lone modifier: keep waiting for the real key
      if (binding === "Escape") return stopListening();
      if (binding === "Backspace" || binding === "Delete") keybinds.set(id, null);
      else if (!RESERVED.includes(binding)) keybinds.set(id, binding);
      stopListening();
    };
    // Clicking anywhere else cancels.
    const onPointer = (e: PointerEvent) => {
      if (!(e.target instanceof Element && e.target.closest(".keybind button.listening"))) stopListening();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    keybinds.capturing = true;
    listening = {
      id,
      stop: () => {
        window.removeEventListener("keydown", onKey, true);
        window.removeEventListener("pointerdown", onPointer, true);
      },
    };
    render();
  };

  const stopListening = () => {
    if (!listening) return;
    listening.stop();
    listening = null;
    keybinds.capturing = false;
    render();
  };

  keybinds.onChange(render);
  // Talent changes reconfigure (and reset) the sim, which can add or remove abilities.
  combat.on((e) => {
    if (e.type === "reset" && !listening) render();
  });
  render();
}
