/**
 * GeoOrchestra shared contracts (v1). These four shapes are the agreement between the data
 * pipeline, the playback controller, the sound engine and every view. Original measurements are
 * always kept separate from normalized sound parameters.
 */
import { z } from 'zod';

export const CONTRACT_VERSION = 1;

// ---------- 1. Dataset manifest ----------
export interface DatasetManifest {
  contract: 'dataset-manifest';
  version: number;
  datasetId: string;
  datasetVersion: string;
  title: string;
  variable: string;
  longName?: string;
  unit: 'mm/hr';
  unitNote?: string;
  cadence: 'monthly';
  coverage: { start: string; end: string; count: number; target?: { start: string; end: string; count: number } };
  grid?: {
    nlat: number; nlon: number; lat0: number; lon0: number; step: number;
    extent: [number, number, number, number];
    layout: string;
    precipitation: { path: string; scale: number; missing: number };
    randomError?: { path: string; scale: number; missing: number };
  };
  quality?: { native: string[]; appDerived: string };
  source: { provider: string; doi?: string; url?: string; access?: string; citation?: string; granules?: number };
  preparation: { script?: string; prepared?: string; missingRule?: string; boundaries?: string; [k: string]: unknown };
  assets?: Record<string, string>;
}

// ---------- 2. Observation and selection ----------
export type Availability = 'valid' | 'partial' | 'missing';
export type SelectionType = 'area' | 'cell';

export interface Selection {
  id: string;            // e.g. "area:philippines" or "cell:132:84"
  type: SelectionType;
  label: string;
  aggregation: string;   // human-readable aggregation method
  regionId?: string;     // for area selections
  lat?: number; lon?: number; latIndex?: number; lonIndex?: number; // for cell selections
  boundingBox?: boolean; // true if an area is a rectangle, not a mask
}

export interface Observation {
  id: string;            // `${datasetId}|${selectionId}|${t}`
  t: string;             // observation key, "YYYY-MM" (monthly) or "D###" (seasonal day)
  start: string;         // UTC interval start ISO
  end: string;           // UTC interval end ISO (exclusive)
  value: number | null;  // original value in `unit`; null = missing (never 0)
  unit: 'mm/hr';
  randomError?: number | null;
  coverage?: number;     // valid fraction for area selections
  validCells?: number;
  quality: Availability; // app-derived availability label
  selectionId: string;
  selectionType: SelectionType;
  aggregation: string;
  lat?: number; lon?: number;
  region?: string;
  x?: number; y?: number; // derived display coordinates, never a source of truth
}

// ---------- 3. Sound event ----------
export type SoundEventKind = 'melody' | 'sample' | 'texture' | 'marker' | 'scan' | 'feature' | 'reference' | 'chord' | 'system';

/** How a value compares with its reference ("normal"). Wetter/drier categories are designed listening aids, not new measurements. */
export type AnomalyCategory = 'much-drier' | 'drier' | 'near-normal' | 'wetter' | 'much-wetter';
export interface StepContext {
  normal: number | null;        // reference value in the same unit as the observation
  anomaly: number | null;       // value - normal
  z: number | null;             // anomaly / sd of the same calendar month (monthly) — null for seasonal
  ratio: number | null;         // value / normal
  category: AnomalyCategory | null;
  rank: { position: number; of: number; wettest: boolean } | null; // e.g. 3rd wettest of 25
  baseline: string;             // '2001–2022 same-month mean' | 'annual mean of the seasonal cycle'
  periodLabel: string;          // e.g. 'July' or 'the yearly average'
}

export interface SoundEvent {
  id: string;
  kind: SoundEventKind;
  stepIndex: number;
  sourceObservationIds: string[];
  datasetId: string;
  selectionId: string;
  original: { value: number | null; unit: 'mm/hr' | 'mm/day'; t: string; label: string; derivation?: 'measured' | 'image-derived' | 'reconstructed' };
  offset: number;        // fraction of a step (0..1) after the step start
  duration: number;      // fraction of a step
  midi?: number;         // melody/sample note
  note?: string;
  velocity?: number;     // 0..1
  pan?: number;          // -1..1
  texture?: { dropsPerSecond: number; intensity: number; brightness: number };
  marker?: 'missing' | 'zero' | 'year' | 'clipped' | 'turn' | 'extreme' | 'region';
  scan?: { col: number; row: number; lat: number; lon: number; beat?: number; latBand?: [number, number]; intensity?: string };
  system?: { id: number; zone: 'tropical' | 'extratropical'; lat: number; lon: number; lonRange: [number, number]; latRange: [number, number]; cells: number; peak: number; orientation: number; intensity: string };
  chord?: number[];      // MIDI notes of a harmony event
  cue?: 'thunder' | 'wind';
  context?: StepContext;
  mappingVersion: string;
  explanation: string;
}

// ---------- 4. Visual media manifest ----------
export interface MediaFrame {
  day: number; label: string; sourceFrame: number; runFrames: [number, number]; sourceUrl: string; full: string; roi: string;
}
export interface VisualMediaManifest {
  contract: 'visual-media-manifest';
  version: number;
  assetId: string;
  title: string;
  kind: 'frame-sequence' | 'video';
  source: { provider: string; page: string; credit: string; visualizer?: string; scientists?: string[]; original?: string; originalSize?: [number, number]; originalFrames?: number };
  projection: 'equirectangular';
  bounds: { lonMin: number; lonMax: number; latMin: number; latMax: number };
  roi: { lonMin: number; lonMax: number; latMin: number; latMax: number; pixelSize: [number, number]; note?: string };
  timeBasis: 'seasonal-day-of-year' | 'historical-month';
  averaging: { years: [number, number]; smoothing: string };
  colorbar: { path: string; unit: string; min: number; max: number; note?: string };
  frames: MediaFrame[];
  measurementLinkage?: { path: string; status: 'reconstructed' | 'exact' | 'unresolved' };
  alignmentEvidence?: string;
}

export interface ClimatologyLinkage {
  version: number; contract: 'climatology-linkage'; unit: 'mm/hr'; years: [number, number];
  status: 'reconstructed' | 'exact'; method: string;
  regions: { id: string; name: string; monthlyMeans: number[]; yearsPerMonth: number[]; daily: number[] }[];
}

export interface AlignmentEvidence {
  overlayFrames: number; dayRuns: number; distinctOverlays: number; datesListLines: number;
  datesListDedupMatchesRuns: boolean; manualSpotChecks: { frame: number; overlay: string }[]; note: string; method: string;
}

// ---------- 5. Frame scan (image-derived, decoded through NASA's colorbar) ----------
export interface FrameFeature {
  day: number; label: string; phLandMmDay: number | null; phBoxMmDay: number | null; roiMeanMmDay: number; roiMaxMmDay: number;
  wetPct: number; bandLat: number | null; bandPeakMmDay: number; unknownPct: number; bandDelta14: number | null; bandTrend: 'north' | 'south' | 'steady';
}
export interface FrameScanDoc {
  contract: 'frame-scan'; version: number; unit: 'mm/day'; source: string;
  grid: { ncol: number; nrow: number; lonMin: number; latMin: number; step: number; scale: number; unknown: number; layout: string; path: string };
  globalGrid?: { ncol: number; nrow: number; lonMin: number; latMin: number; step: number; scale: number; unknown: number; layout: string; path: string; unknownPixelPct: number };
  thresholds: { wetMmDay: number; sectorLon: [number, number]; phBox: [number, number, number, number] };
  decodeValidation: { colorbarRoundTripMaxErrorMmDay: number; unknownPixelPct: number; vsReconstructedClimatology: { pearsonR: number; meanBiasMmDay: number } };
  days: FrameFeature[];
}

// ---------- Processed-JSON import format (brief §4 standardized record) ----------
export const ProcessedRecordSchema = z.object({
  timestamp: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'timestamp must be "YYYY-MM"'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  value: z.number().min(0, 'negative precipitation is invalid; use null for missing').nullable(),
  unit: z.literal('mm/hr', { errorMap: () => ({ message: 'unit must be "mm/hr" (monthly mean rate)' }) }),
  region: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  quality_flag: z.enum(['valid', 'partial', 'missing']).optional(),
});

export const ProcessedFileSchema = z.object({
  format: z.literal('geoorchestra-processed', { errorMap: () => ({ message: 'format must be "geoorchestra-processed"' }) }),
  version: z.literal(1),
  datasetId: z.string().min(1),
  title: z.string().min(1),
  variable: z.literal('precipitation'),
  source: z.object({ provider: z.string(), url: z.string().optional(), citation: z.string().optional() }),
  records: z.array(ProcessedRecordSchema).min(1, 'file contains no records'),
});
export type ProcessedFile = z.infer<typeof ProcessedFileSchema>;

// ---------- Project file ----------
export const ProjectFileSchema = z.object({
  format: z.literal('geoorchestra-project'),
  version: z.literal(1),
  savedAt: z.string(),
  dataset: z.object({ id: z.string(), kind: z.enum(['nasa', 'synthetic', 'imported']), title: z.string() }).nullable(),
  selection: z.any(),
  pins: z.array(z.any()),
  range: z.tuple([z.string(), z.string()]).nullable(),
  cursor: z.string().nullable(),
  speed: z.number(),
  loop: z.boolean(),
  sound: z.any(),
  view: z.enum(['table', 'map', 'graph', 'metadata']),
  tab: z.enum(['numerical', 'visual']),
  visual: z.object({ imported: z.boolean(), linked: z.boolean(), regionId: z.string(), day: z.number(), mode: z.enum(['frame', 'timelapse']), roi: z.boolean(), speed: z.number() }),
  a11y: z.any(),
  uiMode: z.enum(['preset', 'advanced']).optional(), // added with rain-v2; older project files omit it
});
export type ProjectFile = z.infer<typeof ProjectFileSchema>;
