import { describe, expect, it, vi } from 'vitest';

vi.mock('tone', () => ({}));
vi.mock('../src/sound/engine', () => ({
  engine: { start: async () => true, playStep: () => {}, silence: () => {}, setInstrument: () => {}, setMaster: () => {}, setLevels: () => {}, audition: async () => {} },
  INSTRUMENTS: [],
}));

import { ProjectFileSchema } from '../src/contracts';
import { getPreset, LISTENING_PRESETS, matchesPreset } from '../src/sound/presets';
import { applyListeningPreset, legendEvents, setUiMode } from '../src/state/actions';
import { DEFAULT_SOUND, get, set } from '../src/state/store';

describe('Preset / Advanced', () => {
  it('starts in Preset mode for a first-time visitor', () => {
    expect(get().uiMode).toBe('preset');
  });
  it('switching mode never touches data, selection or sound', () => {
    const sel = { id: 'area:luzon', type: 'area' as const, label: 'Luzon', aggregation: 'x', regionId: 'luzon' };
    set({ selection: sel, cursor: 42, range: [3, 200] });
    const sound = get().sound;
    setUiMode('advanced');
    expect(get().uiMode).toBe('advanced');
    setUiMode('preset');
    expect(get().selection).toBe(sel);
    expect(get().cursor).toBe(42);
    expect(get().range).toEqual([3, 200]);
    expect(get().sound).toEqual(sound);
  });
  it('a listening preset changes sound settings only', () => {
    const before = { selection: get().selection, cursor: get().cursor, range: get().range, dataset: get().dataset };
    applyListeningPreset('rain-sounds');
    expect(get().sound.mode).toBe('geophony');
    expect(get().listening.numerical).toBe('rain-sounds');
    expect({ selection: get().selection, cursor: get().cursor, range: get().range, dataset: get().dataset }).toEqual(before);
    applyListeningPreset('compare-normal');
    expect(matchesPreset(getPreset('compare-normal')!, get().sound)).toBe(true);
  });
  it('editing a setting in Advanced makes the preset "custom"', () => {
    applyListeningPreset('compare-normal');
    set({ sound: { ...get().sound, harmony: false } });
    expect(matchesPreset(getPreset('compare-normal')!, get().sound)).toBe(false);
  });
  it('every preset belongs to a workspace and the defaults are the recommended ones', () => {
    expect(LISTENING_PRESETS.filter((p) => p.workspace === 'numerical').map((p) => p.id)).toContain('compare-normal');
    expect(LISTENING_PRESETS.filter((p) => p.workspace === 'visual').map((p) => p.id)).toContain('follow-monsoon');
    expect(matchesPreset(getPreset('compare-normal')!, DEFAULT_SOUND)).toBe(true);
  });
});

describe('project files', () => {
  const base = {
    format: 'geoorchestra-project', version: 1, savedAt: '2026-11-15T00:00:00Z', dataset: null, selection: null, pins: [], range: null, cursor: null,
    speed: 1, loop: false, sound: {}, view: 'table', tab: 'numerical',
    visual: { imported: false, linked: false, regionId: 'philippines', day: 0, mode: 'timelapse', roi: false, speed: 10 }, a11y: {},
  };
  it('old project files without uiMode still open', () => {
    expect(ProjectFileSchema.safeParse(base).success).toBe(true);
  });
  it('new project files keep the mode', () => {
    const r = ProjectFileSchema.safeParse({ ...base, uiMode: 'advanced' });
    expect(r.success && r.data.uiMode).toBe('advanced');
  });
});

describe('audio legend uses the playback rule', () => {
  it('each comparison example lands in its own category', () => {
    set({ sound: { ...DEFAULT_SOUND } });
    const cat = (k: Parameters<typeof legendEvents>[0]) => legendEvents(k).find((e) => e.kind === 'melody')?.context?.category;
    expect(cat('near-normal')).toBe('near-normal');
    expect(cat('wetter')).toBe('wetter');
    expect(cat('much-wetter')).toBe('much-wetter');
    expect(cat('drier')).toBe('drier');
    expect(cat('much-drier')).toBe('much-drier');
    expect(legendEvents('unusual').some((e) => e.marker === 'extreme')).toBe(true);
    expect(legendEvents('much-wetter').some((e) => e.marker === 'extreme')).toBe(false);
    expect(legendEvents('missing').some((e) => e.kind === 'melody')).toBe(false);
    expect(legendEvents('low').some((e) => e.kind === 'reference')).toBe(false);
  });
});
