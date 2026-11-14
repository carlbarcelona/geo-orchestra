import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { brailleBars, braillePointer, column, describeCell, describeFrame, describeSweep, resample } from '../src/a11y/braille';
import type { FrameFeature, FrameScanDoc } from '../src/contracts';
import { analyzeBeats, cellEvent, columnProfile, featureEvents, frameGrid, latitudeBands, latitudeNote, SCAN, scanEvents, type ScanGrid } from '../src/sound/frameScan';
import { intensityClass, INTENSITY } from '../src/sound/intensity';
import { scaleNotes } from '../src/sound/mapping';

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

describe('scan-v2: one learnable rule', () => {
  const notes = scaleNotes('C pentatonic', 48, 84);
  it('one latitude table: 16 notes on 2.5° bands, south lowest, C4 at 2.5–5°N', () => {
    const bands = latitudeBands(notes);
    expect(bands).toHaveLength(16);
    expect(bands[0]).toMatchObject({ lo: -10, hi: -7.5, midi: 48 });
    expect(bands.every((b, i) => i === 0 || b.midi > bands[i - 1].midi)).toBe(true);
    expect(latitudeNote(3, notes).midi).toBe(60);     // C4
    expect(latitudeNote(29.9, notes).midi).toBe(84);  // C6
    expect(latitudeNote(14.6, notes).midi).toBe(69);  // Manila → A4
  });
  it('rain classes match the description words', () => {
    expect([1.9, 2, 5, 8, 14].map(intensityClass)).toEqual(['dry', 'light', 'moderate', 'heavy', 'very heavy']);
    expect(INTENSITY.velocity.heavy).toBeGreaterThan(INTENSITY.velocity.light);
  });
  const g = frameGrid(doc, bytes, 196); // Jul 15
  const ev = scanEvents(g, opts);
  const scan = ev.filter((e) => e.kind === 'scan');
  it('a frame is 11 beats, at most 2 notes each, west → east', () => {
    expect(analyzeBeats(g, opts)).toHaveLength(SCAN.beats);
    const perBeat = new Map<number, number>();
    scan.forEach((e) => perBeat.set(e.scan!.beat!, (perBeat.get(e.scan!.beat!) ?? 0) + 1));
    expect(Math.max(...perBeat.values())).toBeLessThanOrEqual(SCAN.notesPerBeat);
    expect(scan.length).toBeLessThanOrEqual(SCAN.beats * SCAN.notesPerBeat);
    const offs = scan.map((e) => e.offset);
    expect(offs).toEqual([...offs].sort((a, b) => a - b));
  });
  it('pitch is the latitude band, loudness the rain class', () => {
    for (const e of scan) {
      expect(e.midi).toBe(latitudeNote(e.scan!.lat, notes).midi);
      expect(e.velocity).toBe(INTENSITY.velocity[e.scan!.intensity as keyof typeof INTENSITY.velocity]);
      expect(e.scan!.intensity).not.toBe('dry');
    }
  });
  it('a dry beat is a rest', () => {
    const dry = grid([[0, 0, 0, 0], [0, 10, 0, 0]]);
    const e = scanEvents(dry, { ...opts, beats: 4 }).filter((x) => x.kind === 'scan');
    expect(e.map((x) => x.scan!.beat)).toEqual([1]);
  });
  it('beats over the Philippine sector get a soft tick', () => {
    const ticks = ev.filter((e) => e.marker === 'region').map((e) => e.scan!.beat);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    for (const b of ticks) {
      const [w, e] = analyzeBeats(g, opts)[b!].lon;
      expect(e > SCAN.region.lonMin && w < SCAN.region.lonMax).toBe(true);
    }
  });
  it('the sweep, the band voice and the cursor give the same note for the same latitude', () => {
    const day = doc.days[196];
    const band = featureEvents(doc.days, opts)[196].find((e) => e.kind === 'feature')!;
    expect(band.midi).toBe(latitudeNote(day.bandLat!, notes).midi);
    const r = Math.floor((day.bandLat! - g.latMin) / g.step), c = 25;
    const cur = cellEvent(g, r, c, opts);
    if (cur) expect(cur.midi).toBe(latitudeNote(g.latMin + (r + 0.5) * g.step, notes).midi);
  });
  it('describes the sweep in words', () => {
    const t = describeSweep(ev, SCAN.beats);
    expect(t).toMatch(/11 beats from west to east/);
    expect(t).toMatch(/Philippine sector/);
    expect(describeSweep([], 11)).toMatch(/All 11 beats are silent/);
  });
});
