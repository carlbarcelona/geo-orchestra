import { create } from 'zustand';
import type { AlignmentEvidence, ClimatologyLinkage, FrameScanDoc, Selection, SoundEvent, VisualMediaManifest } from '../contracts';
import type { Dataset } from '../data/dataset';
import type { InstrumentId, LayerLevels, SoundMode } from '../sound/engine';
import { DEFAULT_PRESET, type ListeningPresetId } from '../sound/presets';
import { PRESET_TIME_CUES, type Checkpoint, type TimeCueSettings } from '../sound/timeCues';

export type Tab = 'numerical' | 'visual';
export type UiMode = 'preset' | 'advanced';
export type DataView = 'table' | 'map' | 'graph' | 'metadata';
export type LoadState = 'empty' | 'loading' | 'ready' | 'error';
export type MediaState = 'none' | 'loading' | 'error' | 'ready';
export type LinkState = 'none' | 'loading' | 'reconstructed' | 'incompatible' | 'error';

export interface SoundSettings {
  mode: SoundMode;
  instrument: InstrumentId;
  scale: string;
  pitchLow: number;
  pitchHigh: number;
  master: number;
  layers: LayerLevels;
  spatialPhrases: boolean;
  preset: 'rain-pitch' | 'rain-pitch-spatial';
  /** rain-v2 context layers */
  reference: boolean;   // the normal "hum"
  harmony: boolean;     // wetter/drier chord
  cues: boolean;        // unusual-month bell, thunder, dry wind
  variation: boolean;   // change → extra notes
}

export interface A11ySettings { reducedMotion: boolean; highContrast: boolean; largeText: boolean; announceSteps: boolean; brailleCharts: boolean; describeEvery: number; haptics: boolean; speak: boolean }

export interface AppState {
  tab: Tab;
  /** Preset = simplified first-run interface; Advanced = every control. Only changes what is shown. */
  uiMode: UiMode;
  /** The listening preset chosen in Preset mode, per workspace. */
  listening: Record<Tab, ListeningPresetId>;
  /** User checkpoints per workspace timeline (keys "YYYY-MM" or "D###"). */
  checkpoints: Record<Tab, Checkpoint[]>;
  /** Advanced-mode time-cue settings per workspace. Preset mode always uses PRESET_TIME_CUES. */
  timeCues: Record<Tab, TimeCueSettings>;
  view: DataView;
  dataset: Dataset | null;
  load: { state: LoadState; progress: number; message: string; errors: string[]; warnings: string[]; source?: 'nasa' | 'synthetic' | 'file' };
  selection: Selection | null;
  pins: Selection[];
  /** numerical timeline */
  cursor: number;          // index into dataset.months
  range: [number, number];
  speed: number;           // months per second
  loop: boolean;
  playback: 'stopped' | 'playing' | 'buffering';
  pauseReason: string | null;
  sound: SoundSettings;
  selectedEventId: string | null;
  chartTab: 'roll' | 'score' | 'details';
  /** image features (decoded SVS frames) */
  frameScan: { state: 'none' | 'loading' | 'ready' | 'error'; doc: FrameScanDoc | null; bytes: Uint8Array | null; globalBytes: Uint8Array | null; message: string };
  image: { enabled: boolean; sweepEveryFrame: boolean; featureVoice: boolean };
  sweep: { active: boolean; startedAt: number; seconds: number; tab: Tab } | null;
  explore: { row: number; col: number } | null;
  graphTab: 'describe' | 'rain' | 'band' | 'dist';
  /** visual feed */
  media: { state: MediaState; message: string; manifest: VisualMediaManifest | null; alignment: AlignmentEvidence | null };
  link: { state: LinkState; message: string; climatology: ClimatologyLinkage | null };
  visual: { day: number; mode: 'frame' | 'timelapse'; roi: boolean; fit: 'fit' | 'fill'; regionId: string; speed: number; fullscreen: boolean;
    /** user crop of the whole frame for sweeps (degrees); null = sweep the entire frame */
    crop: { lonMin: number; lonMax: number; latMin: number; latMax: number } | null; cropping: boolean };
  a11y: A11ySettings;
  dialogs: { a11y: boolean; legend: boolean; sources: boolean; shortcuts: boolean };
  announcement: { text: string; id: number };
  eventsCache: { key: string; events: SoundEvent[][] } | null;
  lag: { max: number; mean: number; samples: number };
}

export const DEFAULT_SOUND: SoundSettings = {
  mode: 'musical', instrument: 'soft-piano', scale: 'C pentatonic', pitchLow: 48, pitchHigh: 84, master: 0.8,
  layers: { melody: 0.8, texture: 0.75, markers: 0.5, image: 0.7, context: 0.55, time: 0.6 }, spatialPhrases: false, preset: 'rain-pitch',
  reference: true, harmony: true, cues: true, variation: false,
};

export const UI_MODE_KEY = 'geoorchestra:uiMode';
/** Remembered per browser; any storage failure (private mode, blocked storage) falls back to Preset. */
export function readUiMode(): UiMode {
  try { return globalThis.localStorage?.getItem(UI_MODE_KEY) === 'advanced' ? 'advanced' : 'preset'; } catch { return 'preset'; }
}
export function writeUiMode(m: UiMode) {
  try { globalThis.localStorage?.setItem(UI_MODE_KEY, m); } catch { /* storage unavailable */ }
}

export const useStore = create<AppState>(() => ({
  tab: 'numerical',
  uiMode: readUiMode(),
  listening: { ...DEFAULT_PRESET },
  checkpoints: { numerical: [], visual: [] },
  timeCues: { numerical: { ...PRESET_TIME_CUES.monthly }, visual: { ...PRESET_TIME_CUES.seasonal } },
  view: readUiMode() === 'preset' ? 'graph' : 'table',
  dataset: null,
  load: { state: 'empty', progress: 0, message: '', errors: [], warnings: [] },
  selection: null,
  pins: [],
  cursor: 0,
  range: [0, 0],
  speed: 1,
  loop: false,
  playback: 'stopped',
  pauseReason: null,
  sound: DEFAULT_SOUND,
  selectedEventId: null,
  chartTab: 'roll',
  frameScan: { state: 'none', doc: null, bytes: null, globalBytes: null, message: '' },
  image: { enabled: true, sweepEveryFrame: false, featureVoice: true },
  sweep: null,
  explore: null,
  graphTab: 'describe',
  media: { state: 'none', message: '', manifest: null, alignment: null },
  link: { state: 'none', message: '', climatology: null },
  visual: { day: 0, mode: 'timelapse', roi: false, fit: 'fit', regionId: 'philippines', speed: 10, fullscreen: false, crop: null, cropping: false },
  a11y: { reducedMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches, highContrast: false, largeText: false, announceSteps: false, brailleCharts: true, describeEvery: 15, haptics: true, speak: false },
  dialogs: { a11y: false, legend: false, sources: false, shortcuts: false },
  announcement: { text: '', id: 0 },
  eventsCache: null,
  lag: { max: 0, mean: 0, samples: 0 },
}));

export const set = useStore.setState;
export const get = useStore.getState;

let annId = 0;
/** Polite screen-reader announcement for user actions and meaningful status changes. */
export function announce(text: string) { set({ announcement: { text, id: ++annId } }); }
