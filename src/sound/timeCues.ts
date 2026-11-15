import type { SoundEvent } from '../contracts';

/**
 * Time cues (cue-v1): short percussive sounds that mark the passing of time — a new month, year, day or
 * week — and the checkpoints a user sets, so a listener always knows where they are in the timeline.
 * They are independent of the measurements (missing data cannot move or remove a cue), they sound the
 * same in Musical and Geophony mode, and they sit on their own mixer layer ("Time cues").
 */
export type Timeline = 'monthly' | 'seasonal';
export type CueUnit = 'step' | 'week' | 'month' | 'quarter' | 'year';
export type CueSound = 'woodblock' | 'bell' | 'click' | 'drum' | 'chime';
export type CueAccent = 'normal' | 'medium' | 'strong';

export interface Checkpoint { key: string; label: string }

export interface TimeCueSettings {
  unit: CueUnit | 'off';
  everyN: number;          // 1 = every boundary, 2 = every other one, …
  checkpoints: boolean;    // play checkpoint cues
  sound: CueSound;
  checkpointSound: CueSound;
  accentLarger: boolean;   // a larger boundary (e.g. a year when marking quarters) is louder
}

export const TIME_CUES = { version: 'cue-v1' };

/** Units that make sense on each timeline (monthly history: step = a month; seasonal cycle: step = a day). */
export const UNITS: Record<Timeline, CueUnit[]> = { monthly: ['step', 'quarter', 'year'], seasonal: ['step', 'week', 'month', 'quarter'] };

export const UNIT_LABEL: Record<Timeline, Record<CueUnit, string>> = {
  monthly: { step: 'month', week: 'week', month: 'month', quarter: 'quarter', year: 'year' },
  seasonal: { step: 'day', week: 'week', month: 'month', quarter: 'quarter', year: 'year' },
};

export const CUE_SOUNDS: { id: CueSound; label: string }[] = [
  { id: 'woodblock', label: 'Woodblock knock' }, { id: 'bell', label: 'Small bell' }, { id: 'click', label: 'Click' },
  { id: 'drum', label: 'Low drum' }, { id: 'chime', label: 'Two-note chime' },
];

/** Preset mode: one uniform cue. A knock at every year (monthly) or month (seasonal); a checkpoint is the same knock, doubled and louder. */
export const PRESET_TIME_CUES: Record<Timeline, TimeCueSettings> = {
  monthly: { unit: 'year', everyN: 1, checkpoints: true, sound: 'woodblock', checkpointSound: 'woodblock', accentLarger: false },
  seasonal: { unit: 'month', everyN: 1, checkpoints: true, sound: 'woodblock', checkpointSound: 'woodblock', accentLarger: false },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const RANK: Record<CueUnit, number> = { step: 0, week: 1, month: 2, quarter: 3, year: 4 };

/** Which boundaries step `i` starts. Monthly keys are "YYYY-MM"; seasonal steps use their frame labels ("Jan 01"). */
export function boundariesAt(i: number, key: string, label: string, timeline: Timeline): Set<CueUnit> {
  const out = new Set<CueUnit>(['step']);
  if (timeline === 'monthly') {
    const m = Number(key.slice(5, 7));
    if (!m) return out;
    out.add('month');
    if ((m - 1) % 3 === 0) out.add('quarter');
    if (m === 1) out.add('year');
  } else {
    if (i % 7 === 0) out.add('week');
    const [mon, day] = label.split(' ');
    if (day === '01' && MONTHS.includes(mon)) {
      out.add('month');
      if (['Jan', 'Apr', 'Jul', 'Oct'].includes(mon)) out.add('quarter');
      if (mon === 'Jan') out.add('year');
    }
  }
  return out;
}

/** Largest unit a step starts (used for the "louder for larger units" accent). */
function largest(b: Set<CueUnit>): CueUnit {
  return [...b].sort((x, y) => RANK[y] - RANK[x])[0];
}

/**
 * Time-cue events per step. Pure and deterministic; `everyN` counts boundaries from the start of the timeline,
 * so the cues do not move when the playback range changes. A checkpoint replaces the ordinary cue on its step.
 */
export function timeCueEvents(keys: string[], labels: string[], timeline: Timeline, s: TimeCueSettings, checkpoints: Checkpoint[] = []): SoundEvent[][] {
  const cps = new Map(checkpoints.map((c) => [c.key, c]));
  let count = 0;
  return keys.map((key, i) => {
    const label = labels[i] ?? key;
    const base = {
      kind: 'marker' as const, stepIndex: i, sourceObservationIds: [], datasetId: 'time', selectionId: 'time',
      original: { value: null, unit: 'mm/hr' as const, t: key, label }, offset: 0, duration: 0.05, mappingVersion: TIME_CUES.version,
    };
    const b = boundariesAt(i, key, label, timeline);
    let periodic = false;
    if (s.unit !== 'off' && b.has(s.unit)) { periodic = count % Math.max(1, Math.round(s.everyN)) === 0; count++; }
    const cp = cps.get(key);
    if (cp && s.checkpoints) {
      return [{
        ...base, id: `cue|${key}|checkpoint`, marker: 'checkpoint',
        timeCue: { unit: 'checkpoint', sound: s.checkpointSound, accent: 'strong', label: cp.label },
        explanation: `${label}: checkpoint “${cp.label}” — a doubled, louder ${soundWord(s.checkpointSound)}.`,
      }];
    }
    if (!periodic) return [];
    const unit = s.unit as CueUnit;
    const top = largest(b);
    const accent: CueAccent = s.accentLarger && RANK[top] > RANK[unit] ? (RANK[top] - RANK[unit] >= 2 ? 'strong' : 'medium') : 'normal';
    const word = UNIT_LABEL[timeline][top === 'step' ? 'step' : top];
    return [{
      ...base, id: `cue|${key}|time`, marker: 'time',
      timeCue: { unit, sound: s.sound, accent, label: `new ${s.accentLarger ? word : UNIT_LABEL[timeline][unit]}` },
      explanation: `${label}: a new ${UNIT_LABEL[timeline][unit]}${s.everyN > 1 ? ` (every ${s.everyN})` : ''} — ${soundWord(s.sound)}${accent !== 'normal' ? `, louder because a new ${word} starts` : ''}.`,
    }];
  });
}

export function soundWord(s: CueSound): string {
  return CUE_SOUNDS.find((c) => c.id === s)?.label.toLowerCase() ?? s;
}

/** Seconds between cues at a playback speed (steps per second), for the "too close together" hint. */
export function cueSpacingSeconds(timeline: Timeline, unit: CueUnit | 'off', everyN: number, stepsPerSecond: number): number | null {
  if (unit === 'off') return null;
  const stepsPerUnit = timeline === 'monthly'
    ? { step: 1, week: 1, month: 1, quarter: 3, year: 12 }[unit]
    : { step: 1, week: 7, month: 30.5, quarter: 91.5, year: 366 }[unit];
  return (stepsPerUnit * Math.max(1, everyN)) / stepsPerSecond;
}
