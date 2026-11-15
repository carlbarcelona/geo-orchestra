import { useEffect, useMemo, useRef, useState } from 'react';
import { controller } from '../../playback/controller';
import {
  connectClimatology, currentScanEvents, currentScanGrid, disconnectClimatology, exploreAt, exploreMove, frameReady, importVisualFeed, loadFrame,
  normaliseRoi, quickStartVisual, ROI_PRESETS, roiActive, roiLabel, scanCurrent, setRoi, visualScanGrid, seasonalEventsCached, seasonalObservations, seek, setImage, setTab, setVisual, setVisualRegion, svsUrl, togglePlay,
} from '../../state/actions';
import { describeFrame, describeSweep } from '../../a11y/braille';
import { seasonalContexts } from '../../sound/context';
import { MAPPING } from '../../sound/mapping';
import { columnProfile, detectSystems, fmtLat, fmtLon, SCAN, type CropBox } from '../../sound/frameScan';
import { CropLayer, ScanOverlay } from './ScanOverlay';
import { ListeningGuide, ListeningPresetCards, NarrationToggle } from '../preset/PresetPanels';
import { BrailleChart } from '../shared/BrailleChart';
import { FrameScore, useSweepProgress } from '../shared/FrameScore';
import { set, useStore } from '../../state/store';
import * as I from '../icons';
import { MusicChart } from '../shared/MusicChart';
import { Disclosure, ElementMutes, GeophonyMapping, InstrumentRow, LegendButton, MappingRows, MasterVolume, ModeBanner, ModeTabs, ModeTag, PitchRange, ScaleRow, LayerLevels, TimeCueControls } from '../shared/SoundControls';
import { TimeSeriesGraph } from '../shared/TimeSeriesGraph';
import { ResizeHandles } from '../shell/Splitter';

const PH_BOX = { lonMin: 116, lonMax: 127.5, latMin: 4.5, latMax: 21.5 };
const REGION_NAMES: Record<string, string> = { philippines: 'Philippines', luzon: 'Luzon', visayas: 'Visayas', mindanao: 'Mindanao' };
const SPEEDS = [{ value: 0.5, label: '0.5 day/s' }, { value: 1, label: '1 day/s' }, { value: 2, label: '2 days/s' }, { value: 5, label: '5 days/s' }, { value: 10, label: '10 days/s' }, { value: 30, label: '30 days/s' }];

export function VisualWorkspace() {
  const media = useStore((s) => s.media);
  const link = useStore((s) => s.link);
  const visual = useStore((s) => s.visual);
  const sound = useStore((s) => s.sound);
  const linked = link.state === 'reconstructed';
  const frameScan = useStore((s) => s.frameScan);
  const image = useStore((s) => s.image);
  const rev = useStore((s) => s.eventsRev);
  const checkpoints = useStore((s) => s.checkpoints.visual);
  const uiMode = useStore((s) => s.uiMode);
  const timeCues = useStore((s) => s.timeCues.visual);
  // seasonalEventsCached() is keyed on every input, so calling it again is cheap; the deps only decide when to ask
  const events = useMemo(() => (linked ? seasonalEventsCached() : []), [linked, link.climatology, visual.regionId, visual.crop, visual.roi, sound, frameScan.state, image, rev, checkpoints, uiMode, timeCues]); // eslint-disable-line react-hooks/exhaustive-deps
  const labels = useMemo(() => media.manifest?.frames.map((f) => f.label) ?? [], [media.manifest]);
  const grid = useMemo(() => currentScanGrid(), [visual.day, visual.roi, visual.crop, frameScan.state, image.enabled, media.state]); // eslint-disable-line react-hooks/exhaustive-deps
  const scanEvents = useMemo(() => (grid ? currentScanEvents() : []), [grid, sound.scale, sound.pitchLow, sound.pitchHigh]); // eslint-disable-line react-hooks/exhaustive-deps
  const frameLabel = media.manifest?.frames[visual.day]?.label;
  const preset = useStore((s) => s.uiMode === 'preset');
  return (
    <main id="main" className={`workspace visual ${preset ? 'preset' : ''}`} aria-label="Visual feed workspace">
      <ResizeHandles workspace="visual" edges={[{ edge: 'left', className: 'sp-c2 sp-rall' }, { edge: 'right', className: 'sp-c3 sp-r1' }, { edge: 'top', className: 'sp-r2' }]} />
      <NasaDataPanel preset={preset} />
      <VisualFeed preset={preset} />
      {preset ? <PresetSoundStudio /> : <SoundStudio />}
      <SeasonalGraph preset={preset} />
      <div className="span-2" style={{ display: 'flex', minHeight: 0, minWidth: 0 }}>
        <MusicChart
          events={events} stepLabels={labels} axisTitle="Seasonal day"
          cursor={visual.day} range={[0, Math.max(0, labels.length - 1)]} speeds={SPEEDS} speed={visual.speed} visibleSteps={30}
          enabled={linked} emptyTitle={media.state === 'ready' ? 'Audio events appear after source alignment' : 'Audio events appear after source alignment'}
          emptyHint={media.state !== 'ready' ? 'No media timeline loaded' : 'Connect matching climatology data in Sound Studio'}
          rightInfo={media.manifest && <span className="chip mono">Day {visual.day + 1}</span>}
          captionLabel={(i) => `${labels[i] ?? ''} (seasonal average, ${REGION_NAMES[visual.regionId]})`}
          checkpointKey={(i) => `D${String(i + 1).padStart(3, '0')}`}
          footNote="Video frame index ≠ calendar day · each frame's date is read from the SVS date overlays (366 days, incl. Feb 29)"
          score={{
            label: 'Frame score', available: !!grid, events: scanEvents,
            node: <FrameScore grid={grid} events={scanEvents} tab="visual" title={`Frame score · ${frameLabel ?? ''} · ${visual.roi ? 'West Pacific 95–150°E' : grid?.area === 'whole frame' ? 'whole frame, 180°W–180°E' : grid?.area ?? ''}`}
              emptyText={media.state !== 'ready' ? 'Import the visual feed to turn each frame into a score' : frameScan.state === 'loading' ? 'Decoding frames…' : !image.enabled ? 'Image features are off (Sound Studio)' : 'Frame data unavailable'} />,
          }}
        />
      </div>
    </main>
  );
}

/**
 * Picks the Preset or Advanced panel. The two are separate components so that each one's hooks always run in the
 * same order: an early return before hooks makes React throw ("Rendered more hooks…") when the mode switches,
 * which unmounted the whole app (the Preset → Advanced freeze).
 */
function NasaDataPanel({ preset }: { preset: boolean }) {
  return preset ? <PresetNasaPanel /> : <AdvancedNasaPanel />;
}

function AdvancedNasaPanel() {
  const media = useStore((s) => s.media);
  const link = useStore((s) => s.link);
  const [tab, setTabState] = useState<'catalogue' | 'project'>('catalogue');
  const [q, setQ] = useState('');
  const match = (t: string) => !q || t.toLowerCase().includes(q.toLowerCase());
  const imported = media.state === 'ready';
  return (
    <section className="panel" aria-labelledby="nasa-title">
      <div className="panel-head"><h2 className="panel-title" id="nasa-title">NASA data</h2></div>
      <div className="panel-body">
        <label className="row" style={{ border: '1px solid var(--line-2)', borderRadius: 6, padding: '0 8px', background: 'var(--panel-2)', marginBottom: 8 }}>
          <I.Search /><input type="search" placeholder="Search NASA data (e.g., IMERG, rainfall)…" value={q} onChange={(e) => setQ(e.target.value)} style={{ border: 'none', background: 'transparent', flex: 1 }} aria-label="Search the bundled NASA catalogue" />
        </label>
        <div className="seg" role="tablist" aria-label="NASA data view" style={{ width: '100%', marginBottom: 8 }}>
          <button role="tab" style={{ flex: 1 }} aria-selected={tab === 'catalogue'} onClick={() => setTabState('catalogue')}>Catalogue</button>
          <button role="tab" style={{ flex: 1 }} aria-selected={tab === 'project'} onClick={() => setTabState('project')}>Project</button>
        </div>
        {tab === 'catalogue' ? (
          <div>
            <div className="section-head" style={{ border: 'none', padding: '4px 2px' }}>▾ Precipitation</div>
            {match('IMERG daily climatology SVS 5478 rainfall precipitation') && (
              <button className="dataset-card" style={{ width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: 8, color: 'inherit' }} onClick={() => void (imported ? undefined : importVisualFeed())} aria-describedby="svs-desc">
                <I.Video style={{ marginTop: 2 }} />
                <div className="grow">
                  <div className="t">IMERG daily climatology</div>
                  <div className="s" id="svs-desc">NASA SVS 5478 · 2001–2022 seasonal cycle</div>
                  <div className="row" style={{ marginTop: 5, flexWrap: 'wrap' }}>
                    <span className="chip" style={{ fontSize: 10.5 }}>FRAMES</span>
                    <span className={`chip ${link.state === 'reconstructed' ? 'accent' : imported ? 'ok' : ''}`} style={{ fontSize: 10.5 }}>{link.state === 'reconstructed' ? 'LINKED DATA · RECONSTRUCTED' : imported ? 'IMPORTED' : 'NOT IMPORTED'}</span>
                  </div>
                </div>
              </button>
            )}
            {match('IMERG monthly history numerical rainfall precipitation') && (
              <button className="dataset-card empty" style={{ width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: 8, color: 'inherit' }} onClick={() => setTab('numerical')}>
                <I.Grid style={{ marginTop: 2 }} />
                <div className="grow"><div className="t">IMERG monthly history</div><div className="s">GPM_3IMERGM V07B · Jun 2000 – Dec 2024 · opens in Numerical</div></div>
              </button>
            )}
            <div className="disclosure" style={{ cursor: 'default', opacity: 0.6 }}><I.Caret /> Temperature · <i>Later</i></div>
            <div className="disclosure" style={{ cursor: 'default', opacity: 0.6 }}><I.Caret /> Wind · <i>Later</i></div>
            <p className="muted" style={{ fontSize: 11.5 }}>Search covers the bundled entries only; a broad NASA discovery service is outside this release.</p>
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            <li className="row" style={{ padding: '4px 0' }}><I.Folder /> <b>My project</b></li>
            <li className="row" style={{ padding: '4px 0 4px 18px' }}><I.File /> {imported ? `Media: ${media.manifest!.title}` : 'No media imported'}</li>
            <li className="row" style={{ padding: '4px 0 4px 18px' }}><I.File /> {link.state === 'reconstructed' ? 'Measurements: reconstructed climatology' : 'No measurements connected'}</li>
            <li className="row" style={{ padding: '4px 0 4px 18px' }}><I.File /> Sound mapping: {MAPPING.version} · frame sweep {SCAN.version}</li>
          </ul>
        )}
        <div className="section" style={{ marginTop: 10 }}>
          <div className="section-head" style={{ fontSize: 12.5 }}><I.Info /> Source details</div>
          <div className="section-body">
            <dl className="kv" style={{ gridTemplateColumns: '100px 1fr' }}>
              <dt>Resource</dt><dd><a href="https://svs.gsfc.nasa.gov/5478/" target="_blank" rel="noreferrer">NASA SVS 5478</a></dd>
              <dt>Product</dt><dd>IMERG precipitation</dd>
              <dt>Period</dt><dd>2001–2022 climatology</dd>
              <dt>Smoothing</dt><dd>Trailing 30-day mean</dd>
              <dt>Projection</dt><dd>Equirectangular</dd>
              <dt>Asset type</dt><dd>Image sequence</dd>
              {media.manifest && <><dt>Frames</dt><dd>{media.manifest.source.originalFrames} source → {media.manifest.frames.length} dated days</dd>
                <dt>Credit</dt><dd style={{ fontFamily: 'var(--font)' }}>{media.manifest.source.credit}; {media.manifest.source.visualizer}; science: {media.manifest.source.scientists?.join(', ')}</dd></>}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

function PresetNasaPanel() {
  const media = useStore((s) => s.media);
  const link = useStore((s) => s.link);
  const ready = media.state === 'ready' && link.state === 'reconstructed';
  return (
    <section className="panel" aria-labelledby="nasa-title">
      <div className="panel-head"><h2 className="panel-title" id="nasa-title">NASA rainfall animation</h2></div>
      <div className="panel-body">
        <div className={`dataset-card ${ready ? '' : 'empty'}`} style={{ marginBottom: 10 }}>
          <I.Video style={{ marginTop: 2, flexShrink: 0 }} />
          <div className="grow">
            <div className="t">IMERG daily climatology</div>
            <div className="s">NASA SVS 5478 · the average year, 2001–2022</div>
            <div className="row" style={{ marginTop: 5, flexWrap: 'wrap' }}>
              <span className={`chip ${ready ? 'accent' : ''}`} style={{ fontSize: 10.5 }}>{ready ? 'READY · LINKED (RECONSTRUCTED)' : media.state === 'ready' ? 'FRAMES LOADED' : 'NOT OPENED'}</span>
            </div>
          </div>
        </div>
        {!ready && (
          <button className="btn primary solid big" style={{ width: '100%', marginBottom: 10 }} onClick={() => void quickStartVisual()} disabled={media.state === 'loading' || link.state === 'loading'}>
            <I.Play /> {media.state === 'loading' || link.state === 'loading' ? 'Opening…' : 'Open NASA rainfall animation'}
          </button>
        )}
        <div className="callout note" style={{ marginBottom: 10 }}><I.Info size={15} style={{ flexShrink: 0 }} /><div className="txt">This animation is an <b>average year</b> (2001–2022), not a particular year. Each frame is one calendar day.</div></div>
        <ListeningGuide workspace="visual" />
        <p className="muted" style={{ fontSize: 11.5 }}>Credit: NASA's Scientific Visualization Studio (visualizer Alex Kekesi; science George Huffman, Jackson Tan). <a href="https://svs.gsfc.nasa.gov/5478/" target="_blank" rel="noreferrer">svs.gsfc.nasa.gov/5478</a></p>
      </div>
    </section>
  );
}

function useStage(aspect: number, fill: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const w = fill ? Math.max(box.w, box.h * aspect) : Math.min(box.w, box.h * aspect);
  return { ref, w, h: w / aspect };
}

function VisualFeed({ preset }: { preset: boolean }) {
  const media = useStore((s) => s.media);
  const link = useStore((s) => s.link);
  const visual = useStore((s) => s.visual);
  const panelRef = useRef<HTMLElement>(null);
  const [displayed, setDisplayed] = useState<{ day: number; src: string; roi: boolean } | null>(null);
  const [failed, setFailed] = useState<number | null>(null);
  const frames = media.manifest?.frames;
  const linked = link.state === 'reconstructed';
  const explore = useStore((s) => s.explore);
  const scanDoc = useStore((s) => s.frameScan.doc);
  const imageOn = useStore((s) => s.image.enabled);
  const sweepP = useSweepProgress('visual');
  const globalBytes = useStore((s) => s.frameScan.globalBytes);
  const reduced = useStore((s) => s.a11y.reducedMotion);
  // the grid the sweep reads: the whole frame (or the user's crop) in the full view, the West Pacific grid in ROI view
  const sg = useMemo(() => (scanDoc && imageOn ? visualScanGrid(visual.day) : null), [scanDoc, globalBytes, imageOn, visual.day, visual.roi, visual.crop]); // eslint-disable-line react-hooks/exhaustive-deps
  const systems = useMemo(() => (sg ? detectSystems(sg) : []), [sg]);
  const canCrop = !!scanDoc && imageOn;
  const roiOn = visual.roi || !!visual.crop;
  const [showRoi, setShowRoi] = useState(false);
  useEffect(() => { if (visual.cropping) setShowRoi(true); }, [visual.cropping]);
  useEffect(() => {
    if (!visual.cropping) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setVisual({ cropping: false }); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visual.cropping]);

  useEffect(() => {
    if (!frames) { setDisplayed(null); return; }
    const day = visual.day, roi = visual.roi;
    const f = frames[day];
    if (!f) return;
    const src = svsUrl(roi ? f.roi : f.full);
    let alive = true;
    setFailed(null);
    if (frameReady(day)) { setDisplayed({ day, src, roi }); return; }
    loadFrame(day).then(() => { if (alive) setDisplayed({ day, src, roi }); }).catch(() => { if (alive) setFailed(day); });
    return () => { alive = false; };
  }, [frames, visual.day, visual.roi]);

  const pending = displayed && (displayed.day !== visual.day || displayed.roi !== visual.roi);
  const shownFrame = displayed ? frames?.[displayed.day] : null;
  const full = media.manifest?.bounds ?? { lonMin: -180, lonMax: 180, latMin: -90, latMax: 90 };
  // Isolate: the stage shows only the ROI (the frame image is scaled and shifted inside it); paused while drawing a new one
  const zoom = !visual.roi && visual.crop && visual.isolate && !visual.cropping ? visual.crop : null;
  const box = media.manifest ? (visual.roi ? media.manifest.roi : zoom ?? full) : full;
  const pct = (lon: number, lat: number) => ({ x: ((lon - box.lonMin) / (box.lonMax - box.lonMin)) * 100, y: ((box.latMax - lat) / (box.latMax - box.latMin)) * 100 });
  const a = pct(PH_BOX.lonMin, PH_BOX.latMax), b = pct(PH_BOX.lonMax, PH_BOX.latMin);
  const aspect = media.manifest ? (visual.roi ? media.manifest.roi.pixelSize[0] / media.manifest.roi.pixelSize[1] : zoom ? (zoom.lonMax - zoom.lonMin) / (zoom.latMax - zoom.latMin) : 2) : 2;
  const stage = useStage(aspect, visual.fit === 'fill');
  const fullscreen = () => { const el = panelRef.current; if (!el) return; if (document.fullscreenElement) void document.exitFullscreen(); else void el.requestFullscreen?.(); };

  return (
    <section className="panel main-panel" aria-labelledby="feed-title" ref={panelRef}>
      <div className="panel-head">
        <h2 className="panel-title" id="feed-title">Visual feed</h2>
        <span className="spacer" />
        <div className="seg" role="group" aria-label="Feed mode">
          <button aria-pressed={visual.mode === 'frame'} onClick={() => { setVisual({ mode: 'frame' }); if (controller.state !== 'stopped') controller.pause('frame mode'); }}>Frame</button>
          <button aria-pressed={visual.mode === 'timelapse'} onClick={() => setVisual({ mode: 'timelapse' })}>Timelapse</button>
        </div>
        <button className={`btn small ${roiOn || showRoi ? 'active' : ''}`} aria-expanded={showRoi} aria-controls="roi-bar" onClick={() => setShowRoi(!showRoi)} disabled={media.state !== 'ready'}
          title="Region of interest: crop part of the map, isolate it, and hear only that region"><I.Roi /> ROI{roiOn ? ' · on' : ''}</button>
        {!preset && <select value={visual.fit} onChange={(e) => setVisual({ fit: e.target.value as 'fit' | 'fill' })} aria-label="Image fit"><option value="fit">Fit</option><option value="fill">Fill</option></select>}
        <button className="btn small" onClick={() => void scanCurrent()} disabled={!scanDoc || !imageOn || media.state !== 'ready'} aria-keyshortcuts="S"><I.Wave size={14} /> {roiOn ? 'Sweep ROI' : 'Sweep frame'}</button>
        <button className="btn icon small" onClick={fullscreen} aria-label="Toggle fullscreen"><I.Expand /></button>
      </div>
      {showRoi && media.state === 'ready' && <RoiBar canDraw={canCrop} />}
      <div className={`frame-wrap ${visual.roi ? 'roi' : ''}`} ref={stage.ref}>
        {media.state !== 'ready' && (
          <div className="feed-empty">
            <div className="frame-label" style={{ top: 12, right: 12 }}>Preview placeholder</div>
            <div style={{ position: 'relative', width: '60%', maxWidth: 560, aspectRatio: '2 / 1', border: '1px dashed var(--line-2)', borderRadius: 6 }} aria-hidden="true">
              <div className="roi-box" style={{ left: `${pct(PH_BOX.lonMin, PH_BOX.latMax).x}%`, top: `${pct(PH_BOX.lonMin, PH_BOX.latMax).y}%`, width: `${b.x - a.x}%`, height: `${b.y - a.y}%` }} />
              <span className="roi-tag" style={{ left: `${b.x + 2}%`, top: `${a.y - 12}%`, background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--line-2)' }}>Requested ROI · Philippines</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>{media.state === 'loading' ? media.message : media.state === 'error' ? 'The NASA visual feed could not be loaded' : preset ? 'Watch and hear a year of rain' : 'Import NASA video or frame sequence'}</div>
            {media.state === 'error' && <div className="callout danger"><I.Warn /><div className="txt">{media.message}</div></div>}
            <div className="row">
              {preset
                ? <button className="btn primary solid" onClick={() => void quickStartVisual()} disabled={media.state === 'loading'}><I.Play /> Open NASA rainfall animation</button>
                : <button className="btn primary" onClick={() => void importVisualFeed()} disabled={media.state === 'loading'}><I.Play /> {media.state === 'error' ? 'Retry import' : 'Import visual feed'}</button>}
              <a className="btn" href="https://svs.gsfc.nasa.gov/5478/" target="_blank" rel="noreferrer"><I.External /> Open NASA source</a>
            </div>
            <div className="italic dim">No NASA frame is displayed yet</div>
          </div>
        )}
        {media.state === 'ready' && displayed && (
          <>
            <div style={{ position: 'relative', width: stage.w, height: stage.h, flex: 'none', outline: 'none', overflow: 'hidden' }}
              tabIndex={scanDoc && imageOn ? 0 : -1} role="application"
              aria-label={`Explore the frame by touch or keyboard: arrow keys move a ${sg?.step ?? 1}-degree cursor over ${sg?.area ?? 'the frame'} and you hear and read the rain there. Press S to sweep it west to east.`}
              onKeyDown={(e) => {
                const k: Record<string, [number, number]> = { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
                if (k[e.key]) { e.preventDefault(); e.stopPropagation(); exploreMove(k[e.key][0] * (e.shiftKey ? 5 : 1), k[e.key][1] * (e.shiftKey ? 5 : 1)); }
              }}
              onPointerMove={(e) => {
                if (!scanDoc || !imageOn || (e.pointerType === 'mouse' && e.buttons === 0 && !e.altKey)) return;
                const r = e.currentTarget.getBoundingClientRect();
                const lon = box.lonMin + ((e.clientX - r.left) / r.width) * (box.lonMax - box.lonMin);
                const lat = box.latMax - ((e.clientY - r.top) / r.height) * (box.latMax - box.latMin);
                const g = sg;
                if (!g) return;
                const col = Math.floor((lon - g.lonMin) / g.step), row = Math.floor((lat - g.latMin) / g.step);
                if (col >= 0 && row >= 0 && col < g.ncol && row < g.nrow && (explore?.col !== col || explore?.row !== row)) exploreAt(row, col);
              }}>
            <img src={displayed.src}
              style={zoom && !displayed.roi ? {
                position: 'absolute', maxWidth: 'none', maxHeight: 'none', opacity: pending ? 0.25 : 1,
                width: (stage.w * (full.lonMax - full.lonMin)) / (zoom.lonMax - zoom.lonMin), height: (stage.h * (full.latMax - full.latMin)) / (zoom.latMax - zoom.latMin),
                left: (-stage.w * (zoom.lonMin - full.lonMin)) / (zoom.lonMax - zoom.lonMin), top: (-stage.h * (full.latMax - zoom.latMax)) / (zoom.latMax - zoom.latMin),
              } : { width: '100%', height: '100%', opacity: pending ? 0.25 : 1 }}
              alt={`NASA SVS 5478 IMERG precipitation climatology frame for ${shownFrame?.label} (seasonal average 2001–2022)${visual.roi ? ', West Pacific region of interest' : zoom ? `, zoomed to your region of interest ${roiLabel()}` : ''}`}
              />
            {!visual.roi && (
              <>
                <div className="roi-box" style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${b.x - a.x}%`, height: `${b.y - a.y}%` }} />
                <span className="roi-tag" style={{ left: `calc(${b.x}% + 8px)`, top: `calc(${a.y}% - 4px)` }} title="The area the linked measurements (piano) describe">{REGION_NAMES[visual.regionId]} · measured area</span>
              </>
            )}
            {visual.roi && <div className="roi-box" style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${b.x - a.x}%`, height: `${b.y - a.y}%` }} />}
            {sg && imageOn && (() => {
              const g = sg;
              const dim = visual.crop && !visual.roi && !zoom;
              const ca0 = dim ? pct(visual.crop!.lonMin, visual.crop!.latMax) : null, ca1 = dim ? pct(visual.crop!.lonMax, visual.crop!.latMin) : null;
              return (
                <>
                  {ca0 && ca1 && <div className="crop-box" aria-hidden="true" style={{ left: `${ca0.x}%`, top: `${ca0.y}%`, width: `${ca1.x - ca0.x}%`, height: `${ca1.y - ca0.y}%` }}><span>Your ROI · {fmtLat(visual.crop!.latMin)}–{fmtLat(visual.crop!.latMax)}, {fmtLon(visual.crop!.lonMin)}–{fmtLon(visual.crop!.lonMax)}</span></div>}
                  <ScanOverlay grid={g} systems={systems} box={box} progress={sweepP} reduced={reduced} />
                  {explore && (() => {
                    const ca = pct(g.lonMin + explore.col * g.step, g.latMin + (explore.row + 1) * g.step), cb = pct(g.lonMin + (explore.col + 1) * g.step, g.latMin + explore.row * g.step);
                    return <div aria-hidden="true" style={{ position: 'absolute', left: `${ca.x}%`, top: `${ca.y}%`, width: `${cb.x - ca.x}%`, height: `${cb.y - ca.y}%`, border: '2px solid #fff', boxShadow: '0 0 0 1px #000' }} />;
                  })()}
                </>
              );
            })()}
            {visual.cropping && canCrop && <CropLayer box={box} onDone={(c) => (c ? setRoi(c) : setVisual({ cropping: false }))} />}
            </div>
            <div className="frame-label" style={{ top: 10, left: 10, fontWeight: 600 }}>IMERG precipitation climatology</div>
            {zoom && <div className="frame-label roi-zoom-label" style={{ top: 44, left: 10 }}>Isolated ROI · {roiLabel()} · zoomed NASA frame</div>}
            <div className="frame-label" style={{ top: 10, right: 10, fontSize: 12 }}>Authentic NASA SVS frame #{shownFrame?.sourceFrame}</div>
            <div className="frame-label" style={{ bottom: 10, right: 10 }} aria-live="off">
              {pending ? `Loading ${frames?.[visual.day]?.label}…` : `Day ${displayed.day + 1} · ${shownFrame?.label} · seasonal average`}
            </div>
            <div className="colorbar-box">
              <img src={svsUrl(media.manifest!.colorbar.path)} alt="NASA SVS colorbar: precipitation climatology 0 to 24 mm per day" />
              <div className="muted" style={{ fontSize: 11 }}>NASA colorbar in mm/day · app values in mm/hr (×24 = mm/day)</div>
            </div>
          </>
        )}
        {media.state === 'ready' && failed != null && (
          <div className="feed-empty"><div className="callout danger"><I.Warn /><div><div className="ttl">Frame for day {failed + 1} failed to load</div><div className="txt">No earlier frame is reused under this date.</div>
            <button className="btn small" style={{ marginTop: 6 }} onClick={() => setVisual({ day: failed })}>Retry</button></div></div></div>
        )}
      </div>
      {media.state === 'ready' && visual.mode === 'frame' && frames && (
        <div className="panel-foot">
          <label htmlFor="day-slider" className="muted">Seasonal day</label>
          <input id="day-slider" type="range" min={0} max={frames.length - 1} value={visual.day}
            onChange={(e) => { const d = Number(e.target.value); if (linked) seek(d); else setVisual({ day: d }); }}
            aria-valuetext={`Day ${visual.day + 1}, ${frames[visual.day]?.label}`} style={{ flex: 1 }} />
          <span className="mono">{frames[visual.day]?.label}</span>
        </div>
      )}
      <div className="panel-foot">
        {media.state === 'ready' ? (
          <>
            <I.Roi />
            <label className="row">Selection:
              <select value={visual.regionId} onChange={(e) => setVisualRegion(e.target.value)} aria-label="Region for linked measurements">
                {Object.entries(REGION_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <span>Aggregation: <b>area mean</b></span>
            <button className="btn small" disabled={!linked} onClick={() => set({ chartTab: 'details' })}><I.Chart /> Inspect values</button>
            <span className="chip note" style={{ marginLeft: 'auto' }}><I.Info size={13} /> Seasonal average ≠ historical event</span>
            {!linked && visual.mode === 'timelapse' && <button className="btn small" onClick={() => void togglePlay()} disabled title="Connect measurements first">Play</button>}
          </>
        ) : (
          <>
            <div className="callout note" style={{ width: '100%', padding: '5px 10px' }}><I.Info size={15} /> Seasonal climatology · not an individual historical event</div>
            <span><I.Caret size={12} /> Source colorbar · import with media</span>
            <span>Frame-to-date mapping: <b>Required</b></span>
            <span>Measurement alignment: <b>Not configured</b></span>
          </>
        )}
      </div>
    </section>
  );
}

/** Region of interest: quick picks, draw on the map, or type the edges (the keyboard way), and isolate. */
function RoiBar({ canDraw }: { canDraw: boolean }) {
  const visual = useStore((s) => s.visual);
  const manifest = useStore((s) => s.media.manifest);
  const roiVoice = useStore((s) => s.image.roiVoice);
  const imageOn = useStore((s) => s.image.enabled);
  const cur: CropBox | null = visual.roi ? manifest?.roi ?? null : visual.crop;
  const asText = (b: CropBox | null) => ({ lonMin: b ? String(b.lonMin) : '', lonMax: b ? String(b.lonMax) : '', latMin: b ? String(b.latMin) : '', latMax: b ? String(b.latMax) : '' });
  const [draft, setDraft] = useState(asText(cur));
  const [err, setErr] = useState('');
  useEffect(() => { setDraft(asText(cur)); setErr(''); }, [cur?.lonMin, cur?.lonMax, cur?.latMin, cur?.latMax]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = (p: (typeof ROI_PRESETS)[number]) => p.box === null ? !roiActive() : p.box === 'west-pacific' ? visual.roi
    : !visual.roi && !!visual.crop && (['lonMin', 'lonMax', 'latMin', 'latMax'] as const).every((k) => visual.crop![k] === (p.box as CropBox)[k]);
  const apply = () => {
    const b = normaliseRoi({ lonMin: parseFloat(draft.lonMin), lonMax: parseFloat(draft.lonMax), latMin: parseFloat(draft.latMin), latMax: parseFloat(draft.latMax) });
    if (typeof b === 'string') { setErr(b); return; }
    setErr('');
    setRoi(b);
  };
  const field = (k: keyof CropBox, label: string, hint: string, min: number, max: number) => (
    <label className="roi-field"><span>{label}</span>
      <input type="number" inputMode="decimal" step={0.5} min={min} max={max} value={draft[k]} aria-label={`${label} edge, ${hint}`}
        onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} className="num-input" />
    </label>
  );
  return (
    <div id="roi-bar" className="roi-bar" role="group" aria-label="Region of interest">
      <div className="row roi-row">
        <b className="roi-bar-title">Region of interest</b>
        <div className="seg roi-picks" role="group" aria-label="Quick regions">
          {ROI_PRESETS.map((p) => <button key={p.id} aria-pressed={active(p)} onClick={() => setRoi(p.box)}>{p.label}</button>)}
        </div>
        <button className={`btn small ${visual.cropping ? 'active' : 'primary'}`} aria-pressed={visual.cropping} disabled={!canDraw}
          onClick={() => setVisual({ cropping: !visual.cropping })} title={canDraw ? 'Drag a box on the map' : 'Turn image features on to crop the map'}>
          <I.Roi size={14} /> {visual.cropping ? 'Drawing… Esc to cancel' : 'Draw on map'}
        </button>
      </div>
      <form className="row roi-row" onSubmit={(e) => { e.preventDefault(); apply(); }}>
        {field('lonMin', 'West', 'degrees east, negative for west', -180, 180)}
        {field('lonMax', 'East', 'degrees east, negative for west', -180, 180)}
        {field('latMin', 'South', 'degrees north, negative for south', -90, 90)}
        {field('latMax', 'North', 'degrees north, negative for south', -90, 90)}
        <button type="submit" className="btn small">Apply</button>
        {visual.crop && !visual.roi && (
          <label className="row roi-isolate"><input type="checkbox" checked={visual.isolate} onChange={(e) => setVisual({ isolate: e.target.checked })} /> Isolate (zoom the map to it)</label>
        )}
        {roiActive() && <button type="button" className="btn small ghost" onClick={() => setRoi(null)}><I.X size={13} /> Clear</button>}
        {err && <span className="roi-err" role="alert">{err}</span>}
      </form>
      <div className="muted roi-status">
        {roiActive()
          ? <>Sounds from <b>{roiLabel()}</b>: the sweep (S), the Frame score, the explore cursor{imageOn && roiVoice ? ' and the ROI voice (a plucked note per day: higher = more rain)' : ''}. Image-derived from NASA's colours. The piano still plays the linked {REGION_NAMES[visual.regionId]} measurements.</>
          : <>No region: the sweep reads the whole frame. Pick a region, draw a box on the map, or type its edges in degrees.</>}
      </div>
    </div>
  );
}

function SoundStudio() {
  const media = useStore((s) => s.media);
  const link = useStore((s) => s.link);
  const linked = link.state === 'reconstructed';
  const mode = useStore((s) => s.sound.mode);
  return (
    <section className={`panel sound-mode-${mode}`} aria-labelledby="studio-title">
      <div className="panel-head"><h2 className="panel-title" id="studio-title">Sound studio</h2><span className="spacer" /><ModeTag /></div>
      <div className="panel-body">
        <div className="field" style={{ gridTemplateColumns: '60px 1fr' }}>
          <span className="label">Source</span>
          <div style={{ display: 'grid', gap: 5 }}>
            <span className={`chip ${linked ? 'accent' : link.state === 'incompatible' ? 'danger' : ''}`}><I.Link size={13} /> Linked measurements — {linked ? 'Reconstructed' : link.state === 'incompatible' ? 'Incompatible' : 'Not connected'}</span>
            <ImageFeaturesToggle />
          </div>
        </div>
        {media.state === 'ready' && !linked && (
          <div className="callout" style={{ marginBottom: 10 }}>
            <I.Warn style={{ color: 'var(--amber)', flexShrink: 0 }} />
            <div>
              <div className="ttl">{link.state === 'incompatible' ? 'Measurements are incompatible' : 'Connect matching climatology data'}</div>
              <div className="txt">{link.state === 'incompatible' ? link.message : 'Monthly historical data cannot be assumed to match these frames. Connect the seasonal climatology reconstructed from IMERG V07B (2001–2022).'}</div>
              <button className="btn small primary" style={{ marginTop: 6 }} onClick={() => void connectClimatology()} disabled={link.state === 'loading'}><I.Link /> Connect climatology</button>
            </div>
          </div>
        )}
        {media.state !== 'ready' && (
          <div className="callout" style={{ marginBottom: 10 }}><I.Warn style={{ color: 'var(--amber)', flexShrink: 0 }} /><div><div className="ttl">Import the NASA visual feed first</div><div className="txt">Graphs and audio stay disabled until measurements are connected to the media.</div></div></div>
        )}
        {linked && (
          <div className="callout note" style={{ marginBottom: 10 }}>
            <I.Info style={{ flexShrink: 0 }} /><div><div className="ttl">Reconstructed — approximate</div>
              <div className="txt">Daily values rebuilt from monthly IMERG means (2001–2022), interpolated and smoothed with a trailing 30-day mean like the SVS product. Not the exact data behind the frames.</div>
              <button className="btn small ghost" onClick={disconnectClimatology}>Disconnect</button></div>
          </div>
        )}
        <div className="field" style={{ gridTemplateColumns: '80px 1fr' }}><span className="label">Sound mode</span><ModeTabs /></div>
        <div style={{ marginBottom: 10 }}><ModeBanner /></div>
        {mode === 'musical' && <><InstrumentRow /><ScaleRow /></>}
        <Disclosure title="Mappings" defaultOpen>
          {mode === 'musical' ? <MappingRows compact /> : <GeophonyMapping />}
        </Disclosure>
        {mode === 'musical' && <PitchRange />}
        <MasterVolume />
        <div className="dim" style={{ fontSize: 12 }}>Elements (click to mute)</div>
        <ElementMutes />
        <div style={{ marginBottom: 8 }}><LegendButton /></div>
        <Disclosure title="Frame alignment" extra={<span className="chip" style={{ fontSize: 11 }}>{media.alignment ? `${media.alignment.dayRuns} days verified` : 'Use supplied frame-to-date list'}</span>}>
          {media.alignment ? (
            <dl className="kv" style={{ gridTemplateColumns: '120px 1fr', fontSize: 12 }}>
              <dt>Method</dt><dd style={{ fontFamily: 'var(--font)' }}>{media.alignment.method}</dd>
              <dt>Frames → days</dt><dd>{media.alignment.overlayFrames} → {media.alignment.dayRuns}</dd>
              <dt>Feb 29</dt><dd style={{ fontFamily: 'var(--font)' }}>Present in frames, absent from IMERGclim_dates2.txt ({media.alignment.datesListLines} lines)</dd>
              <dt>Spot checks</dt><dd>{media.alignment.manualSpotChecks.map((s) => `#${s.frame} = ${s.overlay}`).join(' · ')}</dd>
              <dt>Linkage</dt><dd style={{ fontFamily: 'var(--font)' }}>{link.climatology?.method ?? 'not connected'}</dd>
            </dl>
          ) : <p className="muted" style={{ fontSize: 12 }}>Import the media to inspect frame-to-date evidence.</p>}
        </Disclosure>
        <Disclosure title="Time cues & checkpoints"><TimeCueControls /></Disclosure>
        <Disclosure title="Layer levels"><LayerLevels /></Disclosure>
        <div className="disclosure" style={{ opacity: 0.55, cursor: 'default' }}><I.Caret /> Hybrid · Later</div>
      </div>
    </section>
  );
}

function PresetSoundStudio() {
  const media = useStore((s) => s.media);
  const link = useStore((s) => s.link);
  const linked = link.state === 'reconstructed';
  const soundMode = useStore((s) => s.sound.mode);
  return (
    <section className={`panel sound-mode-${soundMode}`} aria-labelledby="studio-title">
      <div className="panel-head"><h2 className="panel-title" id="studio-title">Sound</h2><span className="spacer" /><ModeTag /></div>
      <div className="panel-body">
        {media.state === 'ready' && !linked && (
          <div className="callout" style={{ marginBottom: 10 }}>
            <I.Warn style={{ color: 'var(--amber)', flexShrink: 0 }} />
            <div><div className="ttl">Sound needs the matching measurements</div>
              <button className="btn small primary" style={{ marginTop: 6 }} onClick={() => void quickStartVisual()} disabled={link.state === 'loading'}><I.Link /> Connect and play</button></div>
          </div>
        )}
        {linked && (
          <div className="callout note" style={{ marginBottom: 10 }}>
            <I.Info style={{ flexShrink: 0 }} /><div><div className="ttl">Reconstructed — approximate</div>
              <div className="txt">The sound uses daily values rebuilt from monthly NASA measurements (2001–2022), not the exact data behind the frames.</div></div>
          </div>
        )}
        <div className="preset-label">How to listen</div>
        <ListeningPresetCards workspace="visual" />
        <div className="preset-label">Volume &amp; help</div>
        <MasterVolume />
        <NarrationToggle />
        <div className="legend-actions"><LegendButton /></div>
        <p className="muted" style={{ fontSize: 11.5 }}>Press <span className="kbd">S</span> to hear the whole frame as {SCAN.global.beats} beats from west to east (the ROI view sweeps {SCAN.beats} beats). Rain systems light up as the line crosses them.</p>
      </div>
    </section>
  );
}

function ImageFeaturesToggle() {
  const image = useStore((s) => s.image);
  const fs = useStore((s) => s.frameScan);
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <button className={`chip ${image.enabled ? 'accent' : ''}`} style={{ cursor: 'pointer', textAlign: 'left', background: image.enabled ? 'var(--accent-soft)' : 'transparent', font: 'inherit', fontSize: 12.5 }} aria-pressed={image.enabled} onClick={() => setImage({ enabled: !image.enabled })}>
        <I.Image size={13} /> Image features · decoded from NASA colorbar — {image.enabled ? 'on' : 'off'}
      </button>
      {image.enabled && fs.doc && (
        <>
          <label className="row" style={{ fontSize: 12.5 }}><input type="checkbox" checked={image.featureVoice} onChange={(e) => setImage({ featureVoice: e.target.checked })} /> Rain-band voice (follows the band north/south)</label>
          <label className="row" style={{ fontSize: 12.5 }}><input type="checkbox" checked={image.sweepEveryFrame} onChange={(e) => setImage({ sweepEveryFrame: e.target.checked })} /> Sweep every frame during timelapse (≤1 day/s)</label>
          <label className="row" style={{ fontSize: 12.5 }}><input type="checkbox" checked={image.roiVoice} onChange={(e) => setImage({ roiVoice: e.target.checked })} /> ROI voice: a plucked note per day for the rain inside your region of interest</label>
          <span className="muted" style={{ fontSize: 11 }}>Decoded values agree with the IMERG reconstruction: r = {fs.doc.decodeValidation.vsReconstructedClimatology.pearsonR}, bias {fs.doc.decodeValidation.vsReconstructedClimatology.meanBiasMmDay} mm/day.</span>
        </>
      )}
      {fs.state === 'error' && <span className="muted" style={{ fontSize: 11 }}>Frame data unavailable: {fs.message}</span>}
    </div>
  );
}

function FrameDescribe() {
  const visual = useStore((s) => s.visual);
  const doc = useStore((s) => s.frameScan.doc);
  const fsState = useStore((s) => s.frameScan.state);
  const imageOn = useStore((s) => s.image.enabled);
  const media = useStore((s) => s.media);
  const link = useStore((s) => s.link);
  const grid = useMemo(() => currentScanGrid(), [visual.day, visual.roi, visual.crop, doc, imageOn, media.state]); // eslint-disable-line react-hooks/exhaustive-deps
  const meas = useMemo(() => seasonalObservations(), [link.climatology, visual.regionId, media.manifest]); // eslint-disable-line react-hooks/exhaustive-deps
  const sweepEv = useMemo(() => (grid ? currentScanEvents() : []), [grid]); // eslint-disable-line react-hooks/exhaustive-deps
  if (media.state !== 'ready') return <div className="empty"><I.Info size={28} /><div className="big">Import the visual feed to hear and read each frame</div></div>;
  if (!imageOn) return <div className="empty"><I.Image size={28} /><div>Image features are off. Turn them on in Sound Studio.</div></div>;
  if (!doc || !grid) return <div className="empty"><div>{fsState === 'loading' ? 'Decoding frames…' : 'Frame data unavailable'}</div></div>;
  const f = doc.days[visual.day];
  const profile = columnProfile(grid);
  const profKnown = profile.filter((v): v is number => v != null);
  const wettestCol = profile.indexOf(Math.max(...profKnown));
  const band = doc.days.map((d) => d.bandLat);
  const ph = doc.days.map((d) => d.phLandMmDay);
  return (
    <div>
      <p style={{ margin: '0 0 8px', fontSize: 13.5, lineHeight: 1.45 }}>{describeFrame(f, doc.days, meas[visual.day]?.value ?? null)}</p>
      <p className="dim" style={{ margin: '0 0 8px', fontSize: 12.5, lineHeight: 1.45 }}><b>The frame as music:</b> {describeSweep(sweepEv, grid.beats ?? SCAN.beats)}</p>
      <div className="row" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
        <button className="btn small primary" onClick={() => void scanCurrent()}><I.Wave size={13} /> Sweep this frame (S)</button>
        <span className="muted" style={{ fontSize: 11.5 }}>Explore: focus the frame, then use the arrow keys (Shift = 5°)</span>
      </div>
      <BrailleChart title="This frame, west → east (rain per longitude)" values={profile} range={[0, 24]}
        summary={`From 95°E to 150°E; wettest near ${(95.5 + wettestCol).toFixed(0)}°E at ${Math.max(...profKnown).toFixed(1)} mm/day (column mean), driest ${Math.min(...profKnown).toFixed(1)} mm/day.`} />
      <BrailleChart title="Philippines over the year (image-derived)" values={ph} index={visual.day}
        summary={`Jan → Dec. Lowest ${Math.min(...ph.map((v) => v ?? 99)).toFixed(1)} mm/day, highest ${Math.max(...ph.map((v) => v ?? 0)).toFixed(1)} mm/day; today ${f.phLandMmDay?.toFixed(1)} mm/day. The pointer line marks today.`} />
      <BrailleChart title="Rain-band latitude over the year" values={band} index={visual.day} range={[-10, 30]}
        summary={`Higher = farther north. The band moves from about ${Math.min(...band.map((v) => v ?? 99)).toFixed(0)}° to ${Math.max(...band.map((v) => v ?? -99)).toFixed(0)}°N; today ${f.bandLat?.toFixed(1)}° and ${f.bandTrend === 'steady' ? 'steady' : 'moving ' + f.bandTrend}.`} />
    </div>
  );
}

function SeasonalGraph({ preset }: { preset: boolean }) {
  const link = useStore((s) => s.link);
  const visual = useStore((s) => s.visual);
  const media = useStore((s) => s.media);
  const tab = useStore((s) => s.graphTab);
  const visualCheckpoints = useStore((s) => s.checkpoints.visual);
  const setTabState = (t: 'describe' | 'rain' | 'band' | 'dist') => set({ graphTab: t });
  const doc = useStore((s) => s.frameScan.doc);
  const obs = useMemo(() => seasonalObservations(), [link.climatology, visual.regionId, media.manifest]); // eslint-disable-line react-hooks/exhaustive-deps
  const linked = link.state === 'reconstructed' && obs.length > 0;
  const ticks = useMemo(() => (media.manifest?.frames ?? []).map((f, i) => ({ f, i })).filter(({ f }) => f.label.endsWith(' 01') && ['Jan', 'Apr', 'Jul', 'Oct'].includes(f.label.slice(0, 3))).map(({ f, i }) => ({ index: i, label: f.label.slice(0, 3) })), [media.manifest]);
  const cur = obs[visual.day];
  return (
    <section className="panel" aria-labelledby="graphs-title">
      <div className="panel-head"><h2 className="panel-title" id="graphs-title">Graphs</h2></div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="seg" role="tablist" aria-label="Graph type" style={{ width: '100%' }}>
          <button role="tab" style={{ flex: 1 }} aria-selected={tab === 'describe'} onClick={() => setTabState('describe')}>Describe</button>
          <button role="tab" style={{ flex: 1 }} aria-selected={tab === 'rain'} onClick={() => setTabState('rain')}>Rainfall</button>
          <button role="tab" style={{ flex: 1 }} aria-selected={tab === 'band'} onClick={() => setTabState('band')}>Band</button>
          {!preset && <button role="tab" style={{ flex: 1 }} aria-selected={tab === 'dist'} onClick={() => setTabState('dist')}>Distrib.</button>}
        </div>
        {tab === 'describe' ? (
          <FrameDescribe />
        ) : tab === 'band' ? (
          doc ? (
            <>
              <div className="row"><b>Rain-band latitude (image-derived)</b><span className="spacer" /><span className="mono">{doc.days[visual.day]?.bandLat?.toFixed(1)}°</span></div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <TimeSeriesGraph points={doc.days.map((d) => ({ key: d.label, value: d.bandLat != null ? d.bandLat + 10 : null }))} cursor={visual.day} onSelect={(i) => (linked ? seek(i) : setVisual({ day: i }))}
                  yLabel="lat + 10°" ticks={ticks} formatValue={(v) => `${(v - 10).toFixed(1)}°`} color="#a78bfa"
                  describe={`Latitude of the heaviest rain band in the Philippine sector across the year. Today ${doc.days[visual.day]?.bandLat?.toFixed(1)} degrees.`} />
              </div>
            </>
          ) : <div className="empty">Import the visual feed first</div>
        ) : !linked ? (
          <div className="empty" style={{ border: '1px dashed var(--line-2)', borderRadius: 8 }}>
            <I.Chart size={34} /><div className="big">Connect numerical data to show graphs</div><div className="italic">No values inferred from this preview</div>
          </div>
        ) : tab === 'rain' ? (
          <>
            <div className="row"><b>{REGION_NAMES[visual.regionId]} · seasonal mean</b><span className="spacer" /><span className="mono">{cur?.value?.toFixed(3)} mm/hr</span></div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <TimeSeriesGraph points={obs.map((o, i) => ({ key: media.manifest!.frames[i].label, value: o.value }))} cursor={visual.day} onSelect={(i) => seek(i)}
                reference={seasonalContexts(obs.map((o) => o.value)).map((c) => c.normal)} referenceLabel="yearly average"
                marks={visualCheckpoints.map((c) => ({ index: Number(c.key.slice(1)) - 1, label: c.label }))}
                yLabel="mm/hr" ticks={ticks} describe={`Reconstructed seasonal mean rainfall for ${REGION_NAMES[visual.regionId]}. Current day ${media.manifest!.frames[visual.day]?.label}: ${cur?.value?.toFixed(3)} mm/hr.`} />
            </div>
          </>
        ) : (
          <Distribution values={obs.map((o) => o.value ?? 0)} current={cur?.value ?? null} />
        )}
      </div>
    </section>
  );
}

function Distribution({ values, current }: { values: number[]; current: number | null }) {
  const bins = 12;
  const max = Math.max(...values) * 1.0001, min = Math.min(...values);
  const counts = Array(bins).fill(0);
  values.forEach((v) => counts[Math.min(bins - 1, Math.floor(((v - min) / (max - min)) * bins))]++);
  const top = Math.max(...counts);
  const ci = current == null ? -1 : Math.min(bins - 1, Math.floor(((current - min) / (max - min)) * bins));
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 3, padding: '8px 4px 0' }} role="img" aria-label={`Distribution of daily seasonal values from ${min.toFixed(2)} to ${max.toFixed(2)} mm/hr`}>
      {counts.map((c, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{ width: '100%', height: `${(c / top) * 150}px`, background: i === ci ? 'var(--amber)' : 'var(--accent)', opacity: 0.8, borderRadius: 2 }} />
          <span className="mono" style={{ fontSize: 9.5 }}>{(min + ((i + 0.5) * (max - min)) / bins).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}
