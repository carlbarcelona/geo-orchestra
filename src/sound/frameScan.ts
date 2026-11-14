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
  /** Latitudes covered by the pitch table for this frame (default SCAN.latRange, the Philippine view). */
  latRange?: [number, number];
  /** Beats in one sweep (default SCAN.beats). */
  beats?: number;
  /** Human name of the area being swept, for explanations. */
  area?: string;
}

export const SCAN = {
  version: 'scan-v3',
  beats: 11,
  notesPerBeat: 2,
  latRange: [-10, 30] as [number, number],
  region: { name: 'Philippine sector', lonMin: 116, lonMax: 127.5 },
  /** Whole-frame sweep (scan-v3): the pitch table spans the frame's rain-bearing latitudes. */
  global: { latRange: [-60, 60] as [number, number], beats: 24 },
  /** A rain system is a connected patch of cells at heavy rain or more (colorbar green, 8 mm/day). */
  system: { thresholdMmDay: 8, minCells: 3 },
  secondsPerBeat: 0.42,
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

/** Grid view over the whole decoded SVS frame (2.5° cells, 180°W–180°E) for one day. */
export function frameGridGlobal(doc: FrameScanDoc, bytes: Uint8Array, dayIndex: number): ScanGrid | null {
  const gg = doc.globalGrid;
  if (!gg) return null;
  const base = dayIndex * gg.nrow * gg.ncol;
  return {
    ncol: gg.ncol, nrow: gg.nrow, lonMin: gg.lonMin, latMin: gg.latMin, step: gg.step, unit: 'mm/day', derivation: 'image-derived', refMax: 24,
    latRange: SCAN.global.latRange, beats: SCAN.global.beats, area: 'whole frame',
    value: (r, c) => { const b = bytes[base + r * gg.ncol + c]; return b === gg.unknown || b === undefined ? null : b * gg.scale; },
  };
}

export interface CropBox { lonMin: number; lonMax: number; latMin: number; latMax: number }

export const fmtLon = (lon: number) => `${Math.abs(+lon.toFixed(1))}°${lon >= 0 ? 'E' : 'W'}`;

/** The part of a grid inside `box` (snapped to whole cells). The pitch table then spans the crop's latitudes. */
export function cropGrid(g: ScanGrid, box: CropBox): ScanGrid | null {
  const c0 = Math.max(0, Math.floor((box.lonMin - g.lonMin) / g.step)), c1 = Math.min(g.ncol, Math.ceil((box.lonMax - g.lonMin) / g.step));
  const r0 = Math.max(0, Math.floor((box.latMin - g.latMin) / g.step)), r1 = Math.min(g.nrow, Math.ceil((box.latMax - g.latMin) / g.step));
  if (c1 - c0 < 2 || r1 - r0 < 2) return null;
  const lonMin = g.lonMin + c0 * g.step, latMin = g.latMin + r0 * g.step;
  const ncol = c1 - c0, nrow = r1 - r0;
  return {
    ...g, ncol, nrow, lonMin, latMin,
    latRange: [latMin, latMin + nrow * g.step],
    beats: Math.max(4, Math.min(SCAN.global.beats, Math.round(ncol / 2))),
    area: `crop ${fmtLon(lonMin)}–${fmtLon(lonMin + ncol * g.step)}, ${fmtLat(latMin)}–${fmtLat(latMin + nrow * g.step)}`,
    value: (r, c) => g.value(r + r0, c + c0),
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
  systems?: boolean;                     // a sustained voice per detected rain system (default true)
}

export interface BeatSummary { beat: number; lon: [number, number]; inRegion: boolean; notes: { band: LatBand; mean: number; intensity: IntensityClass; row: number; col: number }[] }

/** Per-beat analysis of a frame: the wettest latitude bands of each beat (empty = rest). Deterministic. */
export function analyzeBeats(g: ScanGrid, o: { scale: string; pitchLow: number; pitchHigh: number; beats?: number }): BeatSummary[] {
  const notes = scaleNotes(o.scale, o.pitchLow, o.pitchHigh);
  const beats = Math.min(o.beats ?? g.beats ?? SCAN.beats, g.ncol);
  const range = g.latRange ?? SCAN.latRange;
  const out: BeatSummary[] = [];
  for (let b = 0; b < beats; b++) {
    const [c0, c1] = beatColumns(g, b, beats);
    const acc = new Map<number, { band: LatBand; s: number; n: number; best: number; row: number; col: number }>();
    for (let r = 0; r < g.nrow; r++) {
      const lat = cellLat(g, r);
      if (lat < range[0] || lat > range[1]) continue;
      const band = latitudeNote(lat, notes, range);
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
  const events: SoundEvent[] = o.systems === false ? [] : systemEvents(detectSystems(g), g, o);
  const digits = g.unit === 'mm/day' ? 1 : 3;
  for (const bt of beats) {
    const offset = start + span * (bt.beat / nb);
    const pan = +((nb > 1 ? bt.beat / (nb - 1) : 0.5) * 2 - 1).toFixed(3);
    const lonText = `${fmtLon(bt.lon[0])}–${fmtLon(bt.lon[1])}`;
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
  const band = latitudeNote(lat, notes, g.latRange ?? SCAN.latRange);
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

// ------------------------------------------------------------------ rain systems (scan-v3)

export interface RainSystem {
  id: number;
  zone: 'tropical' | 'extratropical';
  cells: number;
  /** value-weighted centre */
  lat: number; lon: number;
  colRange: [number, number];             // first and last column (inclusive)
  lonRange: [number, number];
  latRange: [number, number];
  /** per column: lowest and highest row the system covers (what the scan line lights up) */
  extents: Map<number, [number, number]>;
  peak: number; mean: number;
  intensity: IntensityClass;
  /** direction of the long axis in degrees, counter-clockwise from east (0 = east–west, 90 = north–south) */
  orientation: number;
  /** long axis ÷ short axis; 1 = round */
  elongation: number;
}

/**
 * Rain systems: 8-connected patches of cells at heavy rain or more, inside the frame's pitch range.
 * Deterministic; numbered west → east. They are listening and viewing aids derived from the frame,
 * never new measurements.
 */
export function detectSystems(g: ScanGrid): RainSystem[] {
  const thr = SCAN.system.thresholdMmDay;
  const range = g.latRange ?? [-90, 90];
  const wet = (r: number, c: number) => {
    const lat = cellLat(g, r);
    if (lat < range[0] || lat > range[1]) return false;
    const v = g.value(r, c);
    return v != null && toMmDay(v, g.unit) >= thr;
  };
  const seen = new Uint8Array(g.nrow * g.ncol);
  const out: RainSystem[] = [];
  for (let c0 = 0; c0 < g.ncol; c0++) for (let r0 = 0; r0 < g.nrow; r0++) {
    if (seen[r0 * g.ncol + c0] || !wet(r0, c0)) continue;
    const cells: [number, number, number][] = [];
    const stack: [number, number][] = [[r0, c0]];
    seen[r0 * g.ncol + c0] = 1;
    while (stack.length) {
      const [r, c] = stack.pop()!;
      cells.push([r, c, g.value(r, c)!]);
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if ((dr || dc) && rr >= 0 && cc >= 0 && rr < g.nrow && cc < g.ncol && !seen[rr * g.ncol + cc] && wet(rr, cc)) {
          seen[rr * g.ncol + cc] = 1;
          stack.push([rr, cc]);
        }
      }
    }
    if (cells.length < SCAN.system.minCells) continue;
    let w = 0, sr = 0, sc = 0, peak = 0;
    const extents = new Map<number, [number, number]>();
    let cmin = Infinity, cmax = -Infinity, rmin = Infinity, rmax = -Infinity;
    for (const [r, c, v] of cells) {
      w += v; sr += r * v; sc += c * v; peak = Math.max(peak, v);
      const e = extents.get(c);
      extents.set(c, e ? [Math.min(e[0], r), Math.max(e[1], r)] : [r, r]);
      cmin = Math.min(cmin, c); cmax = Math.max(cmax, c); rmin = Math.min(rmin, r); rmax = Math.max(rmax, r);
    }
    const mr = sr / w, mc = sc / w;
    // principal axis of the cell cloud (east = +x, north = +y)
    let xx = 0, yy = 0, xy = 0;
    for (const [r, c] of cells) { const dx = c - mc, dy = r - mr; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
    const ang = 0.5 * Math.atan2(2 * xy, xx - yy);
    const tr = xx + yy, det = Math.sqrt(Math.max(0, (xx - yy) ** 2 + 4 * xy * xy));
    const l1 = (tr + det) / 2, l2 = Math.max((tr - det) / 2, 1e-6);
    const lat = +(g.latMin + (mr + 0.5) * g.step).toFixed(2);
    out.push({
      id: 0, zone: Math.abs(lat) <= 23.5 ? 'tropical' : 'extratropical', cells: cells.length,
      lat, lon: +(g.lonMin + (mc + 0.5) * g.step).toFixed(2),
      colRange: [cmin, cmax], lonRange: [+(g.lonMin + cmin * g.step).toFixed(2), +(g.lonMin + (cmax + 1) * g.step).toFixed(2)],
      latRange: [+(g.latMin + rmin * g.step).toFixed(2), +(g.latMin + (rmax + 1) * g.step).toFixed(2)],
      extents, peak: +peak.toFixed(2), mean: +(w / cells.length).toFixed(2), intensity: intensityClass(toMmDay(peak, g.unit)),
      orientation: +((((ang * 180) / Math.PI) + 180) % 180).toFixed(0), elongation: +Math.min(99, Math.sqrt(l1 / l2)).toFixed(2),
    });
  }
  out.sort((a, b) => a.colRange[0] - b.colRange[0] || a.lat - b.lat);
  out.forEach((s, i) => { s.id = i + 1; });
  return out;
}

export function describeShape(s: RainSystem): string {
  if (s.elongation < 1.6) return 'compact';
  const o = s.orientation;
  const dir = o < 22.5 || o >= 157.5 ? 'east–west' : o < 67.5 ? 'southwest–northeast' : o < 112.5 ? 'north–south' : 'northwest–southeast';
  return `stretched ${dir}`;
}

/**
 * One sustained voice per rain system, from the moment the scan line enters it until it leaves.
 * Pitch = the system's centre latitude on the frame's table; loudness = its peak rain class;
 * timbre = zone (tropical systems a warm pad, extratropical storm tracks a darker horn).
 */
export function systemEvents(systems: RainSystem[], g: ScanGrid, o: ScanOptions): SoundEvent[] {
  const notes = scaleNotes(o.scale, o.pitchLow, o.pitchHigh);
  const range = g.latRange ?? SCAN.latRange;
  const start = o.offsetStart ?? 0, span = o.span ?? 1;
  const digits = g.unit === 'mm/day' ? 1 : 3;
  return systems.map((s): SoundEvent => {
    const band = latitudeNote(s.lat, notes, range);
    const enter = s.colRange[0] / g.ncol, leave = (s.colRange[1] + 1) / g.ncol;
    return {
      id: `${o.datasetId}|system|${o.t}|${s.id}`, kind: 'system', stepIndex: o.stepIndex,
      sourceObservationIds: [`${o.datasetId}|${o.t}|system ${s.id}`], datasetId: o.datasetId, selectionId: o.selectionId,
      original: { value: s.peak, unit: g.unit, t: o.t, label: o.label, derivation: g.derivation },
      offset: start + span * enter, duration: Math.max(span * (leave - enter), span * 0.03),
      midi: band.midi, note: midiToName(band.midi), velocity: Math.max(0.3, INTENSITY.velocity[s.intensity]),
      pan: +((((s.colRange[0] + s.colRange[1]) / 2) / Math.max(1, g.ncol - 1)) * 2 - 1).toFixed(3),
      system: { id: s.id, zone: s.zone, lat: s.lat, lon: s.lon, lonRange: s.lonRange, latRange: s.latRange, cells: s.cells, peak: s.peak, orientation: s.orientation, intensity: s.intensity },
      mappingVersion: SCAN.version,
      explanation: `${o.label}: rain system ${s.id} (${s.zone}), ${fmtLon(s.lonRange[0])}–${fmtLon(s.lonRange[1])}, ${fmtLat(s.latRange[0])}–${fmtLat(s.latRange[1])}, ${describeShape(s)}; peak ${s.peak.toFixed(digits)} ${g.unit} (${s.intensity}, ${g.derivation}) → ${midiToName(band.midi)} held while the line crosses it.`,
    };
  });
}
