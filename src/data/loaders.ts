import { ProcessedFileSchema, type DatasetManifest } from '../contracts';
import { areaMean } from './aggregate';
import type { AreaRegion, AreaSeriesPoint, Dataset, GeoJSONFeatureCollection, Grid } from './dataset';

const BASE = `${import.meta.env.BASE_URL}data/imerg-ph/`;

export type Progress = (fraction: number, message: string) => void;

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

async function fetchBinary(url: string, onBytes: (n: number) => void, signal?: AbortSignal): Promise<ArrayBuffer> {
  const r = await fetch(url, { signal });
  if (!r.ok || !r.body) throw new Error(`${url} → HTTP ${r.status}`);
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); n += value.length; onBytes(n);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out.buffer;
}

interface RegionsDoc {
  months: string[]; regions: AreaRegion[]; samples: Dataset['samples'];
  cellRegion: { data: number[] };
}

/** Load the bundled, pre-processed NASA IMERG V07B Philippines package (no live NASA connection needed). */
export async function loadNasaSample(progress: Progress, signal?: AbortSignal): Promise<Dataset> {
  progress(0.02, 'Reading dataset manifest');
  const manifest = await fetchJson<DatasetManifest>(BASE + 'manifest.json', signal);
  if (manifest.unit !== 'mm/hr') throw new Error(`Unsupported unit "${manifest.unit}"`);
  const g = manifest.grid!;
  const [regions, outline, validation] = await Promise.all([
    fetchJson<RegionsDoc>(BASE + 'regions.json', signal),
    fetchJson<GeoJSONFeatureCollection>(BASE + 'outline.json', signal),
    fetchJson<Record<string, unknown>>(BASE + 'validation.json', signal).catch(() => undefined),
  ]);
  progress(0.1, 'Downloading precipitation grid');
  const expected = regions.months.length * g.nlat * g.nlon * 2;
  let pBytes = 0, eBytes = 0;
  const report = () => progress(0.1 + 0.85 * ((pBytes + eBytes) / (2 * expected)), `Downloading grid ${(((pBytes + eBytes) / 1e6)).toFixed(1)} / ${((2 * expected) / 1e6).toFixed(1)} MB`);
  const [pBuf, eBuf] = await Promise.all([
    fetchBinary(BASE + g.precipitation.path, (n) => { pBytes = n; report(); }, signal),
    g.randomError ? fetchBinary(BASE + g.randomError.path, (n) => { eBytes = n; report(); }, signal) : Promise.resolve(undefined),
  ]);
  if (pBuf.byteLength !== expected) throw new Error(`Grid size mismatch: expected ${expected} bytes, received ${pBuf.byteLength}`);
  const grid: Grid = {
    nlat: g.nlat, nlon: g.nlon, lat0: g.lat0, lon0: g.lon0, step: g.step,
    precip: new Uint16Array(pBuf), error: eBuf ? new Uint16Array(eBuf) : undefined,
    scale: g.precipitation.scale, errorScale: g.randomError?.scale ?? 0, missing: g.precipitation.missing,
  };
  progress(1, 'Ready');
  return {
    id: manifest.datasetId, kind: 'nasa', title: manifest.title, manifest, months: regions.months, grid,
    regions: regions.regions, samples: regions.samples, outline, cellRegion: Uint8Array.from(regions.cellRegion.data), validation,
  };
}

// ------------------------------------------------------------------------------------------------
// Synthetic demo: generated values over the same geometry, visibly labelled, never mixed with NASA data.
// ------------------------------------------------------------------------------------------------
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function buildSyntheticDemo(progress: Progress): Promise<Dataset> {
  progress(0.1, 'Loading geometry for the synthetic demo');
  // Geometry only (outline + cell membership); no NASA values are read.
  const [regionsDoc, outline] = await Promise.all([
    fetchJson<RegionsDoc>(BASE + 'regions.json'),
    fetchJson<GeoJSONFeatureCollection>(BASE + 'outline.json'),
  ]);
  const nlat = 170, nlon = 115, lat0 = 4.55, lon0 = 116.05, step = 0.1;
  const months: string[] = [];
  for (let y = 2022; y <= 2024; y++) for (let m = 1; m <= 12; m++) months.push(`${y}-${String(m).padStart(2, '0')}`);
  const missing = 65535;
  const precip = new Uint16Array(months.length * nlat * nlon);
  const rand = mulberry32(42);
  months.forEach((t, ti) => {
    const m = Number(t.slice(5));
    const season = 0.35 + 0.3 * Math.sin(((m - 4) / 12) * 2 * Math.PI);
    for (let j = 0; j < nlat; j++) {
      const lat = lat0 + j * step;
      for (let i = 0; i < nlon; i++) {
        const idx = (ti * nlat + j) * nlon + i;
        if (t === '2023-04') { precip[idx] = missing; continue; } // a deliberately missing month
        if (t === '2024-03' && lat > 15 && lat < 19) { precip[idx] = 0; continue; } // deliberate zero-rain band
        const v = Math.max(0, season * (1 + 0.4 * Math.sin(lat / 3 + i / 17)) + (rand() - 0.5) * 0.08);
        precip[idx] = Math.round(v * 1000);
      }
    }
  });
  const grid: Grid = { nlat, nlon, lat0, lon0, step, precip, scale: 0.001, errorScale: 0, missing };
  const cellRegion = Uint8Array.from(regionsDoc.cellRegion.data);
  const lats = new Float64Array(nlat * nlon);
  for (let j = 0; j < nlat; j++) for (let i = 0; i < nlon; i++) lats[j * nlon + i] = lat0 + j * step;
  const regionCodes: Record<string, number[]> = { philippines: [1, 2, 3, 4], luzon: [1], visayas: [2], mindanao: [3] };
  const regions: AreaRegion[] = regionsDoc.regions.map((r) => {
    const mask = Array.from(cellRegion, (c) => regionCodes[r.id]?.includes(c) ?? false);
    const series: AreaSeriesPoint[] = months.map((t, ti) => {
      const vals = Array.from({ length: nlat * nlon }, (_, k) => {
        const raw = precip[ti * nlat * nlon + k];
        return raw === missing ? null : raw * 0.001;
      });
      const res = areaMean(vals, lats, mask, r.minCoverage);
      return { t, value: res.value, coverage: res.coverage, validCells: res.validCells, quality: res.quality, randomError: null };
    });
    return { ...r, series };
  });
  const samples = regionsDoc.samples.map((s) => ({
    ...s,
    series: months.map((t, ti) => {
      const raw = precip[(ti * nlat + s.cell.latIndex) * nlon + s.cell.lonIndex];
      const value = raw === missing ? null : raw * 0.001;
      return { t, value, quality: value == null ? 'missing' as const : 'valid' as const };
    }),
  }));
  const manifest: DatasetManifest = {
    contract: 'dataset-manifest', version: 1, datasetId: 'synthetic-demo', datasetVersion: 'synthetic v1',
    title: 'SYNTHETIC demo rainfall (not NASA data)', variable: 'precipitation', unit: 'mm/hr', cadence: 'monthly',
    unitNote: 'Generated values for demonstration only. Includes a missing month (Apr 2023) and a zero-rain band (Mar 2024, 15–19°N).',
    coverage: { start: months[0], end: months[months.length - 1], count: months.length },
    source: { provider: 'GeoOrchestra synthetic generator (seed 42) — NOT a measurement' },
    preparation: { script: 'src/data/loaders.ts#buildSyntheticDemo', boundaries: 'Natural Earth 10m (geometry only)' },
  };
  progress(1, 'Ready');
  return { id: 'synthetic-demo', kind: 'synthetic', title: manifest.title, manifest, months, grid, regions, samples, outline, cellRegion };
}

// ------------------------------------------------------------------------------------------------
// Processed JSON import (documented format; see docs/processed-format.md)
// ------------------------------------------------------------------------------------------------
export interface ImportResult { dataset?: Dataset; errors: string[]; warnings: string[] }

export function parseProcessedFile(text: string, fileName: string): ImportResult {
  let json: unknown;
  try { json = JSON.parse(text); } catch (e) { return { errors: [`${fileName} is not valid JSON: ${(e as Error).message}`], warnings: [] }; }
  const parsed = ProcessedFileSchema.safeParse(json);
  if (!parsed.success) {
    return { errors: parsed.error.issues.slice(0, 12).map((i) => `${i.path.join('.') || 'file'}: ${i.message}`), warnings: [] };
  }
  const f = parsed.data;
  const warnings: string[] = [];
  const months = [...new Set(f.records.map((r) => r.timestamp))].sort();
  const keyOf = (lat: number, lon: number) => `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const byPoint = new Map<string, { lat: number; lon: number; region?: string; vals: Map<string, number | null> }>();
  const seen = new Set<string>();
  let dupes = 0;
  for (const r of f.records) {
    const k = keyOf(r.latitude, r.longitude);
    const dk = `${k}|${r.timestamp}`;
    if (seen.has(dk)) { dupes++; continue; }
    seen.add(dk);
    if (!byPoint.has(k)) byPoint.set(k, { lat: r.latitude, lon: r.longitude, region: r.region, vals: new Map() });
    byPoint.get(k)!.vals.set(r.timestamp, r.quality_flag === 'missing' ? null : r.value);
  }
  if (dupes) warnings.push(`${dupes} duplicate timestamp/location records were ignored (first kept).`);
  let filled = 0;
  const points = [...byPoint.entries()].map(([k, p], n) => ({
    id: `p${n}`, label: `${p.region ? p.region + ' · ' : ''}${p.lat.toFixed(2)}°, ${p.lon.toFixed(2)}°`, lat: p.lat, lon: p.lon, region: p.region,
    series: months.map((t) => {
      if (!p.vals.has(t)) filled++;
      const v = p.vals.has(t) ? p.vals.get(t)! : null;
      return { t, value: v, quality: v == null ? 'missing' as const : 'valid' as const };
    }),
    key: k,
  }));
  if (filled) warnings.push(`${filled} location-months absent from the file are shown as missing (not zero).`);
  const manifest: DatasetManifest = {
    contract: 'dataset-manifest', version: 1, datasetId: `import:${f.datasetId}`, datasetVersion: 'imported', title: f.title,
    variable: 'precipitation', unit: 'mm/hr', cadence: 'monthly',
    coverage: { start: months[0], end: months[months.length - 1], count: months.length },
    source: { provider: f.source.provider, url: f.source.url, citation: f.source.citation },
    preparation: { script: `user file ${fileName}` },
  };
  return {
    errors: [], warnings,
    dataset: { id: manifest.datasetId, kind: 'imported', title: f.title, manifest, months, regions: [], samples: [], points },
  };
}
