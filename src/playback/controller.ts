import * as Tone from 'tone';
import type { SoundEvent } from '../contracts';
import { engine, type SoundMode } from '../sound/engine';

/** A timeline adapter turns observations into playback steps. Observation time and playback seconds stay separate. */
export interface TimelineAdapter {
  id: 'monthly' | 'seasonal';
  keys: string[];                 // observation keys ("YYYY-MM" or "D###")
  eventsByStep: SoundEvent[][];   // pre-generated deterministic events
  /** optional media readiness gate: playback buffers instead of advancing into an unready step */
  isReady?: (i: number) => boolean;
  waitReady?: (i: number) => Promise<void>;
}

export type PlaybackState = 'stopped' | 'playing' | 'buffering';

export interface TransportLike {
  seconds: number;
  start(time?: number | string): unknown;
  stop(time?: number): unknown;
  pause(time?: number): unknown;
  cancel(after?: number): unknown;
  scheduleRepeat(cb: (time: number) => void, interval: number, startTime?: number | string): number;
  clear(id: number): unknown;
}

export interface ControllerDeps {
  transport: () => TransportLike;
  draw: (cb: () => void, time: number) => void;
  now: () => number;
  afterPaint: (cb: () => void) => void;
  engine: Pick<typeof engine, 'start' | 'playStep' | 'silence'>;
}

const defaultDeps: ControllerDeps = {
  transport: () => Tone.getTransport() as unknown as TransportLike,
  // Timer-driven from the audio clock (not rAF-driven), so UI state changes at the scheduled audio time
  // even when animation frames are throttled. Output latency is added so visuals match what is heard.
  draw: (cb, time) => {
    const ctx = Tone.getContext();
    const raw = ctx.rawContext as AudioContext;
    const latency = (raw.outputLatency || raw.baseLatency || 0);
    setTimeout(cb, Math.max(0, (time + latency - ctx.currentTime) * 1000));
  },
  now: () => Tone.getContext().currentTime,
  afterPaint: (cb) => requestAnimationFrame(() => requestAnimationFrame(cb)),
  engine,
};

/**
 * The single playback clock. Every view (map, frame, table, graph, piano roll) follows `index`,
 * which is only advanced from audio-clock-scheduled Draw callbacks.
 */
export class PlaybackController {
  private deps: ControllerDeps;
  private adapter: TimelineAdapter | null = null;
  private repeatId: number | null = null;
  private cursor = 0;
  private generation = 0;           // increments on every reschedule; stale callbacks are ignored
  private stepStartAudio = 0;
  index = 0;
  state: PlaybackState = 'stopped';
  stepSeconds = 1;
  loop = false;
  range: [number, number] = [0, 0];
  mode: SoundMode = 'musical';
  lagStats = { samples: 0, max: 0, mean: 0, last: 0 };
  private listeners = new Set<() => void>();

  constructor(deps: Partial<ControllerDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.state !== 'stopped') this.pause('page hidden');
      });
    }
  }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { this.listeners.forEach((l) => l()); }
  lastPauseReason: string | null = null;

  get adapterId() { return this.adapter?.id ?? null; }
  get length() { return this.adapter?.keys.length ?? 0; }

  /** Replace the timeline (dataset, selection, mapping or tab change). Cancels everything scheduled. */
  setAdapter(adapter: TimelineAdapter | null, opts: { index?: number; range?: [number, number] } = {}) {
    const wasPlaying = this.state !== 'stopped';
    this.hardStop();
    this.adapter = adapter;
    const n = adapter?.keys.length ?? 0;
    this.range = opts.range ? this.clampRange(opts.range, n) : [0, Math.max(0, n - 1)];
    this.index = Math.min(Math.max(opts.index ?? this.index, this.range[0]), this.range[1]);
    this.emit();
    if (wasPlaying && adapter) void this.play();
  }

  /** Update events without changing the timeline (instrument/mapping changes keep measurements). */
  updateEvents(eventsByStep: SoundEvent[][]) {
    if (!this.adapter) return;
    this.adapter = { ...this.adapter, eventsByStep };
    if (this.state === 'playing') this.reschedule();
  }

  private clampRange([a, b]: [number, number], n: number): [number, number] {
    const lo = Math.max(0, Math.min(a, n - 1));
    const hi = Math.max(lo, Math.min(b, n - 1));
    return [lo, hi];
  }

  async play(): Promise<boolean> {
    if (!this.adapter || this.length === 0) return false;
    const ok = await this.deps.engine.start();
    if (!ok) { this.lastPauseReason = 'audio unavailable'; this.emit(); return false; }
    if (this.index >= this.range[1] && !this.loop) this.index = this.range[0];
    this.state = 'playing';
    this.lastPauseReason = null;
    this.reschedule();
    this.emit();
    return true;
  }

  pause(reason = 'paused') {
    this.hardStop();
    this.lastPauseReason = reason;
    this.emit();
  }

  toggle() { return this.state === 'stopped' ? this.play() : (this.pause(), Promise.resolve(true)); }

  private hardStop() {
    const t = this.deps.transport();
    this.generation++;
    if (this.repeatId != null) { t.clear(this.repeatId); this.repeatId = null; }
    t.cancel(0);
    t.stop();
    this.deps.engine.silence();
    this.state = 'stopped';
  }

  /** Cancel obsolete events and schedule from the current index with the current speed. */
  private reschedule() {
    const t = this.deps.transport();
    this.generation++;
    const gen = this.generation;
    if (this.repeatId != null) { t.clear(this.repeatId); this.repeatId = null; }
    t.cancel(0);
    t.stop();
    this.deps.engine.silence();
    this.cursor = this.index;
    this.repeatId = t.scheduleRepeat((time) => this.tick(time, gen), this.stepSeconds, 0);
    t.start('+0.08');
  }

  private tick(time: number, gen: number) {
    if (gen !== this.generation || !this.adapter) return;
    let i = this.cursor;
    if (i > this.range[1]) {
      if (this.loop) i = this.range[0];
      else { this.deps.draw(() => { if (gen === this.generation) this.pause('end of range'); }, time); return; }
    }
    if (this.adapter.isReady && !this.adapter.isReady(i)) {
      // Buffer: stop advancing; never let audio run ahead into an unready frame.
      this.generation++;
      const adapter = this.adapter;
      this.deps.draw(() => this.buffer(i, adapter), time);
      return;
    }
    this.deps.engine.playStep(this.adapter.eventsByStep[i] ?? [], time, this.stepSeconds, this.mode);
    this.cursor = i + 1;
    this.deps.draw(() => {
      if (gen !== this.generation) return;
      this.stepStartAudio = time;
      this.index = i;
      this.emit();
      // measure when the highlight is actually painted (next animation frame), relative to the audio time
      this.deps.afterPaint(() => {
        const lag = Math.max(0, (this.deps.now() - time) * 1000);
        const s = this.lagStats;
        s.samples++; s.last = lag; s.max = Math.max(s.max, lag); s.mean += (lag - s.mean) / s.samples;
      });
    }, time);
  }

  private async buffer(i: number, adapter: TimelineAdapter) {
    const t = this.deps.transport();
    if (this.repeatId != null) { t.clear(this.repeatId); this.repeatId = null; }
    t.cancel(0); t.stop();
    this.deps.engine.silence();
    this.state = 'buffering';
    this.index = i;
    this.emit();
    await adapter.waitReady?.(i);
    if (this.state === 'buffering' && this.adapter === adapter) { this.state = 'playing'; this.reschedule(); this.emit(); }
  }

  seek(i: number) {
    if (!this.adapter) return;
    const n = this.length;
    this.index = Math.max(0, Math.min(n - 1, i));
    if (this.index < this.range[0] || this.index > this.range[1]) this.range = [Math.min(this.range[0], this.index), Math.max(this.range[1], this.index)];
    if (this.state === 'playing') this.reschedule();
    this.emit();
  }
  step(delta: number) { this.seek(this.index + delta); }

  setSpeed(stepsPerSecond: number) {
    this.stepSeconds = 1 / stepsPerSecond;
    if (this.state === 'playing') this.reschedule();
    this.emit();
  }
  setLoop(loop: boolean) { this.loop = loop; this.emit(); }
  setRange(range: [number, number]) {
    this.range = this.clampRange(range, this.length);
    if (this.index < this.range[0] || this.index > this.range[1]) this.index = this.range[0];
    if (this.state === 'playing') this.reschedule();
    this.emit();
  }
  setMode(mode: SoundMode) {
    this.mode = mode;
    if (this.state === 'playing') this.reschedule();
    this.emit();
  }

  /** Fraction (0..1) of the current step elapsed, for smooth playheads. */
  progress(): number {
    if (this.state !== 'playing') return 0;
    const p = (this.deps.now() - this.stepStartAudio) / this.stepSeconds;
    return Math.max(0, Math.min(1, p));
  }
}

export const controller = new PlaybackController();
