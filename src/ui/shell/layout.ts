/**
 * Resizable workspace layout: pure helpers (tested) for the splitters between panels.
 * Sizes are pixels of the grid tracks: the left and right columns, and the top row (the music chart sits below it).
 * Stored per browser and per workspace; any storage failure falls back to the stylesheet defaults.
 */
export type WorkspaceId = 'numerical' | 'visual';
export interface Layout { left?: number; right?: number; top?: number }

export const LIMITS = { left: 240, right: 280, centre: 420, top: 260, bottom: 220, gap: 10, pad: 10 } as const;

/** Parse a resolved `grid-template-*` value ("300px 812.5px 330px") into numbers. */
export function parseTracks(v: string): number[] {
  return v.trim().split(/\s+/).map((t) => parseFloat(t)).filter((n) => Number.isFinite(n));
}

/**
 * Keep both side columns at or above their minimum and the centre column at least LIMITS.centre wide.
 * `moving` is the side being dragged: when space runs out, that side stops growing and the other one is kept.
 */
export function clampColumns(left: number, right: number, innerWidth: number, moving: 'left' | 'right' = 'left'): { left: number; right: number } {
  const room = Math.max(LIMITS.left + LIMITS.right, innerWidth - 2 * LIMITS.gap - LIMITS.centre);
  let l = Math.max(LIMITS.left, Math.round(left));
  let r = Math.max(LIMITS.right, Math.round(right));
  if (l + r > room) {
    if (moving === 'left') { l = Math.max(LIMITS.left, room - r); r = Math.max(LIMITS.right, room - l); }
    else { r = Math.max(LIMITS.right, room - l); l = Math.max(LIMITS.left, room - r); }
  }
  return { left: l, right: r };
}

/** Keep the top row at least LIMITS.top and leave the bottom row (the music chart) at least LIMITS.bottom. */
export function clampTop(top: number, innerHeight: number): number {
  const max = Math.max(LIMITS.top, innerHeight - LIMITS.gap - LIMITS.bottom);
  return Math.round(Math.min(max, Math.max(LIMITS.top, top)));
}

/** CSS variables for a layout; an unset size keeps the stylesheet default. */
export function layoutVars(l: Layout): Record<'--cols' | '--rows', string | null> {
  return {
    '--cols': l.left != null && l.right != null ? `${l.left}px minmax(${LIMITS.centre}px, 1fr) ${l.right}px` : null,
    '--rows': l.top != null ? `${l.top}px minmax(${LIMITS.bottom}px, 1fr)` : null,
  };
}

const storageKey = (ws: WorkspaceId) => `geoorchestra:layout:${ws}`;
export function readLayout(ws: WorkspaceId): Layout {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(ws));
    if (!raw) return {};
    const v = JSON.parse(raw) as Layout;
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : undefined);
    const out: Layout = {};
    const left = num(v.left), right = num(v.right), top = num(v.top);
    if (left != null && right != null) { out.left = left; out.right = right; }
    if (top != null) out.top = top;
    return out;
  } catch { return {}; }
}
export function writeLayout(ws: WorkspaceId, l: Layout) {
  try {
    if (l.left == null && l.top == null) globalThis.localStorage?.removeItem(storageKey(ws));
    else globalThis.localStorage?.setItem(storageKey(ws), JSON.stringify(l));
  } catch { /* storage unavailable: the layout is just not remembered */ }
}

/** Window event that resets every workspace to the default layout (status bar button). */
export const RESET_LAYOUT_EVENT = 'geoorchestra:reset-layout';
