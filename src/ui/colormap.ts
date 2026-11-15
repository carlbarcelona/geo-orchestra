/** Rainfall colormap for maps rendered by GeoOrchestra (not NASA imagery). Fixed range, sqrt scale. */
const STOPS: [number, [number, number, number]][] = [
  [0.0, [10, 22, 60]],
  [0.15, [24, 60, 200]],
  [0.35, [20, 170, 230]],
  [0.55, [40, 210, 140]],
  [0.72, [240, 230, 60]],
  [0.86, [250, 150, 30]],
  [1.0, [225, 40, 40]],
];
export const MAP_RANGE: [number, number] = [0, 1.5];
export const MAP_TICKS = [0, 0.1, 0.25, 0.5, 1.0, 1.5];

export function rampColor(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < STOPS.length; i++) {
    const [p1, c1] = STOPS[i];
    const [p0, c0] = STOPS[i - 1];
    if (x <= p1) {
      const f = (x - p0) / (p1 - p0);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  return STOPS[STOPS.length - 1][1];
}
export function valueToT(v: number) { return Math.sqrt(Math.min(MAP_RANGE[1], Math.max(0, v)) / MAP_RANGE[1]); }
export function valueColor(v: number) { return rampColor(valueToT(v)); }
export const RAMP_CSS = `linear-gradient(90deg, ${STOPS.map(([p, c]) => `rgb(${c.join(',')}) ${p * 100}%`).join(', ')})`;
