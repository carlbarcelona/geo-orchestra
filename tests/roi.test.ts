import { describe, expect, it, vi } from 'vitest';

vi.mock('tone', () => ({}));
vi.mock('../src/sound/engine', () => ({
  engine: { start: async () => true, playStep: () => {}, silence: () => {}, setInstrument: () => {}, setMaster: () => {}, setLevels: () => {}, audition: async () => {}, auditionCue: async () => {} },
  INSTRUMENTS: [],
}));

import { ProjectFileSchema } from '../src/contracts';
import { ROI, roiEvents, roiMean, roiNote, SCAN, type ScanGrid } from '../src/sound/frameScan';
import { scaleNotes } from '../src/sound/mapping';
import { normaliseRoi, roiActive, roiLabel, setRoi, visualScanGrid } from '../src/state/actions';
import { get, set } from '../src/state/store';

const grid = (vals: (number | null)[][], latMin = 0, step = 1): ScanGrid => ({
  ncol: vals[0].length, nrow: vals.length, lonMin: 100, latMin, step, unit: 'mm/day', derivation: 'image-derived', refMax: 24,
  value: (r, c) => vals[r]?.[c] ?? null,
});

describe('ROI mean (image-derived rain inside the region)', () => {
  it('leaves unknown cells out instead of counting them as 0', () => {
    const m = roiMean(grid([[10, null], [10, 10]]));
    expect(m.value).toBeCloseTo(10, 6);
    expect(m.known).toBe(3);
    expect(m.cells).toBe(4);
  });
  it('has no value when no cell could be decoded', () => {
    expect(roiMean(grid([[null, null]])).value).toBeNull();
  });
  it('weights rows by cos(latitude), so equal-area rain counts equally', () => {
    // rows centred on 0° (weight 1) and 60°N (weight 0.5): (0·1 + 12·0.5) / 1.5 = 4, not the plain mean 6
    expect(roiMean(grid([[0, 0], [12, 12]], -30, 60)).value!).toBeCloseTo(4, 6);
  });
});

describe('ROI voice (scan-v4)', () => {
  const notes = scaleNotes('C pentatonic', 48, 84);
  const opts = { scale: 'C pentatonic', pitchLow: 48, pitchHigh: 84, labels: ['Jan 01', 'Jan 02', 'Jan 03', 'Jan 04'], area: 'test box' };
  const days = [grid([[1, 1]]), grid([[6, 6]]), grid([[20, 20]]), grid([[null, null]])];
  const ev = roiEvents((i) => days[i], 4, opts);

  it('is silent for dry days and for days with no decoded cell', () => {
    expect(ev[0]).toEqual([]);
    expect(ev[3]).toEqual([]);
  });
  it('plays higher and louder for more rain, on a fixed 0–24 mm/day range', () => {
    const [a] = ev[1], [b] = ev[2];
    expect(b.midi!).toBeGreaterThan(a.midi!);
    expect(b.velocity!).toBeGreaterThan(a.velocity!);
    expect(roiNote(0, notes)).toBe(notes[0]);
    expect(roiNote(ROI.maxMmDay, notes)).toBe(notes.at(-1));
    expect(roiNote(99, notes)).toBe(notes.at(-1));
  });
  it('labels every note as image-derived, keeps its value, and plays off the beat', () => {
    const [b] = ev[2];
    expect(b.original).toMatchObject({ value: 20, unit: 'mm/day', derivation: 'image-derived' });
    expect(b.offset).toBe(ROI.offset);
    expect(b.selectionId).toBe('roi');
    expect(b.mappingVersion).toBe(SCAN.version);
    expect(b.explanation).toMatch(/image-derived/);
  });
  it('is deterministic', () => {
    expect(roiEvents((i) => days[i], 4, opts)).toEqual(ev);
  });
  it('is scan-v4', () => expect(SCAN.version).toBe('scan-v4'));
});

describe('ROI tool', () => {
  it('validates typed edges: orders them, clamps to the frame, rejects slivers and blanks', () => {
    expect(normaliseRoi({ lonMin: 130, lonMax: 110, latMin: 20, latMax: 0 })).toEqual({ lonMin: 110, lonMax: 130, latMin: 0, latMax: 20 });
    expect(normaliseRoi({ lonMin: -200, lonMax: -170, latMin: 80, latMax: 95 })).toEqual({ lonMin: -180, lonMax: -170, latMin: 80, latMax: 90 });
    expect(typeof normaliseRoi({ lonMin: 110, lonMax: 111, latMin: 0, latMax: 20 })).toBe('string');
    expect(typeof normaliseRoi({ lonMin: NaN, lonMax: 111, latMin: 0, latMax: 20 })).toBe('string');
  });

  it('an ROI inside the West Pacific crops the finer 1° grid; elsewhere the 2.5° whole-frame grid', () => {
    // switching to the West Pacific preset loads its frames; node has no Image
    (globalThis as { Image?: unknown }).Image ??= class { onload: unknown; onerror: unknown; set src(_: string) { /* no network in tests */ } };
    const wpDoc = { days: [{}], grid: { ncol: 55, nrow: 40, lonMin: 95, latMin: -10, step: 1, scale: 0.1, unknown: 255 }, globalGrid: { ncol: 144, nrow: 72, lonMin: -180, latMin: -90, step: 2.5, scale: 0.1, unknown: 255 } };
    set({ frameScan: { state: 'ready', doc: wpDoc as never, bytes: new Uint8Array(55 * 40).fill(50), globalBytes: new Uint8Array(144 * 72).fill(30), message: '' } });
    setRoi({ lonMin: 116, lonMax: 127.5, latMin: 4.5, latMax: 21.5 });
    expect(roiActive()).toBe(true);
    const fine = visualScanGrid(0)!;
    expect(fine.step).toBe(1);
    expect(fine.area).toMatch(/your ROI/);
    expect(roiLabel()).toBe('116°E–127.5°E, 4.5°N–21.5°N');
    setRoi({ lonMin: -60, lonMax: -30, latMin: -20, latMax: 10 });
    expect(visualScanGrid(0)!.step).toBe(2.5);
    setRoi(null);
    expect(roiActive()).toBe(false);
    expect(visualScanGrid(0)!.area).toBe('whole frame');
    setRoi('west-pacific');
    expect(get().visual.roi).toBe(true);
    expect(get().visual.crop).toBeNull();
    setRoi(null);
  });

  it('project files keep the ROI, and older files without it still open', () => {
    const base = {
      format: 'geoorchestra-project', version: 1, savedAt: '2026-11-15T00:00:00Z', dataset: null, selection: null, pins: [], range: null, cursor: null,
      speed: 1, loop: false, sound: {}, view: 'graph', tab: 'visual', a11y: {},
      visual: { imported: true, linked: true, regionId: 'philippines', day: 3, mode: 'timelapse', roi: false, speed: 10 },
    };
    expect(ProjectFileSchema.safeParse(base).success).toBe(true);
    const withRoi = { ...base, visual: { ...base.visual, crop: { lonMin: 116, lonMax: 127.5, latMin: 4.5, latMax: 21.5 }, isolate: false } };
    const p = ProjectFileSchema.safeParse(withRoi);
    expect(p.success && p.data.visual.crop).toEqual({ lonMin: 116, lonMax: 127.5, latMin: 4.5, latMax: 21.5 });
  });
});
