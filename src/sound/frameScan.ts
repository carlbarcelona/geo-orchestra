import type { FrameFeature, FrameScanDoc, SoundEvent } from '../contracts';
import { cellValue, type Grid } from '../data/dataset';
import { midiToName, scaleNotes } from './mapping';

/**
 * Frame scan — the NASA/Hubble image-sonification approach applied to a rainfall frame:
 * a line sweeps west → east (time), latitude sets pitch (north = higher), rainfall sets loudness.
 * Unknown cells are silent. Every scan note keeps its location, raw value and derivation.
 */
export interface ScanGrid {
  ncol: number; nrow: number; lonMin: number; latMin: number; step: number;
  unit: 'mm/day' | 'mm/hr';
  derivation: 'image-derived' | 'measured';
  refMax: number;                         // value that maps to full loudness
  value: (row: number, col: number) => number | null; // row 0 = south, col 0 = west
}

export const SCAN = { version: 'scan-v1', maxNotesPerColumn: 4, lightRainFraction: 2 / 24 };

export const cellLat = (g: ScanGrid, r: number) => +(g.latMin + (r + 0.5) * g.step).toFixed(2);
export const cellLon = (g: ScanGrid, c: number) => +(g.lonMin + (c + 0.5) * g.step).toFixed(2);

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

export interface ScanOptions {
  scale: string; pitchLow: number; pitchHigh: number;
  stepIndex: number; t: string; label: string; datasetId: string; selectionId: string;
  offsetStart?: number; span?: number;   // fraction of the step occupied by the sweep
}

/** Notes for one sweep across the grid. Deterministic. */
export function scanEvents(g: ScanGrid, o: ScanOptions): SoundEvent[] {
  const notes = scaleNotes(o.scale, o.pitchLow, o.pitchHigh);
  const start = o.offsetStart ?? 0, span = o.span ?? 1;
  const thresh = SCAN.lightRainFraction * g.refMax;
  const events: SoundEvent[] = [];
  for (let c = 0; c < g.ncol; c++) {
    // strongest rows first, one note per pitch, only rows with at least light rain
    const byNote = new Map<number, { r: number; v: number }>();
    for (let r = 0; r < g.nrow; r++) {
      const v = g.value(r, c);
      if (v == null || v < thresh) continue;
      const midi = notes[Math.round((r / Math.max(1, g.nrow - 1)) * (notes.length - 1))];
      const cur = byNote.get(midi);
      if (!cur || v > cur.v) byNote.set(midi, { r, v });
    }
    const top = [...byNote.entries()].sort((a, b) => b[1].v - a[1].v || a[0] - b[0]).slice(0, SCAN.maxNotesPerColumn);
    for (const [midi, { r, v }] of top) {
      const lat = cellLat(g, r), lon = cellLon(g, c);
      const n = Math.sqrt(Math.min(1, v / g.refMax));
      events.push({
        id: `${o.datasetId}|scan|${o.t}|${c}:${r}`, kind: 'scan', stepIndex: o.stepIndex,
        sourceObservationIds: [`${o.datasetId}|${o.t}|${lat},${lon}`], datasetId: o.datasetId, selectionId: o.selectionId,
        original: { value: +v.toFixed(3), unit: g.unit, t: o.t, label: o.label, derivation: g.derivation },
        offset: start + span * (c / g.ncol), duration: (span / g.ncol) * 1.8,
        midi, note: midiToName(midi), velocity: +(0.12 + 0.8 * n).toFixed(3), pan: +((c / Math.max(1, g.ncol - 1)) * 2 - 1).toFixed(3),
        scan: { col: c, row: r, lat, lon }, mappingVersion: SCAN.version,
        explanation: `${o.label}: ${lat}°, ${lon}°E — ${v.toFixed(g.unit === 'mm/day' ? 1 : 3)} ${g.unit} (${g.derivation}) → ${midiToName(midi)}. Sweep west→east; higher pitch = farther north; louder = more rain.`,
      });
    }
  }
  return events;
}

/** Rain-band latitude → a sustained "feature" voice per day; trend turning points become markers. */
export function featureEvents(days: FrameFeature[], o: { scale: string; pitchLow: number; pitchHigh: number; latRange?: [number, number] }): SoundEvent[][] {
  const notes = scaleNotes(o.scale, o.pitchLow, o.pitchHigh);
  const [lo, hi] = o.latRange ?? [-10, 30];
  return days.map((d, i) => {
    const out: SoundEvent[] = [];
    const t = `D${String(d.day).padStart(3, '0')}`;
    const base = { datasetId: 'svs5478-frames', selectionId: 'feature:rain-band', sourceObservationIds: [`svs5478-frames|${t}|band`], mappingVersion: SCAN.version, stepIndex: i };
    if (d.bandLat != null) {
      const midi = notes[Math.round(Math.max(0, Math.min(1, (d.bandLat - lo) / (hi - lo))) * (notes.length - 1))];
      out.push({
        ...base, id: `svs5478-frames|band|${t}`, kind: 'feature', offset: 0, duration: 1, midi, note: midiToName(midi),
        velocity: +(0.2 + 0.5 * Math.min(1, d.bandPeakMmDay / 24)).toFixed(3), pan: 0,
        original: { value: d.bandLat, unit: 'mm/day', t, label: d.label, derivation: 'image-derived' },
        explanation: `${d.label}: heaviest rain band near ${d.bandLat.toFixed(1)}°${d.bandLat >= 0 ? 'N' : 'S'} in the Philippine sector (${d.bandPeakMmDay.toFixed(1)} mm/day peak) → ${midiToName(midi)}; ${d.bandTrend === 'steady' ? 'holding steady' : `moving ${d.bandTrend}`}.`,
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
