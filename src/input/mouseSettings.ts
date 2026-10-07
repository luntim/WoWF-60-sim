const STORAGE_KEY = "rogue-sim-mouse-v1";

export interface MouseSettings {
  /** Degrees of turn per pixel of mouse movement while right-dragging. */
  sensitivity: number;
  invertY: boolean;
}

const DEFAULTS: MouseSettings = { sensitivity: 0.25, invertY: false };
const MIN = 0.05;
const MAX = 1;

export function loadMouseSettings(): MouseSettings {
  const settings = { ...DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<MouseSettings> | null;
    if (typeof saved?.sensitivity === "number" && saved.sensitivity >= MIN && saved.sensitivity <= MAX) {
      settings.sensitivity = saved.sensitivity;
    }
    if (typeof saved?.invertY === "boolean") settings.invertY = saved.invertY;
  } catch {
    // Storage unavailable or corrupt: defaults.
  }
  return settings;
}

function save(settings: MouseSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Not persisting is fine.
  }
}

/** Side-panel controls. Mutates `settings` in place so the world sees changes immediately. */
export function mountMouseSettings(root: HTMLElement, settings: MouseSettings): void {
  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = "Mouse";

  const sensLabel = document.createElement("label");
  const sensText = document.createElement("span");
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(MIN);
  slider.max = String(MAX);
  slider.step = "0.01";
  slider.value = String(settings.sensitivity);
  const showSens = () => (sensText.textContent = `Look speed ${settings.sensitivity.toFixed(2)}°/px`);
  slider.addEventListener("input", () => {
    settings.sensitivity = Number(slider.value);
    showSens();
    save(settings);
  });
  showSens();
  sensLabel.className = "stacked";
  sensLabel.append(sensText, slider);

  const invertLabel = document.createElement("label");
  invertLabel.className = "check";
  const invert = document.createElement("input");
  invert.type = "checkbox";
  invert.checked = settings.invertY;
  invert.addEventListener("change", () => {
    settings.invertY = invert.checked;
    save(settings);
  });
  const invertText = document.createElement("span");
  invertText.textContent = "Invert vertical look";
  invertLabel.append(invert, invertText);

  fieldset.append(legend, sensLabel, invertLabel);
  root.append(fieldset);
}
