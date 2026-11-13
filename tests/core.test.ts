import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('tone', () => ({}));
vi.mock('../src/sound/engine', () => ({ engine: { start: async () => true, playStep: () => {}, silence: () => {} } }));

import type { Observation, SoundEvent } from '../src/contracts';
import { areaMean, successiveChange } from '../src/data/aggregate';
import { parseProcessedFile } from '../src/data/loaders';
import { PlaybackController, type TransportLike } from '../src/playback/controller';
import { generateEvents, geophonyParams, lonToPan, MAPPING, normalize } from '../src/sound/mapping';

const obs = (vals: (number | null)[], start = 2024): Observation[] => vals.map((v, i) => {
  const t = `${start}-${String(i + 1).padStart(2, '0')}`;
  return { id: `ds|area:x|${t}`, t, start: '', end: '', value: v, unit: 'mm/hr', quality: v == null ? 'missing' : 'valid', selectionId: 'area:x', selectionType: 'area', aggregation: 'test' };
});
const opts = { scale: 'C pentatonic', pitchLow: 48, pitchHigh: 84, spatialPhrases: false, datasetId: 'ds', selectionId: 'area:x', stepLabel: (t: string) => t };

describe('missing versus zero', () => {
  it('missing produces no note and a missing marker; zero produces a real note plus a zero marker', () => {
    const ev = generateEvents(obs([0.4, null, 0]), opts);
    const step1 = ev.filter((e) => e.stepIndex === 1);
    expect(step1.some((e) => e.kind === 'melody')).toBe(false);
    expect(step1.some((e) => e.kind === 'texture')).toBe(false);
    expect(step1.find((e) => e.marker === 'missing')?.original.value).toBeNull();
    const step2 = ev.filter((e) => e.stepIndex === 2);
    expect(step2.find((e) => e.kind === 'melody')?.midi).toBe(48);
    expect(step2.some((e) => e.kind === 'marker' && e.marker === 'zero')).toBe(true);
  });
  it('normalize never turns missing into zero', () => {
    expect(normalize(null)).toBeNull();
    expect(normalize(0)).toEqual({ n: 0, clipped: false });
  });
  it('change is not computed across a gap', () => {
    expect(successiveChange([0.2, null, 0.5, 0.6])).toEqual([null, null, null, expect.closeTo(0.1, 6)]);
    const ev = generateEvents(obs([0.1, null, 0.9]), opts);
    expect(ev.filter((e) => e.stepIndex === 2 && e.kind === 'melody')).toHaveLength(1); // no density from the jump over the gap
  });
});

describe('aggregation and coverage', () => {
  it('cos-latitude weighting and exclusion of missing cells', () => {
    const r = areaMean([1, 3, null], [0, 60, 30], [true, true, true], 0.5);
    // weights cos0=1, cos60=0.5 → (1*1 + 3*0.5)/1.5
    expect(r.value).toBeCloseTo(2.5 / 1.5, 9);
    expect(r.coverage).toBeCloseTo(2 / 3, 9);
    expect(r.quality).toBe('partial');
  });
  it('reports missing below the coverage threshold rather than a biased mean', () => {
    const r = areaMean([1, null, null, null], [0, 0, 0, 0], [true, true, true, true], 0.5);
    expect(r.value).toBeNull();
    expect(r.quality).toBe('missing');
  });
  it('ignores cells outside the mask', () => {
    expect(areaMean([5, 1], [0, 0], [false, true]).value).toBe(1);
  });
});

describe('fixed, deterministic mapping', () => {
  it('same value maps to the same note regardless of the surrounding series', () => {
    const a = generateEvents(obs([0.4, 0.1]), opts).find((e) => e.stepIndex === 0 && e.kind === 'melody')!;
    const b = generateEvents(obs([0.4, 1.4]), opts).find((e) => e.stepIndex === 0 && e.kind === 'melody')!;
    expect(a.midi).toBe(b.midi);
  });
  it('is deterministic across runs', () => {
    const v = [0.2, 0.5, null, 0.0, 2.2, 0.31];
    expect(JSON.stringify(generateEvents(obs(v), opts))).toBe(JSON.stringify(generateEvents(obs(v), opts)));
  });
  it('clips above the reference range and preserves the raw value', () => {
    const e = generateEvents(obs([2.2]), opts).find((x) => x.kind === 'melody')!;
    expect(e.marker).toBe('clipped');
    expect(e.original.value).toBe(2.2);
    expect(e.midi).toBe(84);
    expect(MAPPING.referenceRange).toEqual([0, 1.5]);
  });
  it('instrument-independent: events carry no instrument and keep source ids', () => {
    const e = generateEvents(obs([0.3]), opts)[0];
    expect(e.sourceObservationIds).toEqual(['ds|area:x|2024-01']);
    expect(e.mappingVersion).toBe('rain-v1');
  });
  it('geophony increases with rainfall and is null for missing', () => {
    expect(geophonyParams(null, null)).toBeNull();
    expect(geophonyParams(1.0, 0)!.dropsPerSecond).toBeGreaterThan(geophonyParams(0.1, 0)!.dropsPerSecond);
  });
  it('longitude pans west to east', () => {
    expect(lonToPan(116)).toBe(-1);
    expect(lonToPan(127.5)).toBe(1);
  });
});

describe('frame-to-date alignment (SVS 5478)', () => {
  const align = JSON.parse(readFileSync('public/data/svs5478/alignment.json', 'utf8'));
  const manifest = JSON.parse(readFileSync('public/data/svs5478/manifest.json', 'utf8'));
  const clim = JSON.parse(readFileSync('public/data/svs5478/climatology-ph.json', 'utf8'));
  it('maps 1000 source frames to 366 ordered days including Feb 29', () => {
    expect(align.overlayFrames).toBe(1000);
    expect(align.runs).toHaveLength(366);
    expect(align.runs[0]).toMatchObject({ label: 'Jan 01', first: 1 });
    expect(align.runs[1]).toMatchObject({ label: 'Jan 02', first: 3 });
    expect(align.runs[59].label).toBe('Feb 29');
    expect(align.runs[365]).toMatchObject({ label: 'Dec 31', last: 1000 });
    const covered = align.runs.reduce((n: number, r: { first: number; last: number }) => n + r.last - r.first + 1, 0);
    expect(covered).toBe(1000);
  });
  it('the frame index is not a calendar day (a fixed rate would drift)', () => {
    const naive = (frame: number) => Math.floor(((frame - 1) * 366) / 1000);
    const mismatches = align.runs.filter((r: { first: number }, i: number) => naive(r.first) !== i).length;
    expect(mismatches).toBeGreaterThan(0);
  });
  it('representative frames sit inside their own day run, and measurements match the day count', () => {
    manifest.frames.forEach((f: { day: number; sourceFrame: number; runFrames: [number, number] }, i: number) => {
      expect(f.day).toBe(i + 1);
      expect(f.sourceFrame).toBeGreaterThanOrEqual(f.runFrames[0]);
      expect(f.sourceFrame).toBeLessThanOrEqual(f.runFrames[1]);
    });
    for (const r of clim.regions) expect(r.daily).toHaveLength(manifest.frames.length);
    expect(clim.status).toBe('reconstructed');
  });
});

describe('processed JSON import validation', () => {
  it('rejects wrong units and negative values with readable errors', () => {
    const bad = { format: 'geoorchestra-processed', version: 1, datasetId: 'x', title: 'x', variable: 'precipitation', source: { provider: 'me' },
      records: [{ timestamp: '2024-01', latitude: 14.6, longitude: 121, value: -1, unit: 'mm/day' }] };
    const r = parseProcessedFile(JSON.stringify(bad), 'bad.json');
    expect(r.dataset).toBeUndefined();
    expect(r.errors.join(' ')).toMatch(/negative/);
    expect(r.errors.join(' ')).toMatch(/mm\/hr/);
  });
  it('keeps absent months as missing, not zero', () => {
    const good = { format: 'geoorchestra-processed', version: 1, datasetId: 'x', title: 'x', variable: 'precipitation', source: { provider: 'me' },
      records: [
        { timestamp: '2024-01', latitude: 14.6, longitude: 121, value: 0.3, unit: 'mm/hr' },
        { timestamp: '2024-03', latitude: 14.6, longitude: 121, value: 0, unit: 'mm/hr' },
      ] };
    const r = parseProcessedFile(JSON.stringify(good), 'good.json');
    expect(r.dataset!.months).toEqual(['2024-01', '2024-03']);
    const r2 = parseProcessedFile(JSON.stringify({ ...good, records: [...good.records, { timestamp: '2024-02', latitude: 10, longitude: 123, value: 0.1, unit: 'mm/hr' }] }), 'g.json');
    const p0 = r2.dataset!.points![0];
    expect(p0.series.map((s) => s.value)).toEqual([0.3, null, 0]);
    expect(r2.warnings.join(' ')).toMatch(/missing \(not zero\)/);
  });
});

describe('playback controller cancels obsolete events', () => {
  function harness() {
    const repeats = new Map<number, (t: number) => void>();
    let id = 0;
    let cancels = 0;
    const transport: TransportLike = {
      seconds: 0, start: () => {}, stop: () => {}, pause: () => {},
      cancel: () => { cancels++; },
      scheduleRepeat: (cb) => { repeats.set(++id, cb); return id; },
      clear: (i) => { repeats.delete(i); },
    };
    const played: { step: number; time: number }[] = [];
    const draws: (() => void)[] = [];
    const c = new PlaybackController({
      transport: () => transport,
      draw: (cb) => { draws.push(cb); },
      now: () => 0,
      afterPaint: (cb) => cb(),
      engine: { start: async () => true, silence: () => {}, playStep: (ev: SoundEvent[], time: number) => { played.push({ step: ev[0]?.stepIndex ?? -1, time }); } },
    });
    const events: SoundEvent[][] = Array.from({ length: 10 }, (_, i) => [{ stepIndex: i } as SoundEvent]);
    c.setAdapter({ id: 'monthly', keys: events.map((_, i) => String(i)), eventsByStep: events });
    return { c, repeats, played, draws, cancels: () => cancels };
  }

  it('seek replaces the scheduled repeat; the old callback can no longer play', async () => {
    const h = harness();
    await h.c.play();
    const oldCb = [...h.repeats.values()][0];
    oldCb(1); // step 0
    h.c.seek(7);
    expect(h.repeats.size).toBe(1);
    const newCb = [...h.repeats.values()][0];
    expect(newCb).not.toBe(oldCb);
    oldCb(2); // stale tick from before the seek
    newCb(3);
    expect(h.played.map((p) => p.step)).toEqual([0, 7]);
    expect(h.cancels()).toBeGreaterThan(0);
  });

  it('pause clears everything; no doubled sounds after repeated play/pause', async () => {
    const h = harness();
    for (let k = 0; k < 5; k++) { await h.c.play(); h.c.pause(); }
    await h.c.play();
    expect(h.repeats.size).toBe(1);
  });

  it('stale draw callbacks do not move the shared index after a seek', async () => {
    const h = harness();
    await h.c.play();
    [...h.repeats.values()][0](1);
    const staleDraw = h.draws.pop()!;
    h.c.seek(5);
    staleDraw();
    expect(h.c.index).toBe(5);
  });

  it('buffers instead of advancing into an unready media step', async () => {
    const h = harness();
    let ready = false;
    const events: SoundEvent[][] = Array.from({ length: 3 }, (_, i) => [{ stepIndex: i } as SoundEvent]);
    h.c.setAdapter({ id: 'seasonal', keys: ['a', 'b', 'c'], eventsByStep: events, isReady: () => ready, waitReady: async () => { ready = true; } });
    await h.c.play();
    [...h.repeats.values()][0](1);
    expect(h.played).toHaveLength(0);
  });

  it('loop wraps to range start; otherwise playback ends at the range end', async () => {
    const h = harness();
    h.c.setRange([2, 3]);
    h.c.setLoop(true);
    await h.c.play();
    const cb = [...h.repeats.values()][0];
    cb(1); cb(2); cb(3);
    expect(h.played.map((p) => p.step)).toEqual([2, 3, 2]);
  });
});
