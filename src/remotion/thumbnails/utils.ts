export const INK = "#050505";
export const CREAM = "#fff3df";
export const PAPER = "#f1e5ce";
export const YELLOW = "#ffd20a";
export const RED = "#ff4f43";

/**
 * Returns a font size in px that scales down when lines are long.
 * maxPx is the size used when the longest line has ≤6 characters.
 */
export function fitFontSize(lines: string[], maxPx: number): number {
  const longest = Math.max(...lines.map((l) => l.length), 1);
  const scale = Math.min(1, 7 / longest);
  return Math.round(maxPx * scale);
}
