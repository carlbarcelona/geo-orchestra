import type { Availability, DatasetManifest, Observation, Selection } from '../contracts';

export type DatasetKind = 'nasa' | 'synthetic' | 'imported';

export interface AreaSeriesPoint {
  t: string; value: number | null; randomError?: number | null; coverage?: number; validCells?: number; quality: Availability;
}
export interface AreaRegion {
  id: string; name: string; selectionType: 'area'; aggregation: string; bounds: [number, number, number, number];
  cellCount: number; includesOcean: boolean; minCoverage: number; series: AreaSeriesPoint[]; boundingBox?: boolean;
}
export interface SampleCell {
  id: string; name: string; cell: { lonIndex: number; latIndex: number; lat: number; lon: number }; series: AreaSeriesPoint[];
}
export interface Grid {
  nlat: number; nlon: number; lat0: number; lon0: number; step: number;
  precip: Uint16Array; error?: Uint16Array; scale: number; errorScale: number; missing: number;
}
export interface Dataset {
  id: string;
  kind: DatasetKind;
  title: string;
  manifest: DatasetManifest;
  months: string[];
  grid?: Grid;
  regions: AreaRegion[];
  samples: SampleCell[];
  outline?: GeoJSONFeatureCollection;
  cellRegion?: Uint8Array;
  points?: { id: string; label: string; lat: number; lon: number; region?: string; series: AreaSeriesPoint[] }[];
  validation?: Record<string, unknown>;
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: { type: 'Feature'; id?: string; properties: Record<string, unknown>; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] } }[];
}

export function monthInterval(t: string): { start: string; end: string } {
  const [y, m] = t.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function monthLabel(t: string, long = false): string {
  const [y, m] = t.split('-').map(Number);
  if (long) return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function cellValue(grid: Grid, t: number, latIndex: number, lonIndex: number): number | null {
  const raw = grid.precip[(t * grid.nlat + latIndex) * grid.nlon + lonIndex];
  return raw === grid.missing ? null : raw * grid.scale;
}
export function cellError(grid: Grid, t: number, latIndex: number, lonIndex: number): number | null {
  if (!grid.error) return null;
  const raw = grid.error[(t * grid.nlat + latIndex) * grid.nlon + lonIndex];
  return raw === grid.missing ? null : raw * grid.errorScale;
}

export function cellSelection(ds: Dataset, latIndex: number, lonIndex: number): Selection | null {
  const g = ds.grid;
  if (!g || latIndex < 0 || lonIndex < 0 || latIndex >= g.nlat || lonIndex >= g.nlon) return null;
  const lat = +(g.lat0 + latIndex * g.step).toFixed(2);
  const lon = +(g.lon0 + lonIndex * g.step).toFixed(2);
  return {
    id: `cell:${latIndex}:${lonIndex}`, type: 'cell', label: `Cell ${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`,
    aggregation: 'none (single 0.1° grid cell)', lat, lon, latIndex, lonIndex,
  };
}

export function areaSelection(region: AreaRegion): Selection {
  return {
    id: `area:${region.id}`, type: 'area', label: region.name, aggregation: region.aggregation, regionId: region.id,
    boundingBox: region.boundingBox,
  };
}

/** Resolve the observation series for a selection. Missing stays null — never 0, never interpolated. */
export function observationsFor(ds: Dataset, sel: Selection): Observation[] {
  const base = { unit: 'mm/hr' as const, selectionId: sel.id, selectionType: sel.type, aggregation: sel.aggregation };
  if (sel.type === 'area') {
    const region = ds.regions.find((r) => r.id === sel.regionId);
    if (!region) return [];
    const [w, s, e, n] = region.bounds;
    return region.series.map((p) => ({
      ...base, id: `${ds.id}|${sel.id}|${p.t}`, t: p.t, ...monthInterval(p.t), value: p.value,
      randomError: p.randomError ?? null, coverage: p.coverage, validCells: p.validCells, quality: p.quality,
      lat: +((s + n) / 2).toFixed(2), lon: +((w + e) / 2).toFixed(2), region: region.name,
    }));
  }
  if (sel.id.startsWith('point:') && ds.points) {
    const pt = ds.points.find((p) => `point:${p.id}` === sel.id);
    if (!pt) return [];
    return pt.series.map((p) => ({
      ...base, id: `${ds.id}|${sel.id}|${p.t}`, t: p.t, ...monthInterval(p.t), value: p.value, randomError: null,
      quality: p.quality, lat: pt.lat, lon: pt.lon, region: pt.region,
    }));
  }
  const g = ds.grid;
  if (!g || sel.latIndex == null || sel.lonIndex == null) return [];
  return ds.months.map((t, i) => {
    const v = cellValue(g, i, sel.latIndex!, sel.lonIndex!);
    return {
      ...base, id: `${ds.id}|${sel.id}|${t}`, t, ...monthInterval(t), value: v, randomError: cellError(g, i, sel.latIndex!, sel.lonIndex!),
      quality: v == null ? 'missing' : 'valid', lat: sel.lat, lon: sel.lon,
    } satisfies Observation;
  });
}

export function sampleObservations(ds: Dataset): { sample: SampleCell; obs: (number | null)[] }[] {
  return ds.samples.map((sample) => ({ sample, obs: sample.series.map((p) => p.value) }));
}

export function formatValue(v: number | null | undefined, digits = 3): string {
  if (v == null || Number.isNaN(v)) return '—';
  return v.toFixed(digits);
}
