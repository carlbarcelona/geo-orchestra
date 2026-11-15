/** Spoken briefing with word highlighting, cancellable examples and a bounded single pass. */
import { speechAvailable } from './speech';
import { tokenize, wordAt, wordMs, type BriefExample, type BriefSegment } from './briefing';
import { BRIEFING_LIMITS, briefingDelay, briefingTiming } from './briefingTiming';

export interface BriefingCallbacks {
  onProgress: (segment: number, word: number, phase: 'speaking' | 'example') => void;
  playExample: (ex: BriefExample, signal: AbortSignal, unitMs: number) => Promise<void>;
  stopExample?: () => void;
  onDone: (completed: boolean) => void;
}

const RATE = 1;

export class BriefingPlayer {
  private seg = 0;
  private alive = true;
  private paused = false;
  private run: AbortController | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;

  constructor(private script: BriefSegment[], private cb: BriefingCallbacks) {}

  start() { if (this.alive && !this.run) void this.playFrom(0); }

  pause() {
    if (!this.alive || this.paused) return;
    this.paused = true;
    this.halt();
  }
  /** Resume and replay restart this section; deliberate repeats may extend the session. */
  resume() {
    if (!this.alive || !this.paused) return;
    this.paused = false;
    void this.playFrom(this.seg);
  }
  replaySegment() {
    if (!this.alive) return;
    this.paused = false;
    this.halt();
    void this.playFrom(this.seg);
  }
  cancel() { this.finish(false); }
  get isPaused() { return this.paused; }

  private halt() {
    if (this.deadline != null) clearTimeout(this.deadline);
    this.deadline = null;
    this.run?.abort();
    this.run = null;
    if (speechAvailable()) { try { window.speechSynthesis.cancel(); } catch { /* unavailable voice */ } }
    this.cb.stopExample?.();
  }

  private finish(completed: boolean) {
    if (!this.alive) return;
    this.alive = false;
    this.halt(); // cancel speech and examples before playback is allowed to start
    this.cb.onDone(completed);
  }

  private async playFrom(i: number) {
    const run = new AbortController();
    this.run = run;
    const { signal } = run;
    const timing = briefingTiming(this.script);
    this.deadline = setTimeout(() => this.finish(false), BRIEFING_LIMITS.totalMs);
    for (this.seg = i; this.seg < this.script.length; this.seg++) {
      const s = this.script[this.seg];
      if (!(await this.read(s, signal, timing.readingScale))) return;
      if (s.example) {
        this.cb.onProgress(this.seg, Number.MAX_SAFE_INTEGER, 'example');
        try { await this.cb.playExample(s.example, signal, timing.unitMs); } catch { /* text still explains unavailable audio */ }
        if (signal.aborted) return;
      }
      // Let the listener process a whole demonstration group before any new speech.
      if (!(await briefingDelay(s.example ? timing.processingPauseMs : timing.transitionMs, signal))) return;
    }
    if (!signal.aborted) this.finish(true);
  }

  private read(s: BriefSegment, signal: AbortSignal, readingScale: number): Promise<boolean> {
    const tokens = tokenize(s.text);
    const seg = this.seg;
    this.cb.onProgress(seg, -1, 'speaking');
    return new Promise((resolve) => {
      let finished = false;
      let current = -1;
      let voice = speechAvailable();
      let started = false;
      let utterance: SpeechSynthesisUtterance | null = null;
      const timers = new Set<ReturnType<typeof setTimeout>>();
      let wordTimer: ReturnType<typeof setTimeout>;
      const later = (fn: () => void, ms: number) => {
        const timer = setTimeout(() => { timers.delete(timer); fn(); }, ms);
        timers.add(timer);
        return timer;
      };
      const finish = (ok: boolean) => {
        if (finished) return;
        finished = true;
        timers.forEach(clearTimeout);
        signal.removeEventListener('abort', abort);
        if (utterance) { utterance.onstart = null; utterance.onboundary = null; utterance.onend = null; utterance.onerror = null; }
        if (ok && !signal.aborted) this.cb.onProgress(seg, tokens.length, 'speaking');
        resolve(ok && !signal.aborted);
      };
      const abort = () => finish(false);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { finish(false); return; }
      const tick = () => {
        if (finished || signal.aborted) return;
        current++;
        if (current >= tokens.length) { if (!voice) finish(true); return; }
        this.cb.onProgress(seg, current, 'speaking');
        wordTimer = later(tick, wordMs(tokens[current].word) * readingScale);
      };
      // Start highlighting immediately; real boundaries re-anchor this same fallback timer.
      tick();
      if (!voice) return;
      try {
        const u = new SpeechSynthesisUtterance(s.text);
        utterance = u;
        u.rate = RATE;
        u.lang = 'en-US';
        u.onstart = () => { if (!finished && !signal.aborted) started = true; };
        u.onboundary = (e) => {
          if (finished || signal.aborted || (e.name && e.name !== 'word')) return;
          clearTimeout(wordTimer); timers.delete(wordTimer);
          current = wordAt(tokens, e.charIndex);
          this.cb.onProgress(seg, current, 'speaking');
          wordTimer = later(tick, wordMs(tokens[current].word) * readingScale);
        };
        u.onend = () => finish(true);
        u.onerror = () => { voice = false; if (current >= tokens.length) finish(true); };
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
        // A blocked voice falls back without replaying already highlighted words.
        later(() => {
          if (!started) {
            voice = false;
            if (utterance) utterance.onerror = null;
            try { window.speechSynthesis.cancel(); } catch { /* unavailable voice */ }
            if (current >= tokens.length) finish(true);
          }
        }, 1_000);
      } catch { voice = false; if (current >= tokens.length) finish(true); }
    });
  }
}
