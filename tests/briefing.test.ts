import { describe, expect, it, vi } from 'vitest';

vi.mock('tone', () => ({}));
vi.mock('../src/sound/engine', () => ({
  engine: { start: async () => true, playStep: () => {}, silence: () => {}, setInstrument: () => {}, setMaster: () => {}, setLevels: () => {}, audition: async () => {}, auditionCue: async () => {} },
  INSTRUMENTS: [],
}));

import { briefingScript, briefingSignature, needsBriefing, tokenize, wordAt, wordMs, type BriefingInput } from '../src/a11y/briefing';
import { briefingDue, currentBriefing, setUiMode, togglePlay } from '../src/state/actions';
import { DEFAULT_SOUND, get, set } from '../src/state/store';

const base: BriefingInput = { workspace: 'numerical', mode: 'musical', reference: true, harmony: true, cues: true, muted: {} };
const ids = (o: Partial<BriefingInput>) => briefingScript({ ...base, ...o }).map((s) => s.id);

describe('briefing script', () => {
  it('describes every sound of "Compare with normal" with an example, in order', () => {
    expect(ids({})).toEqual(['intro', 'amount-melody', 'normal', 'chord', 'bell', 'missing', 'time', 'close']);
    const s = briefingScript(base);
    expect(s.find((x) => x.id === 'amount-melody')!.example).toEqual({ kind: 'legend', items: ['low', 'high'] });
    expect(s.find((x) => x.id === 'amount-melody')!.text).toMatch(/higher note means more rain/i);
  });

  it('follows the sound mode: Geophony has rain, thunder and wind, and no piano or chord', () => {
    const g = ids({ mode: 'geophony' });
    expect(g).toContain('amount-texture');
    expect(g).toContain('thunder-wind');
    expect(g).not.toContain('amount-melody');
    expect(g).not.toContain('chord');
  });

  it('never describes a sound that is off or muted', () => {
    expect(ids({ reference: false, harmony: false, cues: false })).toEqual(['intro', 'amount-melody', 'missing', 'time', 'close']);
    expect(ids({ muted: { melody: true, time: true, context: true } })).toEqual(['intro', 'missing', 'close']);
  });

  it('always says missing is not zero (numerical) and that sounds are not recordings', () => {
    for (const mode of ['musical', 'geophony'] as const) {
      const s = briefingScript({ ...base, mode });
      expect(s.find((x) => x.id === 'missing')!.text).toMatch(/never treated as zero/);
      expect(s.at(-1)!.text).toMatch(/not recordings/);
    }
  });

  it('visual feed: glide, sweep, and the reconstructed-average honesty line', () => {
    const v = briefingScript({ ...base, workspace: 'visual', imageEnabled: true, featureVoice: true, frameData: true });
    expect(v.map((s) => s.id)).toEqual(['intro', 'amount-melody', 'normal', 'chord', 'bell', 'time', 'glide', 'sweep', 'close']);
    expect(v.find((s) => s.id === 'glide')!.example).toEqual({ kind: 'glide' });
    expect(v.at(-1)!.text).toMatch(/reconstructed average/);
    expect(v.find((s) => s.id === 'time')!.text).toMatch(/new month/);
    // no frame data yet: the glide is explained but has no example
    expect(briefingScript({ ...base, workspace: 'visual', imageEnabled: true, featureVoice: true }).find((s) => s.id === 'glide')!.example).toBeUndefined();
  });
});

describe('who gets briefed', () => {
  const sig = briefingSignature('numerical', 'musical', briefingScript(base));
  it('Preset: always, until this briefing was heard', () => {
    expect(needsBriefing({ uiMode: 'preset', briefAdvanced: false, heard: '', signature: sig })).toBe(true);
    expect(needsBriefing({ uiMode: 'preset', briefAdvanced: false, heard: sig, signature: sig })).toBe(false);
  });
  it('Advanced: only when briefings are on', () => {
    expect(needsBriefing({ uiMode: 'advanced', briefAdvanced: true, heard: '', signature: sig })).toBe(true);
    expect(needsBriefing({ uiMode: 'advanced', briefAdvanced: false, heard: '', signature: sig })).toBe(false);
  });
  it('a different set of sounds (another preset or mode) means a new briefing', () => {
    const geo = briefingSignature('numerical', 'geophony', briefingScript({ ...base, mode: 'geophony' }));
    expect(geo).not.toBe(sig);
    expect(needsBriefing({ uiMode: 'preset', briefAdvanced: true, heard: sig, signature: geo })).toBe(true);
  });
});

describe('word highlighting', () => {
  it('maps speech boundary offsets to words', () => {
    const text = 'A higher note means more rain.';
    const t = tokenize(text);
    expect(t.map((w) => w.word)).toEqual(['A', 'higher', 'note', 'means', 'more', 'rain.']);
    expect(wordAt(t, 0)).toBe(0);
    expect(wordAt(t, text.indexOf('note'))).toBe(2);
    expect(wordAt(t, text.indexOf('rain'))).toBe(5);
    expect(wordAt(t, text.indexOf('means') - 1)).toBe(2); // the space after "note"
  });
  it('gives longer words and sentence ends more time when there is no voice', () => {
    expect(wordMs('precipitation')).toBeGreaterThan(wordMs('rain'));
    expect(wordMs('rain.')).toBeGreaterThan(wordMs('rain'));
  });
});

describe('playback waits for the briefing', () => {
  it('Play in Preset opens the briefing instead of starting, and is ignored while it runs', async () => {
    set({ tab: 'numerical', uiMode: 'preset', sound: DEFAULT_SOUND, briefed: { numerical: '', visual: '' }, briefing: null });
    expect(briefingDue()).toBe(true);
    await togglePlay();
    expect(get().briefing?.script.map((s) => s.id)).toEqual(currentBriefing().script.map((s) => s.id));
    expect(get().playback).toBe('stopped');
    await togglePlay();
    expect(get().playback).toBe('stopped');
  });
  it('Advanced with briefings off plays straight away (no briefing due)', () => {
    set({ briefing: null, briefed: { numerical: '', visual: '' }, a11y: { ...get().a11y, briefAdvanced: false } });
    setUiMode('advanced');
    expect(briefingDue()).toBe(false);
  });
});
