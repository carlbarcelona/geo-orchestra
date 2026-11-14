import { create } from 'zustand';
import type { AlignmentEvidence, ClimatologyLinkage, FrameScanDoc, Selection, SoundEvent, VisualMediaManifest } from '../contracts';
import type { Dataset } from '../data/dataset';
import type { InstrumentId, LayerLevels, SoundMode } from '../sound/engine';

export type Tab = 'numerical' | 'visual';
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
  /** Per-element mute; independent of the level so unmuting restores it. */
  muted: Record<keyof LayerLevels, boolean>;
  spatialPhrases: boolean;
  preset: 'rain-pitch' | 'rain-pitch-spatial';
}

export interface A11ySettings { reducedMotion: boolean; highContrast: boolean; largeText: boolean; announceSteps: boolean; brailleCharts: boolean; describeEvery: number; haptics: boolean }

export interface AppState {
  tab: Tab;
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
  frameScan: { state: 'none' | 'loading' | 'ready' | 'error'; doc: FrameScanDoc | null; bytes: Uint8Array | null; message: string };
  image: { enabled: boolean; sweepEveryFrame: boolean; featureVoice: boolean };
  sweep: { active: boolean; startedAt: number; seconds: number; tab: Tab } | null;
  explore: { row: number; col: number } | null;
  graphTab: 'describe' | 'rain' | 'band' | 'dist';
  /** visual feed */
  media: { state: MediaState; message: string; manifest: VisualMediaManifest | null; alignment: AlignmentEvidence | null };
  link: { state: LinkState; message: string; climatology: ClimatologyLinkage | null };
  visual: { day: number; mode: 'frame' | 'timelapse'; roi: boolean; fit: 'fit' | 'fill'; regionId: string; speed: number; fullscreen: boolean };
  a11y: A11ySettings;
  dialogs: { a11y: boolean; legend: boolean; sources: boolean; shortcuts: boolean };
  announcement: { text: string; id: number };
  eventsCache: { key: string; events: SoundEvent[][] } | null;
  lag: { max: number; mean: number; samples: number };
}

export const DEFAULT_SOUND: SoundSettings = {
  mode: 'musical', instrument: 'soft-piano', scale: 'C pentatonic', pitchLow: 48, pitchHigh: 84, master: 0.8,
  layers: { melody: 0.8, texture: 0.75, markers: 0.5, image: 0.7 },
  muted: { melody: false, texture: false, markers: false, image: false }, spatialPhrases: false, preset: 'rain-pitch',
};

export const useStore = create<AppState>(() => ({
  tab: 'numerical',
  view: 'table',
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
  frameScan: { state: 'none', doc: null, bytes: null, message: '' },
  image: { enabled: true, sweepEveryFrame: false, featureVoice: true },
  sweep: null,
  explore: null,
  graphTab: 'describe',
  media: { state: 'none', message: '', manifest: null, alignment: null },
  link: { state: 'none', message: '', climatology: null },
  visual: { day: 0, mode: 'timelapse', roi: false, fit: 'fit', regionId: 'philippines', speed: 10, fullscreen: false },
  a11y: { reducedMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches, highContrast: false, largeText: false, announceSteps: false, brailleCharts: true, describeEvery: 15, haptics: true },
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
