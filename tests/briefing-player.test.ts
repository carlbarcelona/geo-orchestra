import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { briefingScript, type BriefSegment } from '../src/a11y/briefing';
import { BriefingPlayer } from '../src/a11y/briefingPlayer';
import { briefingDelay, briefingTiming, BRIEFING_LIMITS, exampleUnits } from '../src/a11y/briefingTiming';

const sample: BriefSegment[] = [{ id: 'rain', title: 'Rain', text: 'More rain.', example: { kind: 'legend', items: ['low', 'high'] } }];

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('briefing time limit', () => {
  it('gives a related example group one full second before the next explanation', async () => {
    const script: BriefSegment[] = [sample[0], { ...sample[0], id: 'second', example: { kind: 'legend', items: ['middle'] } }, { id: 'close', title: 'Remember', text: 'Not recordings.' }];
    const starts: number[] = [];
    const ends: number[] = [];
    const done = vi.fn();
    new BriefingPlayer(script, {
      onProgress: (_segment, word, phase) => { if (phase === 'speaking' && word === -1) starts.push(Date.now()); },
      playExample: async (ex, signal, unitMs) => { await briefingDelay(exampleUnits(ex) * unitMs, signal); ends.push(Date.now()); },
      onDone: done,
    }).start();
    await vi.advanceTimersByTimeAsync(45_000);
    expect(starts[1] - ends[0]).toBe(1_000);
    expect(starts[2] - ends[1]).toBe(1_000);
    expect(done).toHaveBeenCalledWith(true);
  });

  it('lengthens samples to 850 ms and shares eight seconds across the fullest ROI briefing', () => {
    expect(briefingTiming(sample).unitMs).toBe(850);
    const script = briefingScript({ workspace: 'visual', mode: 'musical', reference: true, harmony: true, cues: true, muted: {}, imageEnabled: true, featureVoice: true, frameData: true, roi: true });
    expect(briefingTiming(script).unitMs).toBeCloseTo(8_000 / 12);
  });

  it('cancels during the processing pause without starting the next explanation', async () => {
    const script = [sample[0], { ...sample[0], id: 'next' }];
    const progress = vi.fn();
    const examples = vi.fn(async (ex, signal, unitMs) => { await briefingDelay(exampleUnits(ex) * unitMs, signal); });
    const done = vi.fn();
    const player = new BriefingPlayer(script, { onProgress: progress, playExample: examples, onDone: done });
    player.start();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(examples).toHaveBeenCalledTimes(1);
    player.cancel();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(progress.mock.calls.every(([segment]) => segment === 0)).toBe(true);
    expect(examples).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['numerical', 'musical'], ['numerical', 'geophony'],
    ['visual', 'musical'], ['visual', 'geophony'],
  ] as const)('%s / %s: reads every section and plays every example within 45 seconds without a voice', async (workspace, mode) => {
    const script = briefingScript({ workspace, mode, reference: true, harmony: true, cues: true, muted: {}, imageEnabled: true, featureVoice: true, frameData: true, roi: true });
    const done = vi.fn();
    const progress = vi.fn();
    const examples = vi.fn(async (ex, signal, unitMs) => { await briefingDelay(exampleUnits(ex) * unitMs, signal); });
    const player = new BriefingPlayer(script, { onProgress: progress, playExample: examples, onDone: done });
    player.start();
    await vi.advanceTimersByTimeAsync(45_000);
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith(true);
    expect(new Set(progress.mock.calls.map(([i]) => i)).size).toBe(script.length);
    expect(examples).toHaveBeenCalledTimes(script.filter(s => s.example).length);
    const timing = briefingTiming(script);
    expect(timing.narrationMs).toBeLessThanOrEqual(BRIEFING_LIMITS.narrationMs);
    expect(timing.examplesMs).toBeLessThanOrEqual(BRIEFING_LIMITS.examplesMs);
    expect(timing.processingPausesMs).toBeLessThanOrEqual(BRIEFING_LIMITS.processingPausesMs);
    expect(timing.transitionsMs).toBeLessThanOrEqual(BRIEFING_LIMITS.transitionsMs);
    expect(timing.totalMs).toBeLessThanOrEqual(45_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ends once at the deadline even when an example never resolves', async () => {
    const done = vi.fn();
    let exampleSignal: AbortSignal | undefined;
    const example = vi.fn((_ex, signal) => { exampleSignal = signal; return new Promise<void>(() => {}); });
    const stop = vi.fn();
    const player = new BriefingPlayer(sample, { onProgress: () => {}, playExample: example, stopExample: stop, onDone: done });
    player.start();
    await vi.advanceTimersByTimeAsync(44_999);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith(false);
    expect(exampleSignal?.aborted).toBe(true);
    expect(stop).toHaveBeenCalledTimes(1);
    player.cancel();
    await vi.advanceTimersByTimeAsync(45_000);
    expect(done).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a pending read immediately and clears its timers', () => {
    const done = vi.fn();
    const progress = vi.fn();
    const player = new BriefingPlayer(sample, { onProgress: progress, playExample: async () => {}, onDone: done });
    player.start();
    player.cancel();
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['numerical', 'visual'] as const)('%s: muting all layers retains source qualifications without playing examples', async (workspace) => {
    const script = briefingScript({ workspace, mode: 'geophony', reference: true, harmony: true, cues: true, imageEnabled: true, featureVoice: true, frameData: true, roi: true, muted: { melody: true, texture: true, context: true, markers: true, time: true, image: true } });
    const examples = vi.fn(async () => {});
    const done = vi.fn();
    new BriefingPlayer(script, { onProgress: () => {}, playExample: examples, onDone: done }).start();
    await vi.advanceTimersByTimeAsync(45_000);
    expect(examples).not.toHaveBeenCalled();
    expect(script.map(s => s.text).join(' ')).toMatch(/not.*recordings/);
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith(true);
  });

  it('pauses without timing out, and resume/replay cannot revive the old example', async () => {
    const signals: AbortSignal[] = [];
    const done = vi.fn();
    const examples = vi.fn(async (_ex, signal: AbortSignal) => { signals.push(signal); await briefingDelay(5_000, signal); });
    const player = new BriefingPlayer(sample, { onProgress: () => {}, playExample: examples, onDone: done });
    player.start();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(signals).toHaveLength(1);
    player.pause();
    expect(signals[0].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(done).not.toHaveBeenCalled();
    player.resume();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(signals).toHaveLength(2);
    player.replaySegment();
    expect(signals[1].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(45_000);
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('browser speech', () => {
  function voice(endAfter?: number, starts = true) {
    let endTimer: ReturnType<typeof setTimeout>;
    const utterances: any[] = [];
    class Utterance { rate = 1; constructor(public text: string) {} }
    const cancel = vi.fn(() => clearTimeout(endTimer));
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    vi.stubGlobal('window', { speechSynthesis: {
      cancel, speaking: starts,
      speak: (u: any) => { utterances.push(u); if (starts) u.onstart?.(); if (endAfter != null) endTimer = setTimeout(() => u.onend?.(), endAfter); },
    } });
    return { utterances, cancel };
  }

  it('uses the existing speech rate and finishes normal spoken sections before the deadline', async () => {
    const { utterances } = voice(400);
    const done = vi.fn();
    new BriefingPlayer(sample, { onProgress: () => {}, playExample: async () => {}, onDone: done }).start();
    await vi.advanceTimersByTimeAsync(45_000);
    expect(utterances[0].rate).toBe(1);
    expect(done).toHaveBeenCalledWith(true);
    expect(done).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([undefined, 60_000])('bounds stalled/slow speech (end after %s ms) and ignores late callbacks', async (endAfter) => {
    const { utterances, cancel } = voice(endAfter);
    const done = vi.fn();
    const progress = vi.fn();
    new BriefingPlayer(sample, { onProgress: progress, playExample: async () => {}, onDone: done }).start();
    const lateEnd = utterances[0].onend;
    const lateBoundary = utterances[0].onboundary;
    await vi.advanceTimersByTimeAsync(45_000);
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith(false);
    expect(cancel).toHaveBeenCalled();
    const calls = progress.mock.calls.length;
    lateEnd(); lateBoundary({ charIndex: 0, name: 'word' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(progress).toHaveBeenCalledTimes(calls);
    expect(done).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('falls back when a voice is blocked or unavailable', async () => {
    voice(undefined, false);
    const done = vi.fn();
    new BriefingPlayer(sample, { onProgress: () => {}, playExample: async () => {}, onDone: done }).start();
    await vi.advanceTimersByTimeAsync(45_000);
    expect(done).toHaveBeenCalledWith(true);
    expect(done).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('anchors highlighting to real word boundaries', async () => {
    const { utterances } = voice(2_000);
    const progress = vi.fn();
    const done = vi.fn();
    const player = new BriefingPlayer(sample, { onProgress: progress, playExample: async () => {}, onDone: done });
    player.start();
    utterances[0].onboundary({ charIndex: 5, name: 'word' });
    expect(progress).toHaveBeenLastCalledWith(0, 1, 'speaking');
    player.cancel();
    await vi.runAllTimersAsync();
    expect(done).toHaveBeenCalledTimes(1);
  });
});
