/**
 * Performs a briefing script: the browser voice reads each segment while the current word is reported for
 * highlighting, then the segment's sound example plays. Works without a voice too: words then advance on a timer,
 * so the highlighted text still paces the briefing.
 *
 * Word timing comes from the voice's `boundary` events. Some voices (several network voices in Chrome) never send
 * them; if none arrives shortly after the voice starts, the timer takes over for that segment.
 */
import { speechAvailable } from './speech';
import { tokenize, wordAt, wordMs, type BriefExample, type BriefSegment } from './briefing';

export interface BriefingCallbacks {
  /** current segment / word changed (word -1 = not started, words.length = all read) */
  onProgress: (segment: number, word: number, phase: 'speaking' | 'example') => void;
  /** play one example; resolves when it has finished sounding */
  playExample: (ex: BriefExample) => Promise<void>;
  onDone: (completed: boolean) => void;
}

const RATE = 1;
const BOUNDARY_GRACE_MS = 700;
const AFTER_SEGMENT_MS = 350;

export class BriefingPlayer {
  private seg = 0;
  private alive = true;
  private paused = false;
  private run = 0; // bumps on pause/cancel so stale timers and callbacks are ignored
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private script: BriefSegment[], private cb: BriefingCallbacks) {}

  start() { void this.playFrom(0); }

  pause() {
    if (!this.alive || this.paused) return;
    this.paused = true;
    this.halt();
  }
  /** Resume restarts the current segment from its first word (pausing mid-sentence in browsers is unreliable). */
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
  cancel() {
    if (!this.alive) return;
    this.alive = false;
    this.halt();
    this.cb.onDone(false);
  }
  get isPaused() { return this.paused; }

  private halt() {
    this.run++;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (speechAvailable()) { try { window.speechSynthesis.cancel(); } catch { /* ignore */ } }
  }

  private wait(ms: number, run: number) {
    return new Promise<boolean>((resolve) => { this.timers.push(setTimeout(() => resolve(run === this.run), ms)); });
  }

  private async playFrom(i: number) {
    const run = ++this.run;
    for (this.seg = i; this.seg < this.script.length; this.seg++) {
      const s = this.script[this.seg];
      if (!(await this.read(s, run))) return;
      if (s.example) {
        this.cb.onProgress(this.seg, Number.MAX_SAFE_INTEGER, 'example');
        try { await this.cb.playExample(s.example); } catch { /* audio unavailable: the words still carry the meaning */ }
        if (run !== this.run) return;
      }
      if (!(await this.wait(AFTER_SEGMENT_MS, run))) return;
    }
    if (run !== this.run || !this.alive) return;
    this.alive = false;
    this.cb.onDone(true);
  }

  /** Read one segment aloud (or silently on a timer); resolves false if interrupted. */
  private read(s: BriefSegment, run: number): Promise<boolean> {
    const tokens = tokenize(s.text);
    this.cb.onProgress(this.seg, -1, 'speaking');
    const seg = this.seg;
    return new Promise<boolean>((resolve) => {
      let finished = false;
      let timerWord = -1;
      let timerOn = false;
      const finish = (ok: boolean) => {
        if (finished) return;
        finished = true;
        if (ok && run === this.run) this.cb.onProgress(seg, tokens.length, 'speaking');
        resolve(ok && run === this.run);
      };
      // the timer path: used without a voice, or when the voice sends no word boundaries
      const tick = () => {
        if (run !== this.run || finished) return;
        timerWord++;
        if (timerWord >= tokens.length) { if (!voice) finish(true); return; }
        this.cb.onProgress(seg, timerWord, 'speaking');
        this.timers.push(setTimeout(tick, wordMs(tokens[timerWord].word) / RATE));
      };
      const startTimer = (fromWord = -1) => { if (timerOn) return; timerOn = true; timerWord = fromWord; tick(); };

      const voice = speechAvailable();
      if (!voice) { startTimer(); return; }
      try {
        const u = new SpeechSynthesisUtterance(s.text);
        u.rate = RATE;
        u.lang = 'en-US';
        let boundary = false;
        u.onstart = () => {
          this.timers.push(setTimeout(() => { if (!boundary && run === this.run) startTimer(); }, BOUNDARY_GRACE_MS));
        };
        u.onboundary = (e) => {
          if (run !== this.run || timerOn || (e.name && e.name !== 'word')) return;
          boundary = true;
          this.cb.onProgress(seg, wordAt(tokens, e.charIndex), 'speaking');
        };
        u.onend = () => finish(true);
        u.onerror = (e) => {
          // "interrupted"/"canceled" come from our own pause/cancel; anything else: fall back to the silent timer
          if (e.error === 'interrupted' || e.error === 'canceled') { finish(false); return; }
          startTimer();
          this.timers.push(setTimeout(() => finish(true), tokens.reduce((t, w) => t + wordMs(w.word), 0) + 200));
        };
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
        // safety net: some engines drop `end` on long utterances; never let the briefing hang
        const maxMs = tokens.reduce((t, w) => t + wordMs(w.word), 0) * 2.2 + 4000;
        this.timers.push(setTimeout(() => finish(true), maxMs));
        // and if the engine never starts speaking (no voices, blocked), read silently
        this.timers.push(setTimeout(() => { if (!window.speechSynthesis.speaking && !finished) { startTimer(); this.timers.push(setTimeout(() => finish(true), tokens.reduce((t, w) => t + wordMs(w.word), 0) + 200)); } }, 1500));
      } catch {
        startTimer();
      }
    });
  }
}
