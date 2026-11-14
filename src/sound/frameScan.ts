import type { FrameFeature, FrameScanDoc, SoundEvent } from '../contracts';
import { cellValue, type Grid } from '../data/dataset';
import { INTENSITY, intensityClass, toMmDay, type IntensityClass } from './intensity';
import { midiToName, scaleNotes } from './mapping';

/**
 * Frame sweep scan-v2 — one learnable rule wherever a frame (NASA SVS image or measured IMERG map) becomes sound:
 *
 *   PITCH = LATITUDE   one fixed table: each scale note is a 2.5° latitude band (C3 = 10–7.5°S … C4 = 2.5–5°N … C6 = 27.5–30°N)
 *   LOUDNESS = RAIN CLASS   light / moderate / heavy / very heavy (2 / 5 / 8 / 14 mm/day)
 *   SILENCE = DRY      a beat with no band at light rain or more is a rest
 *   TIME = WEST → EAST  the frame is played as 11 beats; each beat plays its 2 wettest latitude bands
 *
 * The sweep, the rain-band voice, the explore cursor and the Frame score all use the same table, so the same
 * latitude is always the same note. Every note keeps its location, raw value, unit and derivation.
 */
export interface ScanGrid {
  ncol: number; nrow: number; lonMin: number; latMin: number; step: number;
  unit: 'mm/day' | 'mm/hr';
  derivation: 'image-derived' | 'measured';
  refMax: number;                         // value that maps to the top of the colour ramp
  value: (row: number, col: number) => number | null; // row 0 = south, col 0 = west
}

export const SCAN = {
  version: 'scan-v2',
  beats: 11,
  notesPerBeat: 2,
  latRange: [-10, 30] as [number, number],
  region: { name: 'Philippine sector', lonMin: 116, lonMax: 127.5 },
};

export const cellLat = (g: ScanGrid, r: number) => +(g.latMin + (r + 0.5) * g.step).toFixed(2);
export const cellLon = (g: ScanGrid, c: number) => +(g.lonMin + (c + 0.5) * g.step).toFixed(2);

export interface LatBand { index: number; midi: number; lo: number; hi: number }

/** The fixed latitude → note table: one scale note per equal latitude band over SCAN.latRange, south = lowest. */
export function latitudeBands(notes: number[], latRange = SCAN.latRange): LatBand[] {
  const [lo, hi] = latRange;
  const w = (hi - lo) / notes.length;
  return notes.map((midi, index) => ({ index, midi, lo: +(lo + index * w).toFixed(3), hi: +(lo + (index + 1) * w).toFixed(3) }));
}

export function latitudeNote(lat: number, notes: number[], latRange = SCAN.latRange): LatBand {
  const bands = latitudeBands(notes, latRange);
  const [lo, hi] = latRange;
  const i = Math.max(0, Math.min(bands.length - 1, Math.floor(((lat - lo) / (hi - lo)) * bands.length)));
  return bands[i];
}

export const fmtLat = (lat: number) => `${Math.abs(+lat.toFixed(1))}°${lat >= 0 ? 'N' : 'S'}`;
export const bandLabel = (b: LatBand) => `${fmtLat(b.lo)}–${fmtLat(b.hi)}`;

/** Grid view over the decoded SVS frame-scan bytes for one day (mm/day, image-derived). */
export function frameGrid(doc: FrameScanDoc, bytes: Uint8Array, dayIndex: number): ScanGrid {
  const { ncol, nrow, lonMin, latMin, step, scale, unknown } = doc.grid;
  const base = dayIndex * nrow * ncol;
  return {
    ncol, nrow, lonMin, latMin, step, unit: 'mm/day', derivation: 'image-derived', refMax: 24,
    value: (r, c) => { const b = bytes[base + r * ncol + c]; return b === unknown || b === undefined ? null : b * scale; },
  };
}

/** Grid view over the measured IMERG raster for one month, coarsened by `factor` cells (mean of valid cells). */
export function imergGrid(g: Grid, monthIndex: number, factor = 5): ScanGrid {
  const ncol = Math.floor(g.nlon / factor), nrow = Math.floor(g.nlat / factor);
  const cache = new Float64Array(ncol * nrow).fill(NaN);
  for (let r = 0; r < nrow; r++) for (let c = 0; c < ncol; c++) {
    let s = 0, n = 0;
    for (let j = r * factor; j < (r + 1) * factor; j++) for (let i = c * factor; i < (c + 1) * factor; i++) {
      const v = cellValue(g, monthIndex, j, i);
      if (v != null) { s += v; n++; }
    }
    if (n >= (factor * factor) / 2) cache[r * ncol + c] = s / n;
  }
  return {
    ncol, nrow, lonMin: g.lon0 - g.step / 2, latMin: g.lat0 - g.step / 2, step: g.step * factor,
    unit: 'mm/hr', derivation: 'measured', refMax: 1.5,
    value: (r, c) => { const v = cache[r * ncol + c]; return Number.isNaN(v) ? null : v; },
  };
}

/** Mean of known cells per column, west → east (the frame's sweep profile). */
export function columnProfile(g: ScanGrid): (number | null)[] {
  return Array.from({ length: g.ncol }, (_, c) => {
    let s = 0, n = 0;
    for (let r = 0; r < g.nrow; r++) { const v = g.value(r, c); if (v != null) { s += v; n++; } }
    return n ? s / n : null;
  });
}

/** Column range [c0, c1) of beat `b` out of `beats`. */
export function beatColumns(g: ScanGrid, b: number, beats = SCAN.beats): [number, number] {
  const n = Math.min(beats, g.ncol);
  return [Math.floor((b * g.ncol) / n), Math.floor(((b + 1) * g.ncol) / n)];
}
export function beatLonRange(g: ScanGrid, b: number, beats = SCAN.beats): [number, number] {
  const [c0, c1] = beatColumns(g, b, beats);
  return [+(g.lonMin + c0 * g.step).toFixed(2), +(g.lonMin + c1 * g.step).toFixed(2)];
}
export function beatInRegion(g: ScanGrid, b: number, beats = SCAN.beats): boolean {
  const [w, e] = beatLonRange(g, b, beats);
  return e > SCAN.region.lonMin && w < SCAN.region.lonMax;
}

export interface ScanOptions {
  scale: string; pitchLow: number; pitchHigh: number;
  stepIndex: number; t: string; label: string; datasetId: string; selectionId: string;
  offsetStart?: number; span?: number;   // fraction of the step occupied by the sweep
  beats?: number;
  regionTicks?: boolean;                 // soft tick on beats inside the Philippine sector (default true)
}

export interface BeatSummary { beat: number; lon: [number, number]; inRegion: boolean; notes: { band: LatBand; mean: number; intensity: IntensityClass; row: number; col: number }[] }

/** Per-beat analysis of a frame: the wettest latitude bands of each beat (empty = rest). Deterministic. */
export function analyzeBeats(g: ScanGrid, o: { scale: string; pitchLow: number; pitchHigh: number; beats?: number }): BeatSummary[] {
  const notes = scaleNotes(o.scale, o.pitchLow, o.pitchHigh);
  const beats = Math.min(o.beats ?? SCAN.beats, g.ncol);
  const out: BeatSummary[] = [];
  for (let b = 0; b < beats; b++) {
    const [c0, c1] = beatColumns(g, b, beats);
    const acc = new Map<number, { band: LatBand; s: number; n: number; best: number; row: number; col: number }>();
    for (let r = 0; r < g.nrow; r++) {
      const band = latitudeNote(cellLat(g, r), notes);
      for (let c = c0; c < c1; c++) {
        const v = g.value(r, c);
        if (v == null) continue;
        const a = acc.get(band.index) ?? { band, s: 0, n: 0, best: -1, row: r, col: c };
        a.s += v; a.n++;
        if (v > a.best) { a.best = v; a.row = r; a.col = c; }
        acc.set(band.index, a);
      }
    }
    const cand = [...acc.values()].map((a) => ({ band: a.band, mean: a.s / a.n, row: a.row, col: a.col, intensity: intensityClass(toMmDay(a.s / a.n, g.unit)) }))
      .filter((x) => x.intensity !== 'dry')
      .sort((x, y) => y.mean - x.mean || x.band.index - y.band.index)
      .slice(0, SCAN.notesPerBeat);
    out.push({ beat: b, lon: beatLonRange(g, b, beats), inRegion: beatInRegion(g, b, beats), notes: cand });
  }
  return out;
}

/** Notes for one sweep across the grid: 11 beats west → east, pitch = latitude band, loudness = rain class. */
export function scanEvents(g: ScanGrid, o: ScanOptions): SoundEvent[] {
  const start = o.offsetStart ?? 0, span = o.span ?? 1;
  const beats = analyzeBeats(g, o);
  const nb = beats.length;
  const events: SoundEvent[] = [];
  const digits = g.unit === 'mm/day' ? 1 : 3;
  for (const bt of beats) {
    const offset = start + span * (bt.beat / nb);
    const pan = +((nb > 1 ? bt.beat / (nb - 1) : 0.5) * 2 - 1).toFixed(3);
    const lonText = `${bt.lon[0]}–${bt.lon[1]}°E`;
    if (bt.inRegion && (o.regionTicks ?? true)) {
      events.push({
        id: `${o.datasetId}|scan|${o.t}|b${bt.beat}:region`, kind: 'marker', marker: 'region', stepIndex: o.stepIndex,
        sourceObservationIds: [], datasetId: o.datasetId, selectionId: o.selectionId,
        original: { value: null, unit: g.unit, t: o.t, label: o.label, derivation: g.derivation },
        offset, duration: 0.05, pan, mappingVersion: SCAN.version,
        scan: { col: beatColumns(g, bt.beat, nb)[0], row: -1, lat: NaN, lon: +((bt.lon[0] + bt.lon[1]) / 2).toFixed(2), beat: bt.beat },
        explanation: `${o.label}: beat ${bt.beat + 1} (${lonText}) is in the ${SCAN.region.name}; a soft tick marks it.`,
      });
    }
    for (const n of bt.notes) {
      const lat = +((n.band.lo + n.band.hi) / 2).toFixed(2), lon = +((bt.lon[0] + bt.lon[1]) / 2).toFixed(2);
      events.push({
        id: `${o.datasetId}|scan|${o.t}|b${bt.beat}:${n.band.index}`, kind: 'scan', stepIndex: o.stepIndex,
        sourceObservationIds: [`${o.datasetId}|${o.t}|lat ${n.band.lo}..${n.band.hi}, lon ${bt.lon[0]}..${bt.lon[1]}`], datasetId: o.datasetId, selectionId: o.selectionId,
        original: { value: +n.mean.toFixed(3), unit: g.unit, t: o.t, label: o.label, derivation: g.derivation },
        offset, duration: (span / nb) * 0.9,
        midi: n.band.midi, note: midiToName(n.band.midi), velocity: INTENSITY.velocity[n.intensity], pan,
        scan: { col: n.col, row: n.row, lat, lon, beat: bt.beat, latBand: [n.band.lo, n.band.hi], intensity: n.intensity }, mappingVersion: SCAN.version,
        explanation: `${o.label}: beat ${bt.beat + 1} of ${nb} (${lonText}), latitude band ${bandLabel(n.band)} → ${midiToName(n.band.midi)}; mean ${n.mean.toFixed(digits)} ${g.unit} = ${n.intensity} rain (${g.derivation}). Pitch = latitude, loudness = rain class, silence = dry.`,
      });
    }
  }
  return events;
}

/** The audio-cursor tone for one cell, using the same latitude table and rain classes. Null when dry or unknown. */
export function cellEvent(g: ScanGrid, row: number, col: number, o: { scale: string; pitchLow: number; pitchHigh: number }): SoundEvent | null {
  const v = g.value(row, col);
  if (v == null) return null;
  const intensity = intensityClass(toMmDay(v, g.unit));
  if (intensity === 'dry') return null;
  const notes = scaleNotes(o.scale, o.pitchLow, o.pitchHigh);
  const lat = cellLat(g, row), lon = cellLon(g, col);
  const band = latitudeNote(lat, notes);
  return {
    id: `cursor|${row}:${col}`, kind: 'scan', stepIndex: 0, sourceObservationIds: [], datasetId: 'cursor', selectionId: 'cursor',
    original: { value: +v.toFixed(3), unit: g.unit, t: 'cursor', label: 'cursor', derivation: g.derivation },
    offset: 0, duration: 1, midi: band.midi, note: midiToName(band.midi), velocity: INTENSITY.velocity[intensity], pan: 0,
    scan: { col, row, lat, lon, latBand: [band.lo, band.hi], intensity }, mappingVersion: SCAN.version,
    explanation: `${fmtLat(lat)}, ${lon}°E → ${midiToName(band.midi)} (${intensity})`,
  };
}

/** Rain-band latitude → a sustained "feature" voice per day on the same latitude table; trend turning points become markers. */
export function featureEvents(days: FrameFeature[], o: { scale: string; pitchLow: number; pitchHigh: number }): SoundEvent[][] {
  const notes = scaleNotes(o.scale, o.pitchLow, o.pitchHigh);
  return days.map((d, i) => {
    const out: SoundEvent[] = [];
    const t = `D${String(d.day).padStart(3, '0')}`;
    const base = { datasetId: 'svs5478-frames', selectionId: 'feature:rain-band', sourceObservationIds: [`svs5478-frames|${t}|band`], mappingVersion: SCAN.version, stepIndex: i };
    if (d.bandLat != null) {
      const band = latitudeNote(d.bandLat, notes);
      const cls = intensityClass(d.bandPeakMmDay);
      out.push({
        ...base, id: `svs5478-frames|band|${t}`, kind: 'feature', offset: 0, duration: 1, midi: band.midi, note: midiToName(band.midi),
        velocity: Math.max(0.25, INTENSITY.velocity[cls]), pan: 0,
        original: { value: d.bandLat, unit: 'mm/day', t, label: d.label, derivation: 'image-derived' },
        explanation: `${d.label}: heaviest rain band near ${fmtLat(d.bandLat)} in the Philippine sector → ${midiToName(band.midi)} (band ${bandLabel(band)}, same latitude table as the sweep); ${d.bandPeakMmDay.toFixed(1)} mm/day peak = ${cls}; ${d.bandTrend === 'steady' ? 'holding steady' : `moving ${d.bandTrend}`}.`,
      });
    }
    const prev = days[(i - 1 + days.length) % days.length];
    if (prev.bandTrend !== 'steady' && d.bandTrend !== 'steady' && prev.bandTrend !== d.bandTrend) {
      out.push({
        ...base, id: `svs5478-frames|turn|${t}`, kind: 'marker', marker: 'turn', offset: 0, duration: 0.1,
        original: { value: d.bandLat, unit: 'mm/day', t, label: d.label, derivation: 'image-derived' },
        explanation: `${d.label}: the rain band turns ${d.bandTrend}ward.`,
      });
    }
    return out;
  });
}
