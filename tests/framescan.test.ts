import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { brailleBars, braillePointer, column, describeCell, describeFrame, resample } from '../src/a11y/braille';
import type { FrameFeature, FrameScanDoc } from '../src/contracts';
import { columnProfile, featureEvents, frameGrid, scanEvents, type ScanGrid } from '../src/sound/frameScan';

const opts = { scale: 'C pentatonic', pitchLow: 48, pitchHigh: 84, stepIndex: 0, t: 'D001', label: 'Jan 01', datasetId: 'test', selectionId: 'frame' };
function grid(vals: (number | null)[][], refMax = 24): ScanGrid {
  // vals[row][col], row 0 = south
  return { ncol: vals[0].length, nrow: vals.length, lonMin: 100, latMin: 0, step: 1, unit: 'mm/day', derivation: 'image-derived', refMax, value: (r, c) => vals[r][c] };
}

describe('braille charts', () => {
  it('encodes dot columns bottom-up', () => {
    expect(column(0, 'left')).toBe(0);
    expect(column(1, 'left')).toBe(0x40);        // dot 7
    expect(column(4, 'left')).toBe(0x47);        // dots 7,3,2,1
    expect(column(4, 'right')).toBe(0xb8);       // dots 8,6,5,4
  });
  it('empty is a blank cell and full is ⣿', () => {
    expect(brailleBars([0, 0], 1, [0, 1])).toBe('⠀');
    expect(brailleBars([1, 1], 1, [0, 1])).toBe('⣿');
    expect(brailleBars([1, 0], 1, [0, 1])).toBe(String.fromCharCode(0x2800 + 0x47));
  });
  it('rising data rises, and the output has exactly `cells` characters', () => {
    const s = brailleBars([0, 1, 2, 3, 4, 5, 6, 7], 4, [0, 7]);
    expect([...s]).toHaveLength(4);
    const heights = [...s].map((ch) => ch.charCodeAt(0) - 0x2800);
    expect(heights[3]).toBeGreaterThan(heights[0]);
  });
  it('resample averages bins and skips missing', () => {
    expect(resample([1, null, 3, 5], 2)).toEqual([1, 4]);
  });
  it('pointer marks the right cell', () => {
    const p = braillePointer(50, 100, 10);
    expect([...p].findIndex((c) => c === '⣀')).toBe(5);
  });
});

describe('frame sweep (Hubble-style)', () => {
  const g = grid([
    [10, 0, null],   // south row
    [0, 0, 0],
    [0, 20, 5],      // north row
  ]);
  it('sweeps west to east and is deterministic', () => {
    const ev = scanEvents(g, opts);
    expect(ev.map((e) => e.scan!.col)).toEqual([...ev.map((e) => e.scan!.col)].sort((a, b) => a - b));
    expect(JSON.stringify(scanEvents(g, opts))).toBe(JSON.stringify(ev));
    expect(ev.every((e) => e.offset >= 0 && e.offset < 1)).toBe(true);
  });
  it('north is higher pitch and more rain is louder', () => {
    const ev = scanEvents(g, opts);
    const south = ev.find((e) => e.scan!.row === 0 && e.scan!.col === 0)!;
    const north = ev.find((e) => e.scan!.row === 2 && e.scan!.col === 1)!;
    expect(north.midi!).toBeGreaterThan(south.midi!);
    expect(north.velocity!).toBeGreaterThan(south.velocity!);
  });
  it('unknown and dry cells are silent; values keep their derivation', () => {
    const ev = scanEvents(g, opts);
    expect(ev.find((e) => e.scan!.col === 2 && e.scan!.row === 0)).toBeUndefined();
    expect(ev.some((e) => e.original.value === 0)).toBe(false);
    expect(ev[0].original.derivation).toBe('image-derived');
    expect(ev[0].original.unit).toBe('mm/day');
  });
  it('west is panned left, east right', () => {
    const ev = scanEvents(g, opts);
    expect(ev.find((e) => e.scan!.col === 0)!.pan).toBe(-1);
    expect(ev.find((e) => e.scan!.col === 2)!.pan).toBe(1);
  });
  it('column profile ignores unknown cells', () => {
    expect(columnProfile(g)).toEqual([10 / 3, 20 / 3, 2.5]);
  });
});

const doc: FrameScanDoc = JSON.parse(readFileSync('public/data/svs5478/frame-features.json', 'utf8'));
const bytes = new Uint8Array(readFileSync('public/data/svs5478/frame-scan.bin'));

describe('decoded SVS frames', () => {
  it('has 366 days and a grid of the declared size', () => {
    expect(doc.days).toHaveLength(366);
    expect(bytes.length).toBe(366 * doc.grid.nrow * doc.grid.ncol);
  });
  it('passed decode validation against the IMERG reconstruction', () => {
    expect(doc.decodeValidation.colorbarRoundTripMaxErrorMmDay).toBeLessThanOrEqual(0.3);
    expect(doc.decodeValidation.vsReconstructedClimatology.pearsonR).toBeGreaterThanOrEqual(0.8);
    expect(doc.decodeValidation.unknownPixelPct).toBeLessThan(5);
  });
  it('captures the monsoon: the rain band is farther north in July than in January', () => {
    expect(doc.days[196].bandLat!).toBeGreaterThan(doc.days[14].bandLat! + 5);
  });
  it('frameGrid reads values in mm/day', () => {
    const g = frameGrid(doc, bytes, 196);
    const vals = Array.from({ length: g.nrow * g.ncol }, (_, k) => g.value(Math.floor(k / g.ncol), k % g.ncol)).filter((v): v is number => v != null);
    expect(Math.max(...vals)).toBeLessThanOrEqual(25.4);
    expect(vals.length).toBeGreaterThan(0.9 * g.nrow * g.ncol);
  });
});

describe('features and descriptions', () => {
  it('rain-band voice follows latitude', () => {
    const ev = featureEvents(doc.days, { scale: 'C pentatonic', pitchLow: 48, pitchHigh: 84 });
    const jan = ev[14].find((e) => e.kind === 'feature')!;
    const jul = ev[196].find((e) => e.kind === 'feature')!;
    expect(jul.midi!).toBeGreaterThan(jan.midi!);
  });
  it('marks turning points of the band', () => {
    const ev = featureEvents(doc.days, { scale: 'C pentatonic', pitchLow: 48, pitchHigh: 84 }).flat();
    expect(ev.some((e) => e.marker === 'turn')).toBe(true);
  });
  it('describes trend direction and labels image-derived values', () => {
    const f: FrameFeature = { ...doc.days[150], bandLat: 12, bandTrend: 'north', bandDelta14: 2.4 };
    const text = describeFrame(f, doc.days, 0.4);
    expect(text).toMatch(/moving north/);
    expect(text).toMatch(/image-derived/);
    expect(text).toMatch(/0\.400 mm\/hr/);
  });
  it('cell description handles unknown cells', () => {
    expect(describeCell(10, 120, null, 'mm/day', 'image-derived')).toMatch(/no value/);
    expect(describeCell(-5, 120, 9, 'mm/day', 'image-derived')).toMatch(/5\.0°S.*heavy/);
  });
});
