import type { Observation, SoundEvent } from '../contracts';

/**
 * Mapping v1 — explicit, deterministic and fixed across dates and regions so comparisons are meaningful.
 * The raw measurement is preserved on every event; only the sound parameters are normalized.
 */
export const MAPPING = {
  version: 'rain-v1',
  referenceRange: [0, 1.5] as [number, number], // mm/hr monthly mean rate; values above are clipped and flagged
  curve: 'sqrt',
  densityStep: 0.08, // |Δ| in mm/hr per extra note
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

/** Normalize a raw value against the fixed reference range. Returns null for missing. */
export function normalize(value: number | null, range = MAPPING.referenceRange): { n: number; clipped: boolean } | null {
  if (value == null || Number.isNaN(value)) return null;
  const [lo, hi] = range;
  const clipped = value > hi || value < lo;
  const v = Math.min(hi, Math.max(lo, value));
  return { n: Math.sqrt((v - lo) / (hi - lo)), clipped };
}

export interface MappingOptions {
  scale: string;
  pitchLow: number;   // MIDI
  pitchHigh: number;  // MIDI
  spatialPhrases: boolean;
  datasetId: string;
  selectionId: string;
  stepLabel: (t: string) => string;
}

export interface SampleSeries { id: string; name: string; lon: number; lat: number; values: (number | null)[] }

/** Longitude to stereo pan over the Philippine extent. */
export function lonToPan(lon: number, west = 116, east = 127.5): number {
  return Math.max(-1, Math.min(1, ((lon - west) / (east - west)) * 2 - 1));
}

/** Geophony parameters: drops density, intensity and brightness from rainfall (and its change). */
export function geophonyParams(value: number | null, change: number | null) {
  const nv = normalize(value);
  if (!nv) return null;
  const n = nv.n;
  const agitation = change == null ? 0 : Math.min(1, Math.abs(change) / 0.3);
  return {
    dropsPerSecond: +(2 + n * 38 + agitation * 6).toFixed(2),
    intensity: +(0.08 + n * 0.82).toFixed(3),
    brightness: +(0.25 + n * 0.55 + agitation * 0.2).toFixed(3),
  };
}

/** Generate the full, deterministic event list for a series. */
export function generateEvents(obs: Observation[], opts: MappingOptions, samples: SampleSeries[] = []): SoundEvent[] {
  const notes = scaleNotes(opts.scale, opts.pitchLow, opts.pitchHigh);
  const events: SoundEvent[] = [];
  const common = { datasetId: opts.datasetId, selectionId: opts.selectionId, mappingVersion: MAPPING.version };
  let prevValid: number | null = null;
  obs.forEach((o, i) => {
    const label = opts.stepLabel(o.t);
    const original = { value: o.value, unit: 'mm/hr' as const, t: o.t, label };
    if (o.t.endsWith('-01') && i > 0) {
      events.push({ ...common, id: `${o.id}#year`, kind: 'marker', marker: 'year', stepIndex: i, sourceObservationIds: [o.id], original, offset: 0, duration: 0.05, explanation: `Start of ${o.t.slice(0, 4)}` });
    }
    const prev = i > 0 ? obs[i - 1].value : null;
    const change = o.value != null && prev != null ? o.value - prev : null;
    if (o.value == null) {
      events.push({ ...common, id: `${o.id}#missing`, kind: 'marker', marker: 'missing', stepIndex: i, sourceObservationIds: [o.id], original, offset: 0, duration: 1,
        explanation: `${label}: measurement missing — no note is played and no value is invented.` });
      prevValid = null;
      return;
    }
    const nv = normalize(o.value)!;
    const idx = Math.round(nv.n * (notes.length - 1));
    const midi = notes[idx];
    const velocity = +(0.25 + nv.n * 0.7).toFixed(3);
    const extra = change == null ? 0 : Math.min(MAPPING.maxNotesPerStep - 1, Math.floor(Math.abs(change) / MAPPING.densityStep));
    const count = 1 + extra;
    const dir = change != null && change < 0 ? -1 : 1;
    const isZero = o.value === 0;
    for (let k = 0; k < count; k++) {
      const nIdx = Math.max(0, Math.min(notes.length - 1, idx + (k === 0 ? 0 : dir * k)));
      const m = k === 0 ? midi : notes[nIdx];
      events.push({
        ...common, id: `${o.id}#m${k}`, kind: 'melody', stepIndex: i, sourceObservationIds: [o.id], original,
        offset: k / count, duration: Math.max(0.2, 0.9 / count), midi: m, note: midiToName(m), velocity: k === 0 ? velocity : +(velocity * 0.75).toFixed(3), pan: 0,
        marker: nv.clipped ? 'clipped' : isZero ? 'zero' : undefined,
        explanation: k === 0
          ? `${label}: ${o.value.toFixed(3)} mm/hr${o.selectionType === 'area' ? ' (area mean)' : ' (single cell)'} → ${midiToName(m)} (pitch from rainfall on ${opts.scale}, fixed range 0–${MAPPING.referenceRange[1]} mm/hr${nv.clipped ? ', clipped' : ''})${isZero ? ' — zero rainfall, a real measurement' : ''}`
          : `${label}: extra note ${k + 1}/${count} — change of ${change!.toFixed(3)} mm/hr from the previous month sets note density`,
      });
    }
    if (isZero) {
      events.push({ ...common, id: `${o.id}#zero`, kind: 'marker', marker: 'zero', stepIndex: i, sourceObservationIds: [o.id], original, offset: 0, duration: 0.1,
        explanation: `${label}: zero rainfall measured (distinct from missing).` });
    }
    const geo = geophonyParams(o.value, change);
    if (geo) {
      events.push({ ...common, id: `${o.id}#tex`, kind: 'texture', stepIndex: i, sourceObservationIds: [o.id], original, offset: 0, duration: 1, texture: geo,
        explanation: `${label}: ${o.value.toFixed(3)} mm/hr → ${geo.dropsPerSecond} drops/s, intensity ${geo.intensity}` });
    }
    if (opts.spatialPhrases) {
      samples.forEach((s, si) => {
        const sv = s.values[i];
        const sn = normalize(sv);
        if (!sn) return;
        const m = notes[Math.round(sn.n * (notes.length - 1))];
        events.push({
          ...common, id: `${o.id}#s${si}`, kind: 'sample', stepIndex: i, sourceObservationIds: [`${opts.datasetId}|sample:${s.id}|${o.t}`],
          original: { value: sv, unit: 'mm/hr', t: o.t, label }, offset: 0.5 + (si / samples.length) * 0.45, duration: 0.12,
          midi: m, note: midiToName(m), velocity: +(0.2 + sn.n * 0.35).toFixed(3), pan: +lonToPan(s.lon).toFixed(3),
          explanation: `${label}: sampled cell ${s.name} (${s.lat.toFixed(2)}°N, ${s.lon.toFixed(2)}°E) ${sv!.toFixed(3)} mm/hr → ${midiToName(m)}, panned by longitude`,
        });
      });
    }
    prevValid = o.value;
  });
  void prevValid;
  return events;
}
