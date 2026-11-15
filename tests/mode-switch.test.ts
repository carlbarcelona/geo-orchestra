import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('tone', () => ({}));
vi.mock('../src/sound/engine', () => ({
  engine: { start: async () => true, playStep: () => {}, silence: () => {}, setInstrument: () => {}, setMaster: () => {}, setLevels: () => {}, audition: async () => {}, auditionCue: async () => {} },
  INSTRUMENTS: [],
}));

import { areaSelection, type Dataset } from '../src/data/dataset';
import { numericalEvents, setUiMode } from '../src/state/actions';
import { get, set } from '../src/state/store';

function dataset(): Dataset {
  const months: string[] = [];
  for (let y = 2001; y <= 2006; y++) for (let m = 1; m <= 12; m++) months.push(`${y}-${String(m).padStart(2, '0')}`);
  const series = months.map((t, i) => ({ t, value: i % 9 === 4 ? null : 0.2 + 0.1 * Math.sin(i / 2), quality: i % 9 === 4 ? 'missing' as const : 'valid' as const }));
  const region = { id: 'philippines', name: 'Philippines', selectionType: 'area' as const, aggregation: 'test', bounds: [116, 4.5, 127.5, 21.5] as [number, number, number, number], cellCount: 1, includesOcean: false, minCoverage: 0.5, series };
  return { id: 'test', kind: 'nasa', title: 'test', manifest: {} as never, months, regions: [region], samples: [] };
}

describe('Preset ⇄ Advanced switch', () => {
  it('never changes data, position or the generated events', () => {
    const ds = dataset();
    set({ tab: 'numerical', uiMode: 'preset', dataset: ds, selection: areaSelection(ds.regions[0]), cursor: 13, range: [0, ds.months.length - 1] });
    const before = numericalEvents();
    const where = { cursor: get().cursor, range: get().range, selection: get().selection, playback: get().playback };
    setUiMode('advanced');
    expect(numericalEvents()).toEqual(before);
    expect({ cursor: get().cursor, range: get().range, selection: get().selection, playback: get().playback }).toEqual(where);
    setUiMode('preset');
    expect(numericalEvents()).toEqual(before);
  });

  it('reading the events does not write to the store (no update during render)', () => {
    const rev = get().eventsRev;
    const a = numericalEvents();
    const b = numericalEvents();
    expect(b).toBe(a);
    expect(get().eventsRev).toBe(rev);
  });

  it('bumps eventsRev when the events are regenerated', () => {
    const rev = get().eventsRev;
    setUiMode(get().uiMode === 'preset' ? 'advanced' : 'preset');
    expect(get().eventsRev).toBeGreaterThan(rev);
  });

  it('every component calls its hooks before any early return (hooks-order guard)', () => {
    // NasaDataPanel returned early in Preset before its useState calls, which crashed React on the switch to Advanced.
    const src = readFileSync('src/ui/visual/VisualWorkspace.tsx', 'utf8');
    const fn = src.slice(src.indexOf('function NasaDataPanel'), src.indexOf('function AdvancedNasaPanel'));
    expect(fn).not.toMatch(/use[A-Z]\w*\(/);
  });
});
