import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('tone', () => ({ now: () => 100 }));
import { engine } from '../src/sound/engine';

afterEach(() => vi.restoreAllMocks());

describe('briefing-only audio timing', () => {
  it('retains the Audio legend duration and applies shorter duration only when requested', async () => {
    vi.spyOn(engine, 'start').mockResolvedValue(true);
    vi.spyOn(engine, 'silence').mockImplementation(() => {});
    const step = vi.spyOn(engine, 'playStep').mockImplementation(() => {});
    await engine.audition([], 'musical');
    expect(step).toHaveBeenLastCalledWith([], 100.05, 1.2, 'musical');
    await engine.audition([], 'musical', { seconds: 0.35, signal: new AbortController().signal });
    expect(step).toHaveBeenLastCalledWith([], 100.01, 0.35, 'musical');
  });

  it.each(['legend', 'cue'] as const)('%s: aborting during audio unlock prevents later scheduling', async (kind) => {
    let unlock!: (ok: boolean) => void;
    vi.spyOn(engine, 'start').mockImplementation(() => new Promise(resolve => { unlock = resolve; }));
    const step = vi.spyOn(engine, 'playStep');
    const cue = vi.spyOn(engine as any, 'playCue');
    const abort = new AbortController();
    const pending = kind === 'legend'
      ? engine.audition([], 'musical', { seconds: 0.35, signal: abort.signal })
      : engine.auditionCue({ unit: 'year', sound: 'wood', accent: 'normal', label: 'year' } as any, abort.signal);
    abort.abort(); unlock(true);
    await pending;
    expect(step).not.toHaveBeenCalled();
    expect(cue).not.toHaveBeenCalled();
  });
});
