import type { AlignmentEvidence, ClimatologyLinkage, FrameScanDoc, Observation, Selection, SoundEvent, StepContext, VisualMediaManifest } from '../contracts';
import { describeCell, describeFrame } from '../a11y/braille';
import { speak, spokenForm, stopSpeaking } from '../a11y/speech';
import { explainStep, monthlyContexts, seasonalContexts } from '../sound/context';
import { cellEvent, cropGrid, featureEvents, frameGrid, frameGridGlobal, imergGrid, SCAN, scanEvents, type ScanGrid } from '../sound/frameScan';
import { DEFAULT_PRESET, getPreset, type ListeningPresetId } from '../sound/presets';
import { ProjectFileSchema, type ProjectFile } from '../contracts';
import { areaSelection, cellSelection, monthLabel, observationsFor, type Dataset } from '../data/dataset';
import { buildSyntheticDemo, loadNasaSample, parseProcessedFile } from '../data/loaders';
import { controller, type TimelineAdapter } from '../playback/controller';
import { engine, type InstrumentId, type SoundMode } from '../sound/engine';
import { generateEvents, type SampleSeries } from '../sound/mapping';
import { announce, DEFAULT_SOUND, get, set, writeUiMode, type DataView, type SoundSettings, type Tab, type UiMode } from './store';

// ------------------------------------------------------------------ controller -> store
controller.subscribe(() => {
  const s = get();
  const patch: Partial<ReturnType<typeof get>> = {
    playback: controller.state, pauseReason: controller.lastPauseReason,
    lag: { max: controller.lagStats.max, mean: controller.lagStats.mean, samples: controller.lagStats.samples },
  };
  if (controller.adapterId === 'monthly') {
    patch.cursor = controller.index;
    patch.range = [...controller.range] as [number, number];
  } else if (controller.adapterId === 'seasonal') {
    patch.visual = { ...s.visual, day: controller.index };
    preloadFrames(controller.index);
    if (controller.state === 'playing' && s.a11y.describeEvery > 0 && controller.index !== s.visual.day && controller.index % s.a11y.describeEvery === 0) {
      queueMicrotask(() => announceCurrent());
    }
  }
  set(patch);
  if (s.a11y.announceSteps && controller.state === 'stopped') announceCurrent();
  if (s.a11y.speak && controller.state === 'playing') speakNotable(controller.index);
});

let lastSpoken = -1;
/** During playback only notable steps are spoken (unusual months, rain-band turns) so speech never lags the music. */
function speakNotable(i: number) {
  if (i === lastSpoken) return;
  lastSpoken = i;
  const s = get();
  const step = s.tab === 'numerical' ? numericalEvents()[i] : seasonalEvents()[i];
  if (!step) return;
  const label = s.tab === 'numerical' ? monthLabel(s.dataset!.months[i], true) : `${s.media.manifest?.frames[i]?.label ?? ''}`;
  if (step.some((e) => e.marker === 'extreme')) speak(spokenForm(explainStep(step, s.sound.mode, label)));
  else if (step.some((e) => e.marker === 'turn')) speak(step.find((e) => e.marker === 'turn')!.explanation);
}

let lastState = controller.state;
controller.subscribe(() => {
  if (controller.state !== lastState) {
    lastState = controller.state;
    if (controller.state === 'playing') announce('Playing');
    else if (controller.state === 'buffering') announce('Buffering the next NASA frame');
    else announce(controller.lastPauseReason === 'end of range' ? 'Reached the end of the range' : controller.lastPauseReason === 'page hidden' ? 'Paused because the page was hidden' : 'Paused');
  }
});

// ------------------------------------------------------------------ numerical timeline
export function currentObservations(): Observation[] {
  const { dataset, selection } = get();
  if (!dataset || !selection) return [];
  return observationsFor(dataset, selection);
}

function sampleSeries(ds: Dataset): SampleSeries[] {
  return ds.samples.map((s) => ({ id: s.id, name: s.name, lat: s.cell.lat, lon: s.cell.lon, values: s.series.map((p) => p.value) }));
}

function bucket(events: SoundEvent[], n: number): SoundEvent[][] {
  const out: SoundEvent[][] = Array.from({ length: n }, () => []);
  for (const e of events) out[e.stepIndex]?.push(e);
  return out;
}

export function numericalEvents(): SoundEvent[][] {
  const { dataset, selection, sound } = get();
  if (!dataset || !selection) return [];
  const key = `${dataset.id}|${selection.id}|${sound.scale}|${sound.pitchLow}|${sound.pitchHigh}|${sound.spatialPhrases}|${sound.reference}|${sound.harmony}|${sound.cues}|${sound.variation}`;
  const cache = get().eventsCache;
  if (cache?.key === key) return cache.events;
  const obs = observationsFor(dataset, selection);
  const ev = generateEvents(obs, {
    scale: sound.scale, pitchLow: sound.pitchLow, pitchHigh: sound.pitchHigh, spatialPhrases: sound.spatialPhrases,
    datasetId: dataset.id, selectionId: selection.id, stepLabel: (t) => monthLabel(t),
    reference: sound.reference, harmony: sound.harmony, cues: sound.cues, variation: sound.variation,
  }, sampleSeries(dataset), monthlyContexts(obs));
  const events = bucket(ev, obs.length);
  set({ eventsCache: { key, events } });
  return events;
}

function monthlyAdapter(): TimelineAdapter | null {
  const { dataset, selection } = get();
  if (!dataset || !selection) return null;
  return { id: 'monthly', keys: dataset.months, eventsByStep: numericalEvents() };
}

function attachNumerical(opts: { keepIndex?: boolean } = {}) {
  const s = get();
  const adapter = monthlyAdapter();
  controller.stepSeconds = 1 / s.speed;
  controller.setLoop(s.loop);
  controller.setAdapter(adapter, opts.keepIndex ? { index: s.cursor, range: s.range } : { index: s.range[0], range: s.range });
}

// ------------------------------------------------------------------ data loading
let loadAbort: AbortController | null = null;

async function finishLoad(ds: Dataset, source: 'nasa' | 'synthetic' | 'file', warnings: string[] = []) {
  controller.pause('dataset replaced');
  const sel = ds.regions.length ? areaSelection(ds.regions.find((r) => r.id === 'philippines') ?? ds.regions[0])
    : ds.points?.length ? { id: `point:${ds.points[0].id}`, type: 'cell' as const, label: ds.points[0].label, aggregation: 'imported point (as supplied)', lat: ds.points[0].lat, lon: ds.points[0].lon } : null;
  const n = ds.months.length;
  const start = 0; // play the whole record from its first month (was the last 12 months)
  set({
    dataset: ds, selection: sel, pins: sel ? [sel] : [], cursor: start, range: [0, n - 1], eventsCache: null, selectedEventId: null,
    load: { state: 'ready', progress: 1, message: `${n} monthly observations loaded`, errors: [], warnings, source },
  });
  attachNumerical();
  controller.seek(start);
  announce(`${ds.kind === 'synthetic' ? 'Synthetic demo' : ds.title} loaded: ${n} months, ${monthLabel(ds.months[0])} to ${monthLabel(ds.months[n - 1])}. Selected ${sel?.label ?? 'nothing'}.`);
}

export async function loadNasa() {
  loadAbort?.abort();
  loadAbort = new AbortController();
  const prev = get().load;
  set({ load: { ...prev, state: 'loading', progress: 0, message: 'Loading NASA IMERG sample', errors: [], source: 'nasa' } });
  announce('Loading the NASA IMERG sample');
  try {
    const ds = await loadNasaSample((p, m) => set({ load: { ...get().load, progress: p, message: m } }), loadAbort.signal);
    await finishLoad(ds, 'nasa');
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    set({ load: { state: get().dataset ? 'ready' : 'error', progress: 0, message: 'The NASA sample could not be loaded.', errors: [(e as Error).message], warnings: [], source: 'nasa' } });
    announce('Loading failed. ' + (e as Error).message);
  }
}

export async function loadSynthetic() {
  set({ load: { state: 'loading', progress: 0, message: 'Generating synthetic demo', errors: [], warnings: [], source: 'synthetic' } });
  try {
    const ds = await buildSyntheticDemo((p, m) => set({ load: { ...get().load, progress: p, message: m } }));
    await finishLoad(ds, 'synthetic', ['Synthetic values are generated for demonstration and are not NASA measurements.']);
  } catch (e) {
    set({ load: { state: 'error', progress: 0, message: 'Synthetic demo failed', errors: [(e as Error).message], warnings: [], source: 'synthetic' } });
  }
}

export async function importProcessedFile(file: File) {
  set({ load: { state: 'loading', progress: 0.3, message: `Validating ${file.name}`, errors: [], warnings: [], source: 'file' } });
  const text = await file.text();
  const res = parseProcessedFile(text, file.name);
  if (!res.dataset) {
    // a failed replacement leaves the previous dataset (and its audio state) untouched
    set({ load: { state: get().dataset ? 'ready' : 'error', progress: 0, message: `${file.name} was not imported`, errors: res.errors, warnings: [], source: 'file' } });
    announce(`${file.name} was not imported: ${res.errors[0]}`);
    return;
  }
  await finishLoad(res.dataset, 'file', res.warnings);
}

export function removeDataset() {
  controller.pause('dataset removed');
  controller.setAdapter(null);
  set({ dataset: null, selection: null, pins: [], cursor: 0, range: [0, 0], eventsCache: null, selectedEventId: null,
    load: { state: 'empty', progress: 0, message: '', errors: [], warnings: [] } });
  announce('Dataset removed');
}

// ------------------------------------------------------------------ selection
export function select(sel: Selection) {
  const s = get();
  if (s.selection?.id === sel.id) return;
  set({ selection: sel, eventsCache: null, selectedEventId: null, pins: s.pins.some((p) => p.id === sel.id) ? s.pins : [...s.pins, sel].slice(-8) });
  if (s.tab === 'numerical') attachNumerical({ keepIndex: true });
  announce(`Selected ${sel.label}. ${sel.type === 'area' ? 'Area mean.' : 'Single grid cell.'}`);
}
export function selectRegion(regionId: string) {
  const ds = get().dataset;
  const r = ds?.regions.find((x) => x.id === regionId);
  if (r) select(areaSelection(r));
}
export function selectCell(latIndex: number, lonIndex: number) {
  const ds = get().dataset;
  if (!ds) return;
  const sel = cellSelection(ds, latIndex, lonIndex);
  if (sel) select(sel);
}
export function removePin(id: string) {
  set({ pins: get().pins.filter((p) => p.id !== id) });
}

// ------------------------------------------------------------------ transport
export async function togglePlay() {
  if (get().tab === 'visual' && get().link.state !== 'reconstructed') { announce('Connect measurements before playing the visual feed'); return; }
  const ok = await controller.toggle();
  if (!ok) announce('Audio could not start in this browser. Measurements remain readable in the table.');
}
export function seek(i: number) { controller.seek(i); if (controller.state === 'stopped') announceCurrent(); }
export function stepBy(d: number) { controller.step(d); if (controller.state === 'stopped') announceCurrent(); }
export function setSpeed(v: number) {
  if (get().tab === 'visual') set({ visual: { ...get().visual, speed: v } }); else set({ speed: v });
  controller.setSpeed(v);
}
export function toggleLoop() { const loop = !get().loop; set({ loop }); controller.setLoop(loop); announce(loop ? 'Loop on' : 'Loop off'); }
export function setRange(r: [number, number]) { set({ range: r }); controller.setRange(r); }

/** The plain-language caption for the current step (what was measured, how it compares, what you hear). */
export function currentCaption(): string {
  const s = get();
  if (s.tab === 'numerical') {
    if (!s.dataset || !s.selection) return '';
    const step = numericalEvents()[s.cursor];
    const t = s.dataset.months[s.cursor];
    return step && t ? explainStep(step, s.sound.mode, monthLabel(t, true)) : '';
  }
  if (s.link.state !== 'reconstructed') return '';
  const f = s.media.manifest?.frames[s.visual.day];
  const step = seasonalEvents()[s.visual.day];
  return step && f ? explainStep(step, s.sound.mode, `${f.label} (seasonal average)`) : '';
}

export function announceCurrent() {
  const s = get();
  let text = '';
  if (s.tab === 'numerical') {
    const obs = currentObservations()[s.cursor];
    if (obs) text = `${currentCaption()} Availability: ${obs.quality}.`;
  } else {
    const v = seasonalObservations()[s.visual.day];
    const f = s.media.manifest?.frames[s.visual.day];
    const ft = s.frameScan.doc?.days[s.visual.day];
    if (ft && s.image.enabled) text = describeFrame(ft, s.frameScan.doc!.days, v?.value ?? null);
    else if (v && f) text = currentCaption();
  }
  if (!text) return;
  announce(text);
  if (s.a11y.speak) speak(spokenForm(text));
}

// ------------------------------------------------------------------ sound settings
export function updateSound(patch: Partial<SoundSettings>) {
  const before = get().sound;
  const sound = { ...before, ...patch };
  set({ sound });
  if (patch.instrument) engine.setInstrument(patch.instrument as InstrumentId);
  if (patch.master != null) engine.setMaster(sound.master);
  if (patch.layers) engine.setLevels(sound.layers);
  if (patch.mode) { controller.setMode(patch.mode as SoundMode); announce(`${patch.mode === 'musical' ? 'Musical sonification' : 'Geophony'} mode`); }
  if (patch.scale != null || patch.pitchLow != null || patch.pitchHigh != null || patch.spatialPhrases != null
    || patch.reference != null || patch.harmony != null || patch.cues != null || patch.variation != null) {
    set({ eventsCache: null });
    if (controller.adapterId === 'monthly') controller.updateEvents(numericalEvents());
    if (controller.adapterId === 'seasonal') controller.updateEvents(seasonalEvents());
  }
}

// ------------------------------------------------------------------ tabs & views
export function setTab(tab: Tab) {
  if (get().tab === tab) return;
  controller.pause('switched workspace');
  set({ tab, selectedEventId: null });
  if (get().uiMode === 'preset') applyListeningPreset(get().listening[tab], { quiet: true });
  if (tab === 'numerical') attachNumerical({ keepIndex: true });
  else attachSeasonal();
  announce(tab === 'numerical' ? 'Numerical workspace' : 'Visual feed workspace');
}
export function setView(view: DataView) { set({ view }); }

// ------------------------------------------------------------------ preset / advanced
/** Switch the interface mode. It only changes which controls are shown; playback and data are untouched. */
export function setUiMode(mode: UiMode) {
  const s = get();
  if (s.uiMode === mode) return;
  writeUiMode(mode);
  const patch: Partial<ReturnType<typeof get>> = { uiMode: mode };
  if (mode === 'preset') {
    if (s.view === 'metadata') patch.view = 'graph';
    if (s.tab === 'numerical' && s.chartTab === 'score') patch.chartTab = 'roll';
    if (s.graphTab === 'dist') patch.graphTab = 'describe';
  }
  set(patch);
  announce(mode === 'preset' ? 'Preset mode: the essential controls and recommended listening settings.' : 'Advanced mode: every control is shown.');
}

/** Apply a listening preset: sound settings only — the dataset, selection and range never change. */
export function applyListeningPreset(id: ListeningPresetId, opts: { quiet?: boolean } = {}) {
  const p = getPreset(id);
  if (!p) return;
  set({ listening: { ...get().listening, [p.workspace]: id } });
  updateSound({ ...p.sound });
  if (p.image) setImage({ enabled: true, ...p.image });
  if (!opts.quiet) announce(`Listening preset: ${p.label}. ${p.description}`);
}

/** Preset mode, numerical: one click loads the NASA sample, selects the Philippines and plays from the start. */
export async function quickStart() {
  void engine.start(); // unlock audio inside the click, before the download
  if (!get().dataset || get().dataset!.kind !== 'nasa') await loadNasa();
  if (!get().dataset) return;
  selectRegion('philippines');
  applyListeningPreset(get().listening.numerical ?? DEFAULT_PRESET.numerical, { quiet: true });
  controller.seek(controller.range[0]);
  if (controller.state === 'stopped') await togglePlay();
}

/** Preset mode, visual feed: one click imports the NASA frames, connects the climatology and plays. */
export async function quickStartVisual() {
  void engine.start();
  if (get().media.state !== 'ready') await importVisualFeed();
  if (get().media.state !== 'ready') return;
  if (get().link.state !== 'reconstructed') await connectClimatology();
  if (get().link.state !== 'reconstructed') return;
  applyListeningPreset(get().listening.visual ?? DEFAULT_PRESET.visual, { quiet: true });
  if (controller.state === 'stopped') await togglePlay();
}

// ------------------------------------------------------------------ visual feed (SVS 5478)
const SVS = `${import.meta.env.BASE_URL}data/svs5478/`;
export const svsUrl = (p: string) => SVS + p;

const frameCache = new Map<number, { img: HTMLImageElement; ready: boolean; failed: boolean; promise: Promise<void> }>();

function frameSrc(day: number) {
  const s = get();
  const f = s.media.manifest?.frames[day];
  return f ? svsUrl(s.visual.roi ? f.roi : f.full) : '';
}

export function loadFrame(day: number): Promise<void> {
  const key = day * 2 + (get().visual.roi ? 1 : 0);
  const hit = frameCache.get(key);
  if (hit && !hit.failed) return hit.promise;
  const img = new Image();
  const entry = { img, ready: false, failed: false, promise: Promise.resolve() };
  entry.promise = new Promise<void>((resolve, reject) => {
    img.onload = () => { entry.ready = true; resolve(); };
    img.onerror = () => { entry.failed = true; reject(new Error(`Frame for day ${day + 1} failed to load`)); };
  });
  entry.promise.catch(() => undefined);
  img.src = frameSrc(day);
  frameCache.set(key, entry);
  return entry.promise;
}
export function frameReady(day: number) {
  const e = frameCache.get(day * 2 + (get().visual.roi ? 1 : 0));
  return !!e?.ready;
}
function preloadFrames(day: number, ahead = 14) {
  const n = get().media.manifest?.frames.length ?? 0;
  for (let k = 0; k <= ahead && n; k++) void loadFrame((day + k) % n).catch(() => undefined);
}

export async function importVisualFeed() {
  set({ media: { ...get().media, state: 'loading', message: 'Loading NASA SVS 5478 manifest' } });
  announce('Importing the NASA SVS visual feed');
  try {
    const [manifest, alignment] = await Promise.all([
      fetch(svsUrl('manifest.json')).then((r) => { if (!r.ok) throw new Error(`manifest HTTP ${r.status}`); return r.json() as Promise<VisualMediaManifest>; }),
      fetch(svsUrl('alignment.json')).then((r) => { if (!r.ok) throw new Error(`alignment HTTP ${r.status}`); return r.json() as Promise<AlignmentEvidence>; }),
    ]);
    if (manifest.contract !== 'visual-media-manifest') throw new Error('Not a visual media manifest');
    set({ media: { state: 'ready', message: `${manifest.frames.length} dated frames`, manifest, alignment } });
    await loadFrame(get().visual.day).catch(() => undefined);
    preloadFrames(get().visual.day);
    void loadFrameScan();
    announce(`NASA visual feed ready: ${manifest.title}. Measurements are not connected yet.`);
  } catch (e) {
    set({ media: { state: 'error', message: (e as Error).message, manifest: null, alignment: null } });
    announce('Visual feed failed to load');
  }
}

export async function connectClimatology() {
  set({ link: { ...get().link, state: 'loading', message: 'Loading climatology measurements' } });
  try {
    const clim = await fetch(svsUrl('climatology-ph.json')).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<ClimatologyLinkage>; });
    const frames = get().media.manifest?.frames.length ?? 0;
    const bad = clim.regions.find((r) => r.daily.length !== frames);
    if (clim.unit !== 'mm/hr' || bad) {
      set({ link: { state: 'incompatible', message: bad ? `Measurement days (${bad.daily.length}) do not match the ${frames} media days.` : `Unit ${clim.unit} is not supported.`, climatology: clim } });
      announce('The measurements are incompatible with this media');
      return;
    }
    set({ link: { state: 'reconstructed', message: 'Reconstructed seasonal climatology linked (approximate)', climatology: clim } });
    attachSeasonal();
    announce('Climatology measurements connected. Status: reconstructed, approximate.');
  } catch (e) {
    set({ link: { state: 'error', message: (e as Error).message, climatology: null } });
  }
}

export function disconnectClimatology() {
  controller.pause('measurements disconnected');
  set({ link: { state: 'none', message: '', climatology: null } });
  attachSeasonal();
}

export function seasonalObservations(): Observation[] {
  const { link, visual, media } = get();
  const r = link.climatology?.regions.find((x) => x.id === visual.regionId);
  if (!r || !media.manifest) return [];
  return r.daily.map((v, i) => ({
    id: `svs5478-clim|area:${r.id}|D${String(i + 1).padStart(3, '0')}`, t: `D${String(i + 1).padStart(3, '0')}`,
    start: '', end: '', value: v, unit: 'mm/hr' as const, quality: 'valid' as const, selectionId: `area:${r.id}`, selectionType: 'area' as const,
    aggregation: 'Reconstructed seasonal climatology: 2001–2022 area mean, trailing 30-day (approximate)', region: r.name,
  }));
}

function seasonalEvents(): SoundEvent[][] {
  const { sound, media } = get();
  const obs = seasonalObservations();
  const labels = media.manifest?.frames.map((f) => f.label) ?? [];
  const ev = generateEvents(obs, {
    scale: sound.scale, pitchLow: sound.pitchLow, pitchHigh: sound.pitchHigh, spatialPhrases: false,
    datasetId: 'svs5478-clim', selectionId: obs[0]?.selectionId ?? '', stepLabel: (t) => `${labels[Number(t.slice(1)) - 1] ?? t} (seasonal average)`,
    reference: sound.reference, harmony: sound.harmony, cues: sound.cues, variation: sound.variation,
  }, [], seasonalContexts(obs.map((o) => o.value)));
  const steps = bucket(ev, obs.length);
  const { image, frameScan } = get();
  if (image.enabled && frameScan.doc && frameScan.bytes) {
    const feats = image.featureVoice ? featureEvents(frameScan.doc.days, { scale: sound.scale, pitchLow: sound.pitchLow, pitchHigh: sound.pitchHigh }) : [];
    steps.forEach((step, i) => {
      if (feats[i]) step.push(...feats[i]);
      const fg = image.sweepEveryFrame ? visualScanGrid(i) : null;
      if (fg) step.push(...scanEvents(fg, {
        scale: sound.scale, pitchLow: sound.pitchLow, pitchHigh: sound.pitchHigh, stepIndex: i, t: `D${String(i + 1).padStart(3, '0')}`,
        label: `${labels[i]} frame sweep`, datasetId: 'svs5478-frames', selectionId: 'frame', offsetStart: 0.05, span: 0.9,
      }));
    });
  }
  return steps;
}
export function seasonalEventsCached() { return seasonalEvents(); }

// ------------------------------------------------------------------ image features: decoded frames, sweeps, audio cursor
export async function loadFrameScan() {
  const st = get().frameScan.state;
  if (st === 'ready' || st === 'loading') return;
  set({ frameScan: { state: 'loading', doc: null, bytes: null, globalBytes: null, message: 'Loading decoded frame data' } });
  try {
    const doc = await fetch(svsUrl('frame-features.json')).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<FrameScanDoc>; });
    const buf = await fetch(svsUrl(doc.grid.path)).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); });
    const n = doc.days.length * doc.grid.nrow * doc.grid.ncol;
    if (buf.byteLength !== n) throw new Error(`frame-scan size ${buf.byteLength} does not match ${n}`);
    let globalBytes: Uint8Array | null = null;
    if (doc.globalGrid) {
      const gb = await fetch(svsUrl(doc.globalGrid.path)).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); });
      const gn = doc.days.length * doc.globalGrid.nrow * doc.globalGrid.ncol;
      if (gb.byteLength !== gn) throw new Error(`frame-scan-global size ${gb.byteLength} does not match ${gn}`);
      globalBytes = new Uint8Array(gb);
    }
    set({ frameScan: { state: 'ready', doc, bytes: new Uint8Array(buf), globalBytes, message: '' } });
    if (controller.adapterId === 'seasonal') controller.updateEvents(seasonalEvents());
  } catch (e) {
    set({ frameScan: { state: 'error', doc: null, bytes: null, globalBytes: null, message: (e as Error).message } });
  }
}

export function setImage(patch: Partial<ReturnType<typeof get>['image']>) {
  set({ image: { ...get().image, ...patch } });
  if (patch.sweepEveryFrame && get().visual.speed > 1) {
    setSpeed(1);
    announce('Sweep every frame is on: speed set to 1 day per second so each sweep can be heard.');
  }
  if (controller.adapterId === 'seasonal') controller.updateEvents(seasonalEvents());
}

/**
 * The decoded SVS grid a sweep acts on for `day`: the WHOLE frame (or the user's crop of it) in the full view,
 * the West Pacific grid in the ROI view.
 */
export function visualScanGrid(day: number): ScanGrid | null {
  const s = get();
  if (!s.frameScan.doc || !s.frameScan.bytes) return null;
  if (!s.visual.roi && s.frameScan.globalBytes) {
    const g = frameGridGlobal(s.frameScan.doc, s.frameScan.globalBytes, day);
    if (g && s.visual.crop) return cropGrid(g, s.visual.crop) ?? g;
    if (g) return g;
  }
  return frameGrid(s.frameScan.doc, s.frameScan.bytes, day);
}

/** The grid a sweep/explore acts on: decoded SVS frame (visual tab) or measured IMERG month (numerical tab). */
export function currentScanGrid(): ScanGrid | null {
  const s = get();
  if (s.tab === 'visual') {
    if (!s.image.enabled || s.media.state !== 'ready') return null;
    return visualScanGrid(s.visual.day);
  }
  return s.dataset?.grid ? imergGrid(s.dataset.grid, s.cursor) : null;
}

export function currentScanEvents(): SoundEvent[] {
  const s = get();
  const g = currentScanGrid();
  if (!g) return [];
  const visual = s.tab === 'visual';
  const t = visual ? `D${String(s.visual.day + 1).padStart(3, '0')}` : s.dataset!.months[s.cursor];
  const label = visual ? `${s.media.manifest?.frames[s.visual.day]?.label ?? t} frame` : `${monthLabel(t)} map`;
  return scanEvents(g, {
    scale: s.sound.scale, pitchLow: s.sound.pitchLow, pitchHigh: s.sound.pitchHigh, stepIndex: 0, t, label,
    datasetId: visual ? 'svs5478-frames' : s.dataset!.id, selectionId: 'frame',
  });
}

let sweepTimer: ReturnType<typeof setTimeout> | null = null;
/** Play one west-to-east sweep of the current frame/month (Hubble-style image sonification). */
export async function scanCurrent() {
  const events = currentScanEvents();
  if (!events.length) { announce('Nothing to sweep yet: load the data or import the visual feed first.'); return; }
  if (controller.state !== 'stopped') controller.pause('frame sweep');
  const g = currentScanGrid();
  const seconds = get().tab === 'visual' ? +Math.max(4.5, (g?.beats ?? SCAN.beats) * SCAN.secondsPerBeat).toFixed(1) : 3.5;
  const t0 = await engine.playSweep(events, seconds, get().sound.mode);
  if (t0 == null) { announce('Audio could not start.'); return; }
  const startedAt = performance.now() + Math.max(0, (t0 - engine.now()) * 1000);
  set({ sweep: { active: true, startedAt, seconds, tab: get().tab }, chartTab: 'score' });
  const systems = events.filter((e) => e.kind === 'system').length;
  announce(`Sweeping ${g?.area ?? 'the frame'} west to east over ${seconds} seconds${systems ? `, crossing ${systems} rain system${systems === 1 ? '' : 's'}` : ''}. Higher pitch means farther north; louder means more rain; a held pad is a rain system.`);
  if (sweepTimer) clearTimeout(sweepTimer);
  sweepTimer = setTimeout(() => set({ sweep: null }), seconds * 1000 + 400);
}

/** Audio cursor: move to a cell, play its tone, announce its value, optionally vibrate. */
export function exploreAt(row: number, col: number) {
  const g = currentScanGrid();
  if (!g) return;
  const r = Math.max(0, Math.min(g.nrow - 1, row)), c = Math.max(0, Math.min(g.ncol - 1, col));
  set({ explore: { row: r, col: c } });
  const v = g.value(r, c);
  const lat = +(g.latMin + (r + 0.5) * g.step).toFixed(2), lon = +(g.lonMin + (c + 0.5) * g.step).toFixed(2);
  const ev = cellEvent(g, r, c, { scale: get().sound.scale, pitchLow: get().sound.pitchLow, pitchHigh: get().sound.pitchHigh });
  announce(`${describeCell(lat, lon, v, g.unit, g.derivation)}${ev ? ` Note ${ev.note} (latitude band).` : v != null ? ' Dry: silent.' : ''}`);
  if (v == null) return;
  if (ev) void engine.ping(ev);
  if (get().a11y.haptics && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { navigator.vibrate(Math.round(10 + 70 * Math.sqrt(Math.min(1, v / g.refMax)))); } catch { /* unsupported */ }
  }
}
export function exploreMove(dRow: number, dCol: number) {
  const g = currentScanGrid();
  if (!g) return;
  const cur = get().explore ?? { row: Math.floor(g.nrow / 2), col: Math.floor(g.ncol / 2) };
  exploreAt(cur.row + dRow, cur.col + dCol);
}

function attachSeasonal() {
  const s = get();
  if (s.link.state !== 'reconstructed' || !s.media.manifest) { controller.setAdapter(null); return; }
  const n = s.media.manifest.frames.length;
  controller.stepSeconds = 1 / s.visual.speed;
  controller.setLoop(s.loop);
  controller.setAdapter({
    id: 'seasonal', keys: s.media.manifest.frames.map((f) => `D${String(f.day).padStart(3, '0')}`), eventsByStep: seasonalEvents(),
    isReady: (i) => frameReady(i), waitReady: (i) => loadFrame(i).catch(() => {
      controller.pause('a NASA frame failed to load');
      set({ media: { ...get().media, message: `Frame for day ${i + 1} failed to load. Playback paused rather than reusing an old frame.` } });
    }),
  }, { index: s.visual.day, range: [0, n - 1] });
}

export function setVisualRegion(regionId: string) {
  set({ visual: { ...get().visual, regionId } });
  if (get().link.state === 'reconstructed') attachSeasonal();
  announce(`Visual feed region: ${regionId}`);
}
export function setVisual(patch: Partial<ReturnType<typeof get>['visual']>) {
  set({ visual: { ...get().visual, ...patch } });
  if (patch.roi != null || 'crop' in patch) set({ explore: null });
  if (patch.crop) announce(`Sweep crop set: the sweep now reads only ${patch.crop.latMin}° to ${patch.crop.latMax}° latitude, ${patch.crop.lonMin}° to ${patch.crop.lonMax}° longitude.`);
  else if ('crop' in patch && patch.crop === null) announce('Sweep crop cleared: the sweep reads the entire frame.');
  if (patch.roi != null) { void loadFrame(get().visual.day).catch(() => undefined); preloadFrames(get().visual.day); }
}

// ------------------------------------------------------------------ project file
export function saveProject() {
  const s = get();
  const doc: ProjectFile = {
    format: 'geoorchestra-project', version: 1, savedAt: new Date().toISOString(),
    dataset: s.dataset ? { id: s.dataset.id, kind: s.dataset.kind, title: s.dataset.title } : null,
    selection: s.selection, pins: s.pins,
    range: s.dataset ? [s.dataset.months[s.range[0]], s.dataset.months[s.range[1]]] : null,
    cursor: s.dataset ? s.dataset.months[s.cursor] : null,
    speed: s.speed, loop: s.loop, sound: s.sound, view: s.view, tab: s.tab,
    visual: { imported: s.media.state === 'ready', linked: s.link.state === 'reconstructed', regionId: s.visual.regionId, day: s.visual.day, mode: s.visual.mode, roi: s.visual.roi, speed: s.visual.speed },
    a11y: s.a11y,
    uiMode: s.uiMode,
  };
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `geoorchestra-project-${new Date().toISOString().slice(0, 10)}.geoorchestra.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  announce('Project settings saved. Datasets and media are referenced, not bundled.');
}

export async function openProject(file: File): Promise<string[]> {
  const notes: string[] = [];
  let doc: ProjectFile;
  try {
    const parsed = ProjectFileSchema.safeParse(JSON.parse(await file.text()));
    if (!parsed.success) return [`Not a GeoOrchestra project: ${parsed.error.issues[0]?.message}`];
    doc = parsed.data;
  } catch (e) { return [`Could not read ${file.name}: ${(e as Error).message}`]; }
  controller.pause('project opened');
  if (doc.uiMode) setUiMode(doc.uiMode);
  set({ sound: { ...DEFAULT_SOUND, ...doc.sound, layers: { ...DEFAULT_SOUND.layers, ...(doc.sound?.layers ?? {}) } }, speed: doc.speed, loop: doc.loop, view: doc.view, a11y: { ...get().a11y, ...doc.a11y } });
  engine.setInstrument(get().sound.instrument); engine.setMaster(get().sound.master); engine.setLevels(get().sound.layers);
  controller.setLoop(doc.loop);
  if (doc.dataset?.kind === 'nasa') await loadNasa();
  else if (doc.dataset?.kind === 'synthetic') await loadSynthetic();
  else if (doc.dataset?.kind === 'imported') notes.push(`The project used an imported file ("${doc.dataset.title}"). Import it again to restore its data.`);
  const ds = get().dataset;
  if (ds && doc.dataset && ds.id === doc.dataset.id) {
    if (doc.selection) select(doc.selection as Selection);
    set({ pins: doc.pins as Selection[] });
    const ri = doc.range ? [ds.months.indexOf(doc.range[0]), ds.months.indexOf(doc.range[1])] : [0, ds.months.length - 1];
    if (ri[0] >= 0 && ri[1] >= 0) setRange(ri as [number, number]);
    const ci = doc.cursor ? ds.months.indexOf(doc.cursor) : -1;
    if (ci >= 0) controller.seek(ci);
    controller.setSpeed(doc.speed);
  }
  set({ visual: { ...get().visual, regionId: doc.visual.regionId, day: doc.visual.day, mode: doc.visual.mode, roi: doc.visual.roi, speed: doc.visual.speed } });
  if (doc.visual.imported) await importVisualFeed();
  if (doc.visual.linked) await connectClimatology();
  if (doc.tab !== get().tab) setTab(doc.tab);
  notes.unshift(`Opened project saved ${new Date(doc.savedAt).toLocaleString()}.`);
  announce(notes.join(' '));
  return notes;
}

// ------------------------------------------------------------------ legend
export type LegendKind = 'low' | 'middle' | 'high' | 'zero' | 'missing' | 'near-normal' | 'wetter' | 'much-wetter' | 'drier' | 'much-drier' | 'unusual';

/** Legend examples: a July whose normal is 0.35 mm/hr (sd 0.07), so the comparison cases sound exactly like playback. */
export const LEGEND_NORMAL = { mean: 0.35, sd: 0.07 };
const LEGEND_VALUES: Record<LegendKind, number | null> = {
  low: 0.05, middle: 0.4, high: 0.75, zero: 0, missing: null,
  'near-normal': 0.36, wetter: 0.42, 'much-wetter': 0.48, drier: 0.28, 'much-drier': 0.24, unusual: 0.55,
};

export function legendEvents(kind: LegendKind): SoundEvent[] {
  const value = LEGEND_VALUES[kind];
  const { sound } = get();
  const obs: Observation[] = [{ id: `legend|${kind}`, t: '1999-07', start: '', end: '', value, unit: 'mm/hr', quality: value == null ? 'missing' : 'valid', selectionId: 'legend', selectionType: 'area', aggregation: 'legend example' }];
  const comparing = !['low', 'middle', 'high', 'zero'].includes(kind);
  let contexts: StepContext[] | undefined;
  if (comparing) {
    // the same rule playback uses: same-month normals over the baseline years
    const { mean: m, sd } = LEGEND_NORMAL; // five baseline Julys with exactly this mean and sample SD
    const synthetic: Observation[] = [m - sd, m, m + sd, m - sd, m + sd]
      .map((v, k) => ({ ...obs[0], id: `legend|n${k}`, t: `${2002 + k}-07`, value: v, quality: 'valid' }));
    contexts = monthlyContexts([...obs, ...synthetic]).slice(0, 1);
  }
  return generateEvents(obs, {
    scale: sound.scale, pitchLow: sound.pitchLow, pitchHigh: sound.pitchHigh, spatialPhrases: false, datasetId: 'legend', selectionId: 'legend', stepLabel: () => `Legend: ${kind}`,
    reference: sound.reference, harmony: sound.harmony, cues: sound.cues, variation: false,
  }, [], contexts).filter((e) => e.marker !== 'year');
}
export async function audition(kind: LegendKind) {
  if (controller.state !== 'stopped') controller.pause('legend audition');
  stopSpeaking();
  await engine.audition(legendEvents(kind), get().sound.mode);
  announce(`Legend example: ${kind}${kind === 'missing' ? ' — a muted thud and no note' : ''}`);
}
