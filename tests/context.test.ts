import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Observation } from '../src/contracts';
import { categoryFromRatio, categoryFromZ, explainStep, monthlyContexts, monthlyNormals, NORMAL, seasonalContexts } from '../src/sound/context';
import { generateEvents, referenceRangeFor, scaleNotes, valueToNoteIndex } from '../src/sound/mapping';

/** One observation per (year, month) value. */
function series(rows: [string, number | null][], type: 'area' | 'cell' = 'area'): Observation[] {
  return rows.map(([t, v]) => ({
    id: `ds|area:x|${t}`, t, start: '', end: '', value: v, unit: 'mm/hr', quality: v == null ? 'missing' : 'valid',
    selectionId: 'area:x', selectionType: type, aggregation: 'test',
  }));
}
/** Julys 2001..2010 with the given values. */
const julys = (vals: (number | null)[]) => series(vals.map((v, i) => [`${2001 + i}-07`, v] as [string, number | null]));
const opts = { scale: 'C pentatonic', pitchLow: 48, pitchHigh: 84, spatialPhrases: false, datasetId: 'ds', selectionId: 'area:x', stepLabel: (t: string) => t };

describe('normals (2001–2022 same-month mean)', () => {
  it('uses only valid values inside the baseline years', () => {
    const obs = series([['2000-07', 9], ['2001-07', 0.2], ['2002-07', 0.4], ['2003-07', null], ['2004-07', 0.3], ['2005-07', 0.3], ['2006-07', 0.3], ['2023-07', 9]]);
    const n = monthlyNormals(obs)[6]!;
    expect(n.n).toBe(5);
    expect(n.mean).toBeCloseTo(0.3, 9);
    expect(NORMAL.baseline).toEqual([2001, 2022]);
  });
  it('has no normal for a month with fewer than the minimum years', () => {
    const obs = series([['2021-07', 0.3], ['2022-07', 0.3], ['2023-07', 0.3], ['2024-07', 0.3]]);
    expect(monthlyNormals(obs)[6]).toBeNull();
    const ctx = monthlyContexts(obs);
    expect(ctx[0].normal).toBeNull();
    expect(ctx[0].category).toBeNull();
  });
  it('category thresholds at ±0.5 and ±1.5 SD', () => {
    expect(categoryFromZ(0)).toBe('near-normal');
    expect(categoryFromZ(0.49)).toBe('near-normal');
    expect(categoryFromZ(0.5)).toBe('wetter');
    expect(categoryFromZ(1.5)).toBe('much-wetter');
    expect(categoryFromZ(-0.5)).toBe('drier');
    expect(categoryFromZ(-1.5)).toBe('much-drier');
    expect(categoryFromRatio(1)).toBe('near-normal');
    expect(categoryFromRatio(1.4)).toBe('much-wetter');
    expect(categoryFromRatio(0.8)).toBe('drier');
  });
  it('a missing month keeps the normal but gets no anomaly or category; ranks are within the same calendar month', () => {
    const obs = julys([0.3, 0.2, 0.4, 0.35, 0.25, null, 0.5]);
    const ctx = monthlyContexts(obs);
    expect(ctx[5].normal).not.toBeNull();
    expect(ctx[5].anomaly).toBeNull();
    expect(ctx[5].category).toBeNull();
    expect(ctx[6].rank).toEqual({ position: 1, of: 6, wettest: true });
    expect(ctx[1].rank!.position).toBe(6);
    expect(ctx[6].periodLabel).toBe('July');
  });
});

describe('rain-v2 context events', () => {
  const obs = julys([0.3, 0.2, 0.4, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.9]);
  const ctx = monthlyContexts(obs);
  const ev = generateEvents(obs, opts, [], ctx);
  it('the hum is the same pitch mapping applied to the normal', () => {
    const notes = scaleNotes('C pentatonic', 48, 84);
    const ref = ev.find((e) => e.kind === 'reference' && e.stepIndex === 0)!;
    expect(ref.midi).toBe(notes[valueToNoteIndex(ctx[0].normal, notes.length, referenceRangeFor('area'))!]);
    expect(ref.original.value).toBeCloseTo(ctx[0].normal!, 4);
  });
  it('a missing month still plays the hum, never a melody note', () => {
    const o2 = julys([0.3, 0.2, 0.4, 0.3, 0.3, null]);
    const e2 = generateEvents(o2, opts, [], monthlyContexts(o2)).filter((e) => e.stepIndex === 5);
    expect(e2.some((e) => e.kind === 'reference')).toBe(true);
    expect(e2.some((e) => e.kind === 'melody' || e.kind === 'chord' || e.kind === 'texture')).toBe(false);
    expect(e2.find((e) => e.marker === 'missing')?.original.value).toBeNull();
  });
  it('wetter → major chord, drier → minor chord, unusual → bell, much wetter → thunder', () => {
    const wet = ev.filter((e) => e.stepIndex === 9);
    const z = ctx[9].z!;
    expect(z).toBeGreaterThanOrEqual(2);
    const chord = wet.find((e) => e.kind === 'chord')!;
    expect(chord.chord!.map((m) => m - chord.chord![0])).toEqual([0, 4, 7, 14]);
    expect(wet.some((e) => e.marker === 'extreme')).toBe(true);
    expect(wet.find((e) => e.kind === 'texture')!.cue).toBe('thunder');
    const dry = ev.filter((e) => e.stepIndex === 1);
    expect(['drier', 'much-drier']).toContain(dry.find((e) => e.kind === 'melody')!.context!.category);
    expect(dry.find((e) => e.kind === 'chord')!.chord!.slice(0, 3).map((m, _, a) => m - a[0])).toEqual([0, 3, 7]);
    expect(ev.filter((e) => e.marker === 'extreme').every((e) => Math.abs(e.context!.z!) >= NORMAL.zExtreme)).toBe(true);
  });
  it('the melody is above the hum when wetter and below when drier', () => {
    const m9 = ev.find((e) => e.stepIndex === 9 && e.kind === 'melody')!, r9 = ev.find((e) => e.stepIndex === 9 && e.kind === 'reference')!;
    expect(m9.midi!).toBeGreaterThan(r9.midi!);
    const m1 = ev.find((e) => e.stepIndex === 1 && e.kind === 'melody')!, r1 = ev.find((e) => e.stepIndex === 1 && e.kind === 'reference')!;
    expect(m1.midi!).toBeLessThanOrEqual(r1.midi!);
  });
  it('layers can be switched off and output is deterministic', () => {
    const off = generateEvents(obs, { ...opts, reference: false, harmony: false, cues: false }, [], ctx);
    expect(off.some((e) => e.kind === 'reference' || e.kind === 'chord' || e.marker === 'extreme' || e.cue)).toBe(false);
    expect(JSON.stringify(generateEvents(obs, opts, [], ctx))).toBe(JSON.stringify(ev));
  });
  it('without contexts the events are the amount only', () => {
    const plain = generateEvents(obs, opts);
    expect(plain.some((e) => e.kind === 'reference' || e.kind === 'chord' || e.context)).toBe(false);
  });
});

describe('captions', () => {
  const obs = julys([0.3, 0.2, 0.4, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.9, null, 0]);
  const ctx = monthlyContexts(obs);
  const ev = generateEvents(obs, opts, [], ctx);
  const step = (i: number) => ev.filter((e) => e.stepIndex === i);
  it('describes how the month compares and what is heard', () => {
    const t = explainStep(step(9), 'musical', 'July 2010');
    expect(t).toMatch(/much wetter than a normal July/);
    expect(t).toMatch(/wettest July of 11/);
    expect(t).toMatch(/above the hum/);
    expect(t).toMatch(/bell/);
    expect(explainStep(step(9), 'geophony', 'July 2010')).toMatch(/thunder/);
  });
  it('missing and zero are described honestly', () => {
    expect(explainStep(step(10), 'musical', 'July 2011')).toMatch(/missing — no note is played and no value is invented/);
    expect(explainStep(step(10), 'musical', 'July 2011')).toMatch(/hum still plays the normal/);
    expect(explainStep(step(11), 'musical', 'July 2012')).toMatch(/zero rainfall measured/);
  });
  it('says when there is no normal', () => {
    const short = series([['2023-07', 0.3]]);
    const e = generateEvents(short, opts, [], monthlyContexts(short));
    expect(explainStep(e, 'musical', 'July 2023')).toMatch(/no normal available/);
  });
  it('seasonal steps compare with the yearly average', () => {
    const vals = [0.1, 0.2, 0.3, 0.4, 0.5];
    const sc = seasonalContexts(vals);
    expect(sc[0].normal).toBeCloseTo(0.3, 9);
    expect(sc[4].category).toBe('much-wetter');
    const o = series(vals.map((v, i) => [`D00${i + 1}`, v] as [string, number]));
    const e = generateEvents(o, opts, [], sc).filter((x) => x.stepIndex === 0);
    expect(explainStep(e, 'musical', 'Jan 01')).toMatch(/much drier than the yearly average/);
  });
});

describe('the shipped Philippine record (IMERG V07B, 295 months)', () => {
  const doc = JSON.parse(readFileSync('public/data/imerg-ph/regions.json', 'utf8'));
  const ph = doc.regions.find((r: { id: string }) => r.id === 'philippines');
  const obs = series(ph.series.map((p: { t: string; value: number | null }) => [p.t, p.value]));
  const ctx = monthlyContexts(obs);
  it('every month has a normal and a category', () => {
    expect(ctx.every((c) => c.normal != null && c.category != null)).toBe(true);
  });
  it('spreads over all five categories (not one repeated sound)', () => {
    const count: Record<string, number> = {};
    ctx.forEach((c) => { count[c.category!] = (count[c.category!] ?? 0) + 1; });
    expect(count).toEqual({ 'much-drier': 12, drier: 93, 'near-normal': 100, wetter: 65, 'much-wetter': 25 });
    expect(ctx.filter((c) => Math.abs(c.z!) >= 2)).toHaveLength(14);
  });
  it('area-mean melody now uses most of the pitch range', () => {
    const ev = generateEvents(obs, opts, [], ctx).filter((e) => e.kind === 'melody');
    const distinct = new Set(ev.map((e) => e.midi));
    expect(distinct.size).toBeGreaterThanOrEqual(10);
  });
});
