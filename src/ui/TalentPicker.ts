import { ABILITIES } from "../data/abilities";
import {
  MAX_TALENT_POINTS,
  NOT_SIMULATED,
  TALENT_BY_ID,
  TALENT_TREES,
  TREE_COLS,
  TREE_ROWS,
  type TalentDef,
  type TreeName,
} from "../data/talentTrees";
import type { Keybinds } from "../input/keybinds";
import {
  PRESETS,
  addBlocker,
  buildErrors,
  canRemove,
  pointsInTree,
  rankOf,
  totalPoints,
  withRank,
  type TalentRanks,
} from "../sim/talents";

const STORAGE_KEY = "rogue-sim-talents-v1";
const CELL = 44;
const GAP = 14;
const STEP = CELL + GAP;

export function loadTalents(): TalentRanks {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as unknown;
    if (saved && typeof saved === "object") {
      const ranks = saved as TalentRanks;
      const valid =
        Object.entries(ranks).every(([id, r]) => TALENT_BY_ID.has(id) && Number.isInteger(r) && r > 0) &&
        buildErrors(ranks).length === 0;
      if (valid) return ranks;
    }
  } catch {
    // Storage unavailable or corrupt: fall through to the default build.
  }
  return { ...PRESETS[0].ranks };
}

function saveTalents(ranks: TalentRanks): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ranks));
  } catch {
    // Not persisting is fine.
  }
}

export function treeSummary(ranks: TalentRanks): string {
  return TALENT_TREES.map((t) => pointsInTree(ranks, t.name)).join(" / ");
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/**
 * WoW-style talent calculator in a modal. Left-click adds a point, right-click
 * (or Shift-click) removes one. `host` gets a summary + open button for the side panel.
 */
export function mountTalentPicker(
  host: HTMLElement,
  initial: TalentRanks,
  keybinds: Keybinds,
  onChange: (ranks: TalentRanks) => void,
): void {
  let ranks = { ...initial };
  let hovered: string | null = null;

  // ---- Side-panel summary ----
  const summary = el("fieldset");
  summary.append(el("legend", "", "Talents"));
  const summaryText = el("p", "talent-summary");
  const openButton = el("button", "", "Open talent picker (N)");
  openButton.type = "button";
  summary.append(summaryText, openButton);
  host.append(summary);

  // ---- Modal ----
  const modal = el("div", "talent-modal");
  modal.hidden = true;
  const win = el("div", "talent-window");
  win.setAttribute("role", "dialog");
  win.setAttribute("aria-label", "Talents");

  const header = el("header");
  const title = el("h2", "", "Talents");
  const pointsLeft = el("span", "talent-points");
  const presetSelect = el("select");
  presetSelect.add(new Option("Load a preset…", ""));
  PRESETS.forEach((p, i) => presetSelect.add(new Option(p.name, String(i))));
  const resetButton = el("button", "", "Reset");
  resetButton.type = "button";
  const closeButton = el("button", "talent-close", "×");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close");
  header.append(title, pointsLeft, presetSelect, resetButton, closeButton);

  const treesEl = el("div", "talent-trees");
  const cells = new Map<string, { button: HTMLButtonElement; rank: HTMLSpanElement }>();
  const arrows: { el: HTMLDivElement; def: TalentDef }[] = [];
  const treeTotals = new Map<TreeName, HTMLSpanElement>();

  for (const tree of TALENT_TREES) {
    const section = el("section", `talent-tree tree-${tree.name.toLowerCase()}`);
    const h3 = el("h3", "", tree.name);
    const total = el("span");
    h3.append(" ", total);
    treeTotals.set(tree.name, total);

    const grid = el("div", "talent-grid");
    grid.style.width = `${TREE_COLS * STEP - GAP}px`;
    grid.style.height = `${TREE_ROWS * STEP - GAP}px`;

    for (const def of tree.talents) {
      if (def.requires) {
        // Prerequisites in these trees are always straight down the same column.
        const src = TALENT_BY_ID.get(def.requires.id)!;
        const arrow = el("div", "talent-arrow");
        arrow.style.left = `${def.col * STEP + CELL / 2 - 2}px`;
        arrow.style.top = `${src.row * STEP + CELL}px`;
        arrow.style.height = `${(def.row - src.row) * STEP - CELL}px`;
        grid.append(arrow);
        arrows.push({ el: arrow, def });
      }

      const button = el("button", "talent");
      button.type = "button";
      button.style.left = `${def.col * STEP}px`;
      button.style.top = `${def.row * STEP}px`;
      button.setAttribute("aria-label", def.name);
      const img = el("img");
      img.src = `icons/${def.icon}.jpg`;
      img.alt = "";
      const rank = el("span", "talent-rank");
      button.append(img, rank);
      cells.set(def.id, { button, rank });

      button.addEventListener("click", (e) => (e.shiftKey ? remove(def.id) : add(def.id)));
      button.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        remove(def.id);
      });
      button.addEventListener("mouseenter", () => {
        hovered = def.id;
        renderTooltip();
      });
      button.addEventListener("mousemove", (e) => placeTooltip(e.clientX, e.clientY));
      button.addEventListener("mouseleave", () => {
        hovered = null;
        tooltip.hidden = true;
      });
      grid.append(button);
    }

    section.append(h3, grid);
    treesEl.append(section);
  }

  const hint = el(
    "p",
    "talent-hint",
    "Left-click to add a point · Right-click or Shift-click to remove · Changing talents resets the fight",
  );
  win.append(header, treesEl, hint);
  const tooltip = el("div", "talent-tooltip");
  tooltip.hidden = true;
  modal.append(win, tooltip);
  document.body.append(modal);

  // ---- Behavior ----

  const commit = (next: TalentRanks) => {
    ranks = next;
    saveTalents(ranks);
    onChange({ ...ranks });
    refresh();
  };

  const add = (id: string) => {
    if (addBlocker(ranks, id) === null) commit(withRank(ranks, id, rankOf(ranks, id) + 1));
  };

  const remove = (id: string) => {
    if (canRemove(ranks, id)) commit(withRank(ranks, id, rankOf(ranks, id) - 1));
  };

  const refresh = () => {
    const spent = totalPoints(ranks);
    pointsLeft.textContent = `Points left: ${MAX_TALENT_POINTS - spent}`;
    summaryText.textContent = `${treeSummary(ranks)}  ·  ${spent}/${MAX_TALENT_POINTS} points`;
    for (const tree of TALENT_TREES) treeTotals.get(tree.name)!.textContent = `(${pointsInTree(ranks, tree.name)})`;

    for (const [id, cell] of cells) {
      const def = TALENT_BY_ID.get(id)!;
      const r = rankOf(ranks, id);
      const blocked = addBlocker(ranks, id);
      cell.rank.textContent = `${r}/${def.maxRank}`;
      cell.button.classList.toggle("maxed", r === def.maxRank);
      cell.button.classList.toggle("learned", r > 0 && r < def.maxRank);
      cell.button.classList.toggle("available", r === 0 && blocked === null);
      cell.button.classList.toggle("locked", r === 0 && blocked !== null);
    }
    for (const { el: arrow, def } of arrows) {
      arrow.classList.toggle("met", rankOf(ranks, def.requires!.id) >= def.requires!.rank);
    }
    if (hovered) renderTooltip();
  };

  const renderTooltip = () => {
    const def = TALENT_BY_ID.get(hovered!)!;
    const r = rankOf(ranks, def.id);
    const lines: [string, string][] = [
      ["name", def.name],
      ["rank", `Rank ${r}/${def.maxRank}`],
    ];
    if (r > 0) lines.push(["", def.ranks[r - 1]]);
    if (r < def.maxRank) {
      if (r > 0) lines.push(["next", "Next rank:"]);
      lines.push(["", def.ranks[r]]);
    }
    if (pointsInTree(ranks, def.tree, def.row) < def.requiredPoints) {
      lines.push(["req", `Requires ${def.requiredPoints} points in ${def.tree} talents`]);
    }
    if (def.requires && rankOf(ranks, def.requires.id) < def.requires.rank) {
      const req = TALENT_BY_ID.get(def.requires.id)!;
      lines.push(["req", `Requires ${def.requires.rank} point${def.requires.rank > 1 ? "s" : ""} in ${req.name}`]);
    }
    const ability = ABILITIES.find((a) => a.talent === def.id);
    if (ability) lines.push(["note", `Adds ${ability.name} to your action bar.`]);
    if (NOT_SIMULATED.has(def.id)) lines.push(["note", "No effect in this simulator: the dummy never fights back."]);
    if (r > 0 && !canRemove(ranks, def.id)) lines.push(["note", "Other talents depend on this one."]);

    tooltip.replaceChildren(...lines.map(([cls, text]) => el("p", cls, text)));
    tooltip.hidden = false;
  };

  const placeTooltip = (x: number, y: number) => {
    const pad = 16;
    const { width, height } = tooltip.getBoundingClientRect();
    const left = x + pad + width > window.innerWidth ? x - pad - width : x + pad;
    const top = Math.min(y + pad, window.innerHeight - height - 8);
    tooltip.style.left = `${Math.max(8, left)}px`;
    tooltip.style.top = `${Math.max(8, top)}px`;
  };

  const open = () => {
    modal.hidden = false;
    refresh();
    closeButton.focus();
  };

  const close = () => {
    modal.hidden = true;
    tooltip.hidden = true;
    hovered = null;
    openButton.focus();
    openButton.blur();
  };

  openButton.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  modal.addEventListener("pointerdown", (e) => {
    if (e.target === modal) close();
  });
  resetButton.addEventListener("click", () => commit({}));
  presetSelect.addEventListener("change", () => {
    const preset = PRESETS[Number(presetSelect.value)];
    if (preset) commit({ ...preset.ranks });
    presetSelect.value = "";
  });

  // Capture phase so the game never sees keys while the window is open, and so N opens it
  // (unless the player bound N to an ability).
  window.addEventListener(
    "keydown",
    (e) => {
      if (!modal.hidden) {
        if (e.target instanceof HTMLSelectElement) return;
        e.stopImmediatePropagation();
        if (e.code === "Escape" || e.code === "KeyN") {
          e.preventDefault();
          close();
        }
        return;
      }
      const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement;
      const plainN = e.code === "KeyN" && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
      if (plainN && !typing && !keybinds.capturing && keybinds.abilityFor("KeyN") === undefined) {
        e.preventDefault();
        e.stopImmediatePropagation();
        open();
      }
    },
    true,
  );

  refresh();
}
