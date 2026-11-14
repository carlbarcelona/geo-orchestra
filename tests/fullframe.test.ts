import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeSweep } from '../src/a11y/braille';
import type { FrameScanDoc } from '../src/contracts';
import { analyzeBeats, cropGrid, describeShape, detectSystems, frameGridGlobal, SCAN, scanEvents, type ScanGrid } from '../src/sound/frameScan';

const opts = { scale: 'C pentatonic', pitchLow: 48, pitchHigh: 84, stepIndex: 0, t: 'D001', label: 'Jan 01', datasetId: 'test', selectionId: 'frame' };
function grid(vals: (number | null)[][]): ScanGrid {
  // vals[row][col], row 0 = south
  return { ncol: vals[0].length, nrow: vals.length, lonMin: 100, latMin: 0, step: 1, unit: 'mm/day', derivation: 'image-derived', refMax: 24, latRange: [0, vals.length], value: (r, c) => vals[r][c] };
}

const doc = JSON.parse(readFileSync('public/data/svs5478/frame-features.json', 'utf8')) as FrameScanDoc;
const bytes = new Uint8Array(readFileSync('public/data/svs5478/frame-scan-global.bin'));

describe('whole-frame grid (scan-v3)', () => {
  it('covers the entire frame, 180°W–180°E and 90°S–90°N, for every day', () => {
    const gg = doc.globalGrid!;
    expect(gg.ncol * gg.step).toBe(360);
    expect(gg.nrow * gg.step).toBe(180);
    expect(gg.lonMin).toBe(-180);
    expect(bytes.length).toBe(doc.days.length * gg.ncol * gg.nrow);
  });
  it('sweeps 24 beats edge to edge with a 60°S–60°N pitch table', () => {
    const g = frameGridGlobal(doc, bytes, 0)!;
    const beats = analyzeBeats(g, opts);
    expect(beats).toHaveLength(SCAN.global.beats);
    expect(beats[0].lon[0]).toBe(-180);
    expect(beats[beats.length - 1].lon[1]).toBe(180);
    expect(g.latRange).toEqual([-60, 60]);
  });
  it('the decoded frame agrees with the West Pacific grid where they overlap', () => {
    const g = frameGridGlobal(doc, bytes, 196)!;
    // mean over 120–130°E, 5–15°N in both grids (July: monsoon rain)
    const mean = (gr: ScanGrid, lon0: number, lon1: number, lat0: number, lat1: number) => {
      let s = 0, n = 0;
      for (let r = 0; r < gr.nrow; r++) for (let c = 0; c < gr.ncol; c++) {
        const lat = gr.latMin + (r + 0.5) * gr.step, lon = gr.lonMin + (c + 0.5) * gr.step;
        const v = gr.value(r, c);
        if (v != null && lat > lat0 && lat < lat1 && lon > lon0 && lon < lon1) { s += v; n++; }
      }
      return s / n;
    };
    const roiBytes = new Uint8Array(readFileSync('public/data/svs5478/frame-scan.bin'));
    const pg = doc.grid;
    const roi: ScanGrid = { ...pg, unit: 'mm/day', derivation: 'image-derived', refMax: 24, value: (r, c) => { const b = roiBytes[196 * pg.nrow * pg.ncol + r * pg.ncol + c]; return b === 255 ? null : b * 0.1; } };
    expect(Math.abs(mean(g, 120, 130, 5, 15) - mean(roi, 120, 130, 5, 15))).toBeLessThan(1.5);
  });
  it('finds rain systems on a real frame, in both zones', () => {
    const systems = detectSystems(frameGridGlobal(doc, bytes, 196)!);
    expect(systems.length).toBeGreaterThan(3);
    expect(systems.some((s) => s.zone === 'tropical')).toBe(true);
    expect(systems.every((s) => Math.abs(s.lat) <= 60)).toBe(true);
    // numbered west → east
    for (let i = 1; i < systems.length; i++) expect(systems[i].colRange[0]).toBeGreaterThanOrEqual(systems[i - 1].colRange[0]);
  });
});

describe('rain systems', () => {
  const dry = 1, wet = 12;
  // an east–west band (rows 4–5, cols 2–9) and a small north–south blob (col 13–14, rows 1–6)
  const vals = Array.from({ length: 8 }, (_, r) => Array.from({ length: 16 }, (_, c) =>
    (r >= 4 && r <= 5 && c >= 2 && c <= 9) || (c >= 13 && c <= 13 && r >= 1 && r <= 6) ? wet : dry));
  const g = grid(vals);
  const systems = detectSystems(g);

  it('groups connected heavy-rain cells into one system each', () => {
    expect(systems).toHaveLength(2);
    expect(systems[0].cells).toBe(16);
    expect(systems[1].cells).toBe(6);
  });
  it('reports the column extents the scan line lights up', () => {
    expect(systems[0].colRange).toEqual([2, 9]);
    expect(systems[0].extents.get(5)).toEqual([4, 5]);
    expect(systems[1].extents.get(13)).toEqual([1, 6]);
  });
  it('describes shape and direction from the long axis', () => {
    expect(describeShape(systems[0])).toBe('stretched east–west');
    expect(describeShape(systems[1])).toBe('stretched north–south');
  });
  it('ignores patches smaller than the minimum and anything below heavy rain', () => {
    const tiny = grid([[wet, dry, dry, dry], [dry, dry, 7.9, 7.9], [dry, dry, 7.9, 7.9]]);
    expect(detectSystems(tiny)).toHaveLength(0);
  });
  it('holds one note per system from the beat the line enters to the beat it leaves', () => {
    const ev = scanEvents(g, opts).filter((e) => e.kind === 'system');
    expect(ev).toHaveLength(2);
    expect(ev[0].offset).toBeCloseTo(2 / 16);
    expect(ev[0].duration).toBeCloseTo(8 / 16);
    expect(ev[0].system?.zone).toBe('tropical');
    expect(ev[1].midi).toBeLessThanOrEqual(ev[0].midi!); // blob centre row 3.5 is south of the band's 4.5: same or lower note
    expect(scanEvents(g, { ...opts, systems: false }).some((e) => e.kind === 'system')).toBe(false);
  });
  it('is mentioned in the spoken sweep description', () => {
    expect(describeSweep(scanEvents(g, opts), 8)).toMatch(/crosses 2 rain systems/);
  });
});

describe('sweep crop', () => {
  const g: ScanGrid = { ncol: 144, nrow: 72, lonMin: -180, latMin: -90, step: 2.5, unit: 'mm/day', derivation: 'image-derived', refMax: 24, latRange: [-60, 60], value: (r, c) => r * 1000 + c };
  it('reads only the cells inside the box, snapped to whole cells', () => {
    const c = cropGrid(g, { lonMin: 100, lonMax: 150, latMin: -10, latMax: 30 })!;
    expect(c.lonMin).toBe(100);
    expect(c.ncol).toBe(20);
    expect(c.latMin).toBe(-10);
    expect(c.nrow).toBe(16);
    expect(c.value(0, 0)).toBe(g.value(32, 112));
    expect(c.latRange).toEqual([-10, 30]);
    expect(c.area).toMatch(/^crop/);
  });
  it('rejects a box smaller than two cells', () => {
    expect(cropGrid(g, { lonMin: 100, lonMax: 101, latMin: 0, latMax: 10 })).toBeNull();
  });
});
