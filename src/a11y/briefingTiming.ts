import { tokenize, wordMs, type BriefExample, type BriefSegment } from './briefing';

/** Budgets for an uninterrupted pass, not a user's pauses or deliberate replays. */
export const BRIEFING_LIMITS = { narrationMs: 29_000, examplesMs: 8_000, processingPausesMs: 7_000, transitionsMs: 1_000, totalMs: 45_000 } as const;

export function exampleUnits(ex: BriefExample): number {
  return 'items' in ex ? ex.items.length : 2;
}

export function briefingTiming(script: BriefSegment[]) {
  const units = script.reduce((sum, s) => sum + (s.example ? exampleUnits(s.example) : 0), 0);
  const groups = script.filter(s => s.example).length;
  const unitMs = Math.min(850, BRIEFING_LIMITS.examplesMs / Math.max(1, units));
  const processingPauseMs = 1_000;
  const processingPausesMs = groups * processingPauseMs;
  const transitionMs = Math.min(80, BRIEFING_LIMITS.transitionsMs / Math.max(1, script.length - groups));
  const transitionsMs = (script.length - groups) * transitionMs;
  const naturalNarrationMs = script.reduce((sum, s) => sum + tokenize(s.text).reduce((t, w) => t + wordMs(w.word), 0), 0);
  // Silent reading keeps the relative word lengths inside the same narration budget.
  // This does not change SpeechSynthesisUtterance.rate; real word boundaries remain authoritative.
  const readingScale = Math.min(1, BRIEFING_LIMITS.narrationMs / Math.max(1, naturalNarrationMs));
  const narrationMs = naturalNarrationMs * readingScale;
  return { unitMs, transitionMs, processingPauseMs, processingPausesMs, transitionsMs, readingScale, narrationMs, examplesMs: units * unitMs, totalMs: narrationMs + units * unitMs + processingPausesMs + transitionsMs };
}

/** Abort resolves pending waits too, so canceled runs cannot schedule another sample. */
export function briefingDelay(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const finish = (ok: boolean) => { clearTimeout(timer); signal.removeEventListener('abort', abort); resolve(ok); };
    const abort = () => finish(false);
    const timer = setTimeout(() => finish(true), ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
