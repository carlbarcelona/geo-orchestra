import type { AnomalyCategory, Observation, SelectionType, SoundEvent, StepContext } from '../contracts';
import { comparePhrase, isExtreme, rankPhrase } from './context';

/**
 * Mapping rain-v2 — explicit, deterministic and fixed across dates and regions so comparisons are meaningful.
 * The raw measurement is preserved on every event; only the sound parameters are normalized.
 *
 *  - Pitch is LINEAR on a fixed range per selection type, so one scale step is a stated amount of rain.
 *  - A soft "hum" (reference event) plays the normal for the same calendar month: the distance between the
 *    melody and the hum is the departure from normal.
 *  - A chord says wetter (major), drier (minor) or near normal (open fifth); an unusual month adds a bell.
 *  - Geophony keeps rain density for the amount and adds thunder (much wetter) or a dry wind (much drier).
 * See docs/mapping-guide.md and ai-history/decisions/0001-rain-v2-normal-reference.md.
 */
export const MAPPING = {
  version: 'rain-v2',
  ranges: { area: [0, 0.8], cell: [0, 1.5] } as Record<SelectionType, [number, number]>, // mm/hr monthly mean rate
  curve: 'linear',
  densityStep: 0.08, // |Δ| in mm/hr per extra note (variation option, off by default)
  maxNotesPerStep: 4,
};

export const SCALES: Record<string, number[]> = {
  'C pentatonic': [0, 2, 4, 7, 9],
  'A minor pentatonic': [9, 0, 2, 4, 7],
  'C major': [0, 2, 4, 5, 7, 9, 11],
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function midiToName(m: number): string { return `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`; }

/** All scale notes within [low, high] MIDI inclusive, ascending. */
export function scaleNotes(scale: string, low: number, high: number): number[] {
  const pcs = SCALES[scale] ?? SCALES['C pentatonic'];
  const out: number[] = [];
  for (let m = low; m <= high; m++) if (pcs.includes(m % 12)) out.push(m);
  return out;
}

export function referenceRangeFor(type: SelectionType | undefined): [number, number] {
  return MAPPING.ranges[type ?? 'cell'] ?? MAPPING.ranges.cell;
}

/** Amount of rain (mm/hr) represented by one scale step for a selection type and a number of notes. */
export function stepSize(type: SelectionType | undefined, noteCount: number): number {
  const [lo, hi] = referenceRangeFor(type);
  return (hi - lo) / Math.max(1, noteCount - 1);
}

/** Normalize a raw value against a fixed reference range (linear). Returns null for missing. */
export function normalize(value: number | null, range: [number, number] = MAPPING.ranges.cell): { n: number; clipped: boolean } | null {
  if (value == null || Number.isNaN(value)) return null;
  const [lo, hi] = range;
  const clipped = value > hi || value < lo;
  const v = Math.min(hi, Math.max(lo, value));
  return { n: (v - lo) / (hi - lo), clipped };
}

/** Index into the note list for a value (null for missing). */
export function valueToNoteIndex(value: number | null, noteCount: number, range: [number, number]): number | null {
  const nv = normalize(value, range);
  return nv ? Math.round(nv.n * (noteCount - 1)) : null;
}

export interface MappingOptions {
  scale: string;
  pitchLow: number;   // MIDI
  pitchHigh: number;  // MIDI
  spatialPhrases: boolean;
  datasetId: string;
  selectionId: string;
  stepLabel: (t: string) => string;
  /** Context layers (used only when contexts are passed to generateEvents). */
  reference?: boolean;  // the normal "hum"          (default true)
  harmony?: boolean;    // wetter/drier chord         (default true)
  cues?: boolean;       // bell, thunder, dry wind    (default true)
  variation?: boolean;  // change → extra notes       (default false)
}

export interface SampleSeries { id: string; name: string; lon: number; lat: number; values: (number | null)[] }

/** Longitude to stereo pan over the Philippine extent. */
export function lonToPan(lon: number, west = 116, east = 127.5): number {
  return Math.max(-1, Math.min(1, ((lon - west) / (east - west)) * 2 - 1));
}

/** Geophony parameters: drops density, intensity and brightness from rainfall (and its change). */
export function geophonyParams(value: number | null, change: number | null, range: [number, number] = MAPPING.ranges.cell) {
  const nv = normalize(value, range);
  if (!nv) return null;
  const n = nv.n;
  const agitation = change == null ? 0 : Math.min(1, Math.abs(change) / 0.3);
  return {
    dropsPerSecond: +(2 + n * 38 + agitation * 6).toFixed(2),
    intensity: +(0.08 + n * 0.82).toFixed(3),
    brightness: +(0.25 + n * 0.55 + agitation * 0.2).toFixed(3),
  };
}

/** Chord intervals (semitones above the chord root) for each category. */
export const CHORDS: Record<AnomalyCategory, number[]> = {
  'much-drier': [0, 3, 7, 10],
  drier: [0, 3, 7],
  'near-normal': [0, 7],
  wetter: [0, 4, 7],
  'much-wetter': [0, 4, 7, 14],
};
const CHORD_NAME: Record<AnomalyCategory, string> = {
  'much-drier': 'dark full (minor 7th) chord', drier: 'dark (minor) chord', 'near-normal': 'open fifth (neutral)',
  wetter: 'bright (major) chord', 'much-wetter': 'bright full (major add 9) chord',
};

/** Generate the full, deterministic event list for a series. `contexts[i]` belongs to `obs[i]`. */
export function generateEvents(obs: Observation[], opts: MappingOptions, samples: SampleSeries[] = [], contexts?: StepContext[]): SoundEvent[] {
  const notes = scaleNotes(opts.scale, opts.pitchLow, opts.pitchHigh);
  const events: SoundEvent[] = [];
  const common = { datasetId: opts.datasetId, selectionId: opts.selectionId, mappingVersion: MAPPING.version };
  const useRef = opts.reference ?? true, useHarm = opts.harmony ?? true, useCues = opts.cues ?? true, useVar = opts.variation ?? false;
  obs.forEach((o, i) => {
    const label = opts.stepLabel(o.t);
    const original = { value: o.value, unit: 'mm/hr' as const, t: o.t, label };
    const range = referenceRangeFor(o.selectionType);
    const ctx = contexts?.[i];
    const withCtx = ctx ? { context: ctx } : {};
    if (o.t.endsWith('-01') && /^\d{4}-\d{2}$/.test(o.t) && i > 0) {
      events.push({ ...common, id: `${o.id}#year`, kind: 'marker', marker: 'year', stepIndex: i, sourceObservationIds: [o.id], original, offset: 0, duration: 0.05, explanation: `Start of ${o.t.slice(0, 4)}` });
    }
    // the normal "hum": the same pitch mapping applied to the reference value
    if (ctx && useRef && ctx.normal != null) {
      const ri = valueToNoteIndex(ctx.normal, notes.length, range)!;
      events.push({
        ...common, ...withCtx, id: `${o.id}#ref`, kind: 'reference', stepIndex: i, sourceObservationIds: [o.id],
        original: { value: +ctx.normal.toFixed(5), unit: 'mm/hr', t: o.t, label: `${label} — normal` },
        offset: 0, duration: 1, midi: notes[ri], note: midiToName(notes[ri]), velocity: 0.3, pan: 0,
        explanation: `${label}: the hum plays the reference — ${ctx.baseline} for ${ctx.periodLabel} (${ctx.normal.toFixed(3)} mm/hr) → ${midiToName(notes[ri])}. A melody above the hum means wetter than normal, below means drier.`,
      });
    }
    const prev = i > 0 ? obs[i - 1].value : null;
    const change = o.value != null && prev != null ? o.value - prev : null;
    if (o.value == null) {
      events.push({ ...common, ...withCtx, id: `${o.id}#missing`, kind: 'marker', marker: 'missing', stepIndex: i, sourceObservationIds: [o.id], original, offset: 0, duration: 1,
        explanation: `${label}: measurement missing — no note is played and no value is invented.` });
      return;
    }
    const nv = normalize(o.value, range)!;
    const idx = Math.round(nv.n * (notes.length - 1));
    const midi = notes[idx];
    const velocity = +(0.3 + nv.n * 0.6).toFixed(3);
    const extra = useVar && change != null ? Math.min(MAPPING.maxNotesPerStep - 1, Math.floor(Math.abs(change) / MAPPING.densityStep)) : 0;
    const count = 1 + extra;
    const dir = change != null && change < 0 ? -1 : 1;
    const isZero = o.value === 0;
    const compare = ctx?.category ? `; ${comparePhrase(ctx)}${rankPhrase(ctx) ? ` (${rankPhrase(ctx)})` : ''}` : '';
    for (let k = 0; k < count; k++) {
      const nIdx = Math.max(0, Math.min(notes.length - 1, idx + (k === 0 ? 0 : dir * k)));
      const m = k === 0 ? midi : notes[nIdx];
      events.push({
        ...common, ...(k === 0 ? withCtx : {}), id: `${o.id}#m${k}`, kind: 'melody', stepIndex: i, sourceObservationIds: [o.id], original,
        offset: k / count, duration: Math.max(0.2, 0.9 / count), midi: m, note: midiToName(m), velocity: k === 0 ? velocity : +(velocity * 0.75).toFixed(3), pan: 0,
        marker: nv.clipped ? 'clipped' : isZero ? 'zero' : undefined,
        explanation: k === 0
          ? `${label}: ${o.value.toFixed(3)} mm/hr${o.selectionType === 'area' ? ' (area mean)' : ' (single cell)'} → ${midiToName(m)} (linear pitch on ${opts.scale}, fixed range ${range[0]}–${range[1]} mm/hr, one step ≈ ${stepSize(o.selectionType, notes.length).toFixed(3)} mm/hr${nv.clipped ? ', clipped' : ''})${isZero ? ' — zero rainfall, a real measurement' : ''}${compare}`
          : `${label}: extra note ${k + 1}/${count} — change of ${change!.toFixed(3)} mm/hr from the previous month sets note density`,
      });
    }
    if (isZero) {
      events.push({ ...common, id: `${o.id}#zero`, kind: 'marker', marker: 'zero', stepIndex: i, sourceObservationIds: [o.id], original, offset: 0, duration: 0.1,
        explanation: `${label}: zero rainfall measured (distinct from missing).` });
    }
    if (ctx?.category && useHarm) {
      const root = midi - 12;
      const chord = CHORDS[ctx.category].map((d) => root + d);
      const far = ctx.category === 'much-wetter' || ctx.category === 'much-drier';
      events.push({
        ...common, ...withCtx, id: `${o.id}#chord`, kind: 'chord', stepIndex: i, sourceObservationIds: [o.id], original,
        offset: 0, duration: 0.95, midi: root, note: midiToName(root), chord, velocity: far ? 0.38 : 0.28, pan: 0,
        explanation: `${label}: ${comparePhrase(ctx)} → ${CHORD_NAME[ctx.category]} under the melody.`,
      });
    }
    if (ctx && useCues && isExtreme(ctx)) {
      events.push({
        ...common, ...withCtx, id: `${o.id}#extreme`, kind: 'marker', marker: 'extreme', stepIndex: i, sourceObservationIds: [o.id], original,
        offset: 0.02, duration: 0.15,
        explanation: `${label}: unusual month — ${comparePhrase(ctx)} by ${Math.abs(ctx.z!).toFixed(1)} standard deviations${rankPhrase(ctx) ? ` (${rankPhrase(ctx)})` : ''}. A bell marks it.`,
      });
    }
    const geo = geophonyParams(o.value, useVar ? change : null, range);
    if (geo) {
      const cue = ctx && useCues ? (ctx.category === 'much-wetter' ? 'thunder' as const : ctx.category === 'much-drier' ? 'wind' as const : undefined) : undefined;
      events.push({ ...common, ...withCtx, id: `${o.id}#tex`, kind: 'texture', stepIndex: i, sourceObservationIds: [o.id], original, offset: 0, duration: 1, texture: geo, cue,
        explanation: `${label}: ${o.value.toFixed(3)} mm/hr → ${geo.dropsPerSecond} drops/s, intensity ${geo.intensity}${cue ? `, ${cue === 'thunder' ? 'distant thunder (much wetter than normal)' : 'dry wind (much drier than normal)'}` : ''}` });
    }
    if (opts.spatialPhrases) {
      samples.forEach((s, si) => {
        const sv = s.values[i];
        const sn = normalize(sv, MAPPING.ranges.cell);
        if (!sn) return;
        const m = notes[Math.round(sn.n * (notes.length - 1))];
        events.push({
          ...common, id: `${o.id}#s${si}`, kind: 'sample', stepIndex: i, sourceObservationIds: [`${opts.datasetId}|sample:${s.id}|${o.t}`],
          original: { value: sv, unit: 'mm/hr', t: o.t, label }, offset: 0.5 + (si / samples.length) * 0.45, duration: 0.12,
          midi: m, note: midiToName(m), velocity: +(0.2 + sn.n * 0.35).toFixed(3), pan: +lonToPan(s.lon).toFixed(3),
          explanation: `${label}: sampled cell ${s.name} (${s.lat.toFixed(2)}°N, ${s.lon.toFixed(2)}°E) ${sv!.toFixed(3)} mm/hr → ${midiToName(m)}, panned by longitude (cell range 0–${MAPPING.ranges.cell[1]} mm/hr)`,
        });
      });
    }
  });
  return events;
}
