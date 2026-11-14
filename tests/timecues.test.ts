import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('tone', () => ({}));
vi.mock('../src/sound/engine', () => ({
  engine: { start: async () => true, playStep: () => {}, silence: () => {}, setInstrument: () => {}, setMaster: () => {}, setLevels: () => {}, audition: async () => {}, auditionCue: async () => {} },
  INSTRUMENTS: [],
}));

import { ProjectFileSchema } from '../src/contracts';
import { explainStep } from '../src/sound/context';
import { boundariesAt, cueSpacingSeconds, PRESET_TIME_CUES, timeCueEvents, TIME_CUES, type TimeCueSettings } from '../src/sound/timeCues';
import { effectiveTimeCues, removeCheckpoint, setUiMode, toggleCheckpoint } from '../src/state/actions';
import { get, set } from '../src/state/store';

const months: string[] = [];
for (let y = 2000; y <= 2003; y++) for (let m = 1; m <= 12; m++) months.push(`${y}-${String(m).padStart(2, '0')}`);
const keys = months.slice(5); // start at 2000-06, like the IMERG record
const cfg = (p: Partial<TimeCueSettings> = {}): TimeCueSettings => ({ ...PRESET_TIME_CUES.monthly, ...p });
const cueKeys = (ev: ReturnType<typeof timeCueEvents>) => ev.flatMap((s, i) => (s.length ? [keys[i]] : []));

describe('time cues on the monthly timeline', () => {
  it('Preset default marks every January, at the start of the step', () => {
    const ev = timeCueEvents(keys, keys, 'monthly', PRESET_TIME_CUES.monthly);
    expect(cueKeys(ev)).toEqual(['2001-01', '2002-01', '2003-01']);
    expect(ev.flat().every((e) => e.offset === 0 && e.marker === 'time' && e.timeCue!.sound === 'woodblock' && e.mappingVersion === TIME_CUES.version)).toBe(true);
  });
  it('quarters, every step and every N', () => {
    expect(cueKeys(timeCueEvents(keys, keys, 'monthly', cfg({ unit: 'quarter' }))).slice(0, 4)).toEqual(['2000-07', '2000-10', '2001-01', '2001-04']);
    expect(timeCueEvents(keys, keys, 'monthly', cfg({ unit: 'step' })).flat()).toHaveLength(keys.length);
    expect(cueKeys(timeCueEvents(keys, keys, 'monthly', cfg({ unit: 'year', everyN: 2 })))).toEqual(['2001-01', '2003-01']);
    expect(timeCueEvents(keys, keys, 'monthly', cfg({ unit: 'off', checkpoints: false })).flat()).toHaveLength(0);
  });
  it('louder for larger units: a January is accented when marking quarters', () => {
    const ev = timeCueEvents(keys, keys, 'monthly', cfg({ unit: 'quarter', accentLarger: true })).flat();
    expect(ev.find((e) => e.original.t === '2001-01')!.timeCue!.accent).toBe('medium');
    expect(ev.find((e) => e.original.t === '2001-04')!.timeCue!.accent).toBe('normal');
  });
  it('a checkpoint replaces the ordinary cue on its step, is accented, and unknown keys are ignored', () => {
    const ev = timeCueEvents(keys, keys, 'monthly', PRESET_TIME_CUES.monthly, [{ key: '2002-01', label: 'my mark' }, { key: '1999-01', label: 'outside' }, { key: '2001-06', label: 'mid' }]);
    const at = (k: string) => ev[keys.indexOf(k)];
    expect(at('2002-01')).toHaveLength(1);
    expect(at('2002-01')[0]).toMatchObject({ marker: 'checkpoint', timeCue: { accent: 'strong', label: 'my mark', sound: 'woodblock' } });
    expect(at('2001-06')[0].marker).toBe('checkpoint');
    expect(ev.flat().filter((e) => e.marker === 'checkpoint')).toHaveLength(2);
    const off = timeCueEvents(keys, keys, 'monthly', cfg({ checkpoints: false }), [{ key: '2001-06', label: 'mid' }]);
    expect(off[keys.indexOf('2001-06')]).toHaveLength(0);
  });
  it('is independent of the measurements and deterministic', () => {
    // the function never receives values, so a missing month cannot move a cue
    const a = timeCueEvents(keys, keys, 'monthly', PRESET_TIME_CUES.monthly);
    expect(JSON.stringify(timeCueEvents(keys, keys, 'monthly', PRESET_TIME_CUES.monthly))).toBe(JSON.stringify(a));
  });
});

describe('time cues on the seasonal timeline (SVS 5478, 366 days)', () => {
  const manifest = JSON.parse(readFileSync('public/data/svs5478/manifest.json', 'utf8'));
  const labels: string[] = manifest.frames.map((f: { label: string }) => f.label);
  const dkeys = labels.map((_, i) => `D${String(i + 1).padStart(3, '0')}`);
  it('Preset default marks the 1st of every month: 12 cues, including Mar 01 after Feb 29', () => {
    const ev = timeCueEvents(dkeys, labels, 'seasonal', PRESET_TIME_CUES.seasonal).flat();
    expect(ev.map((e) => e.original.label)).toEqual(['Jan 01', 'Feb 01', 'Mar 01', 'Apr 01', 'May 01', 'Jun 01', 'Jul 01', 'Aug 01', 'Sep 01', 'Oct 01', 'Nov 01', 'Dec 01']);
    expect(labels).toContain('Feb 29');
  });
  it('weeks every 7 days, quarters on Jan/Apr/Jul/Oct 01, days every step', () => {
    const wk = timeCueEvents(dkeys, labels, 'seasonal', { ...PRESET_TIME_CUES.seasonal, unit: 'week' }).flat();
    expect(wk).toHaveLength(Math.ceil(366 / 7));
    expect(wk[1].stepIndex - wk[0].stepIndex).toBe(7);
    const q = timeCueEvents(dkeys, labels, 'seasonal', { ...PRESET_TIME_CUES.seasonal, unit: 'quarter' }).flat();
    expect(q.map((e) => e.original.label)).toEqual(['Jan 01', 'Apr 01', 'Jul 01', 'Oct 01']);
    expect(boundariesAt(0, 'D001', 'Jan 01', 'seasonal').has('year')).toBe(true);
  });
  it('spacing hint: daily cues at 10 days/s are 0.1 s apart', () => {
    expect(cueSpacingSeconds('seasonal', 'step', 1, 10)).toBeCloseTo(0.1, 9);
    expect(cueSpacingSeconds('monthly', 'year', 1, 1)).toBe(12);
    expect(cueSpacingSeconds('monthly', 'off', 1, 1)).toBeNull();
  });
});

describe('captions and Preset uniformity', () => {
  it('the caption names the checkpoint or the new period', () => {
    const ev = timeCueEvents(keys, keys, 'monthly', PRESET_TIME_CUES.monthly, [{ key: '2002-01', label: 'El Niño start' }]);
    expect(explainStep(ev[keys.indexOf('2002-01')], 'musical', 'Jan 2002')).toMatch(/^Checkpoint “El Niño start” · /);
    expect(explainStep(ev[keys.indexOf('2001-01')], 'geophony', 'Jan 2001')).toMatch(/^New year · /);
  });
  it('Preset mode always uses the fixed cue; Advanced uses the workspace settings', () => {
    set({ timeCues: { ...get().timeCues, numerical: { ...get().timeCues.numerical, unit: 'quarter', sound: 'drum' } } });
    setUiMode('preset');
    expect(effectiveTimeCues('numerical')).toEqual(PRESET_TIME_CUES.monthly);
    setUiMode('advanced');
    expect(effectiveTimeCues('numerical')).toMatchObject({ unit: 'quarter', sound: 'drum' });
    setUiMode('preset');
  });
});

describe('checkpoint actions', () => {
  it('toggle adds then removes a checkpoint at the cursor without touching data, selection or range', () => {
    const ds = { id: 'x', kind: 'nasa', title: 'x', months: keys, regions: [], samples: [], manifest: {} } as never;
    set({ tab: 'numerical', dataset: ds, cursor: 7, range: [0, keys.length - 1], checkpoints: { numerical: [], visual: [] } });
    const before = { dataset: get().dataset, cursor: get().cursor, range: get().range, selection: get().selection };
    toggleCheckpoint();
    expect(get().checkpoints.numerical).toEqual([{ key: keys[7], label: 'Jan 2001' }]);
    expect({ dataset: get().dataset, cursor: get().cursor, range: get().range, selection: get().selection }).toEqual(before);
    toggleCheckpoint();
    expect(get().checkpoints.numerical).toEqual([]);
    toggleCheckpoint('mine');
    removeCheckpoint(keys[7]);
    expect(get().checkpoints.numerical).toEqual([]);
  });
  it('project files with and without checkpoints and cue settings parse', () => {
    const base = {
      format: 'geoorchestra-project', version: 1, savedAt: '2026-11-15T00:00:00Z', dataset: null, selection: null, pins: [], range: null, cursor: null,
      speed: 1, loop: false, sound: {}, view: 'table', tab: 'numerical',
      visual: { imported: false, linked: false, regionId: 'philippines', day: 0, mode: 'timelapse', roi: false, speed: 10 }, a11y: {},
    };
    expect(ProjectFileSchema.safeParse(base).success).toBe(true);
    const full = { ...base, checkpoints: { numerical: [{ key: '2010-07', label: 'test' }], visual: [] }, timeCues: { numerical: PRESET_TIME_CUES.monthly, visual: PRESET_TIME_CUES.seasonal } };
    expect(ProjectFileSchema.safeParse(full).success).toBe(true);
    expect(ProjectFileSchema.safeParse({ ...full, timeCues: { ...full.timeCues, numerical: { ...PRESET_TIME_CUES.monthly, sound: 'trumpet' } } }).success).toBe(false);
  });
});
