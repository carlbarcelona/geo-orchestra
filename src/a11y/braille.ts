import type { FrameFeature, SoundEvent } from '../contracts';
import { intensityWord } from '../sound/intensity';

/**
 * Unicode braille charts (U+2800–U+28FF). Each braille cell holds two columns of four dots, so one
 * cell shows two data points as bar heights 0–4. On a refreshable braille display the dots are felt
 * directly (support varies by screen reader; see docs/accessibility.md).
 */
const LEFT = [0x40, 0x04, 0x02, 0x01];  // dots 7, 3, 2, 1 (bottom → top)
const RIGHT = [0x80, 0x20, 0x10, 0x08]; // dots 8, 6, 5, 4 (bottom → top)

export function column(height: number, side: 'left' | 'right'): number {
  const bits = side === 'left' ? LEFT : RIGHT;
  let v = 0;
  for (let k = 0; k < Math.max(0, Math.min(4, height)); k++) v |= bits[k];
  return v;
}

/** Resample `values` to `2 * cells` points (mean per bin, nulls skipped). */
export function resample(values: (number | null)[], points: number): (number | null)[] {
  if (!values.length) return [];
  return Array.from({ length: points }, (_, i) => {
    const a = Math.floor((i * values.length) / points), b = Math.max(a + 1, Math.floor(((i + 1) * values.length) / points));
    let s = 0, n = 0;
    for (let k = a; k < b; k++) { const v = values[k]; if (v != null) { s += v; n++; } }
    return n ? s / n : null;
  });
}

/** Bar chart as braille: heights scaled to [min, max] → 1..4 dots (0 dots only for missing or the minimum when min is 0). */
export function brailleBars(values: (number | null)[], cells = 40, range?: [number, number]): string {
  const pts = resample(values, cells * 2);
  const known = pts.filter((v): v is number => v != null);
  const lo = range?.[0] ?? Math.min(...known, 0);
  const hi = range?.[1] ?? Math.max(...known, lo + 1e-9);
  const h = (v: number | null) => (v == null ? 0 : Math.round(((v - lo) / (hi - lo || 1)) * 4));
  let out = '';
  for (let c = 0; c < cells; c++) out += String.fromCharCode(0x2800 + column(h(pts[2 * c]), 'left') + column(h(pts[2 * c + 1]), 'right'));
  return out;
}

/** A pointer line under a braille chart: dots 7-8 (⣀) under the cell that holds position `index` of `length`. */
export function braillePointer(index: number, length: number, cells = 40): string {
  const at = Math.min(cells - 1, Math.floor((index / Math.max(1, length)) * cells));
  return Array.from({ length: cells }, (_, c) => (c === at ? '⣀' : '⠀')).join('');
}

const dir = (lat: number) => `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`;

/** Plain-language description of one frame for screen readers and braille displays. */
export function describeFrame(f: FrameFeature, all: FrameFeature[], measuredMmHr?: number | null): string {
  const parts: string[] = [];
  parts.push(`${f.label}, seasonal average 2001–2022.`);
  if (f.bandLat != null) {
    const trend = f.bandTrend === 'steady' ? 'holding steady' : `moving ${f.bandTrend} (${f.bandDelta14! > 0 ? '+' : ''}${f.bandDelta14!.toFixed(1)}° over two weeks)`;
    const overPh = f.bandLat >= 4.5 && f.bandLat <= 21.5 ? 'over the Philippines' : f.bandLat < 4.5 ? 'south of the Philippines' : 'north of the Philippines';
    parts.push(`The heaviest rain band lies near ${dir(f.bandLat)}, ${overPh}, ${trend}.`);
  }
  parts.push(`${Math.round(f.wetPct)}% of the West-Pacific view has heavy rain (8 mm/day or more).`);
  if (f.phLandMmDay != null) {
    const ranks = all.map((d) => d.phLandMmDay ?? 0).sort((a, b) => a - b);
    const pct = Math.round((ranks.filter((v) => v <= f.phLandMmDay!).length / ranks.length) * 100);
    parts.push(`Philippine land average about ${f.phLandMmDay.toFixed(1)} mm/day, ${intensityWord(f.phLandMmDay)}; wetter than ${pct}% of the year (image-derived).`);
  }
  if (measuredMmHr != null) parts.push(`Linked measurement: ${measuredMmHr.toFixed(3)} mm/hr, about ${(measuredMmHr * 24).toFixed(1)} mm/day.`);
  return parts.join(' ');
}

/** Short description of a single cell for the audio cursor. */
export function describeCell(lat: number, lon: number, v: number | null, unit: string, derivation: string): string {
  const where = `${dir(lat)}, ${lon.toFixed(1)}°E`;
  if (v == null) return `${where}: no value (coastline or label pixels).`;
  const mmDay = unit === 'mm/hr' ? v * 24 : v;
  return `${where}: ${v.toFixed(unit === 'mm/hr' ? 3 : 1)} ${unit}, ${intensityWord(mmDay)} (${derivation}).`;
}

/** Compress a sorted list of 0-based beat indexes into "1–3, 7" (1-based). */
function beatList(b: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < b.length; i++) {
    let j = i;
    while (j + 1 < b.length && b[j + 1] === b[j] + 1) j++;
    out.push(j > i ? `${b[i] + 1}–${b[j] + 1}` : `${b[i] + 1}`);
    i = j;
  }
  return out.join(', ');
}

/** Words for one sweep: which beats are silent, which notes (latitudes) the tune sits on, the loudest beat. */
export function describeSweep(events: SoundEvent[], beats: number): string {
  const notes = events.filter((e) => e.kind === 'scan' && e.scan?.beat != null);
  if (!notes.length) return `All ${beats} beats are silent: no light rain or more anywhere in this view.`;
  const sounding = [...new Set(notes.map((e) => e.scan!.beat!))].sort((a, b) => a - b);
  const silent = Array.from({ length: beats }, (_, i) => i).filter((i) => !sounding.includes(i));
  const count = new Map<string, { n: number; e: SoundEvent }>();
  for (const e of notes) { const k = e.note!; const c = count.get(k); count.set(k, { n: (c?.n ?? 0) + 1, e: c?.e ?? e }); }
  const common = [...count.values()].sort((a, b) => b.n - a.n).slice(0, 2).map(({ e }) => `${e.note} (${dir(e.scan!.latBand![0])} to ${dir(e.scan!.latBand![1])})`);
  const loud = notes.reduce((a, b) => ((b.original.value ?? 0) > (a.original.value ?? 0) ? b : a));
  const region = [...new Set(events.filter((e) => e.marker === 'region' && e.scan?.beat != null).map((e) => e.scan!.beat!))].sort((a, b) => a - b);
  const parts = [`The sweep plays ${beats} beats from west to east.`];
  parts.push(silent.length ? `Beats ${beatList(silent)} are silent (dry).` : 'Every beat has rain.');
  parts.push(`The tune sits mostly on ${common.join(' and ')}.`);
  parts.push(`The loudest note is beat ${loud.scan!.beat! + 1}: ${loud.scan!.intensity} rain near ${dir(loud.scan!.lat)}.`);
  if (region.length) parts.push(`Beats ${beatList(region)} cover the Philippine sector (soft tick).`);
  return parts.join(' ');
}
