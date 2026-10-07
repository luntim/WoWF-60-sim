export const FONT = "system-ui, -apple-system, Segoe UI, sans-serif";
export const MONO = "ui-monospace, Menlo, Consolas, monospace";

export function toCss(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}
