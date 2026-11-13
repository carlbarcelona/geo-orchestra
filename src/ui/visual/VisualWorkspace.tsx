import { useEffect, useMemo, useRef, useState } from 'react';
import { controller } from '../../playback/controller';
import {
  connectClimatology, disconnectClimatology, frameReady, importVisualFeed, loadFrame, seasonalEventsCached, seasonalObservations,
  seek, setTab, setVisual, setVisualRegion, svsUrl, togglePlay,
} from '../../state/actions';
import { set, useStore } from '../../state/store';
import * as I from '../icons';
import { MusicChart } from '../shared/MusicChart';
import { Disclosure, InstrumentRow, LegendButton, MappingRows, MasterVolume, ModeTabs, PitchRange, ScaleRow, LayerLevels } from '../shared/SoundControls';
import { TimeSeriesGraph } from '../shared/TimeSeriesGraph';

const PH_BOX = { lonMin: 116, lonMax: 127.5, latMin: 4.5, latMax: 21.5 };
const REGION_NAMES: Record<string, string> = { philippines: 'Philippines', luzon: 'Luzon', visayas: 'Visayas', mindanao: 'Mindanao' };
const SPEEDS = [{ value: 2, label: '2 days/s' }, { value: 5, label: '5 days/s' }, { value: 10, label: '10 days/s' }, { value: 30, label: '30 days/s' }];

export function VisualWorkspace() {
  const media = useStore((s) => s.media);
  const link = useStore((s) => s.link);
  const visual = useStore((s) => s.visual);
  const sound = useStore((s) => s.sound);
  const linked = link.state === 'reconstructed';
  const events = useMemo(() => (linked ? seasonalEventsCached() : []), [linked, link.climatology, visual.regionId, sound.scale, sound.pitchLow, sound.pitchHigh]); // eslint-disable-line react-hooks/exhaustive-deps
  const labels = useMemo(() => media.manifest?.frames.map((f) => f.label) ?? [], [media.manifest]);
  return (
    <main id="main" className="workspace visual" aria-label="Visual feed workspace">
      <NasaDataPanel />
      <VisualFeed />
      <SoundStudio />
      <SeasonalGraph />
      <div className="span-2" style={{ display: 'flex', minHeight: 0, minWidth: 0 }}>
        <MusicChart
          events={events} stepLabels={labels} axisTitle="Seasonal day"
          cursor={visual.day} range={[0, Math.max(0, labels.length - 1)]} speeds={SPEEDS} speed={visual.speed} visibleSteps={30}
          enabled={linked} emptyTitle={media.state === 'ready' ? 'Audio events appear after source alignment' : 'Audio events appear after source alignment'}
          emptyHint={media.state !== 'ready' ? 'No media timeline loaded' : 'Connect matching climatology data in Sound Studio'}
          rightInfo={media.manifest && <span className="chip mono">Day {visual.day + 1}</span>}
          footNote="Video frame index ≠ calendar day · each frame's date is read from the SVS date overlays (366 days, incl. Feb 29)"
        />
      </div>
    </main>
  );
}

function NasaDataPanel() {
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
            <li className="row" style={{ padding: '4px 0 4px 18px' }}><I.File /> Sound mapping: rain-v1</li>
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

function VisualFeed() {
  const media = useStore((s) => s.media);
  const link = useStore((s) => s.link);
  const visual = useStore((s) => s.visual);
  const panelRef = useRef<HTMLElement>(null);
  const [displayed, setDisplayed] = useState<{ day: number; src: string; roi: boolean } | null>(null);
  const [failed, setFailed] = useState<number | null>(null);
  const frames = media.manifest?.frames;
  const linked = link.state === 'reconstructed';

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
  const box = media.manifest ? (visual.roi ? media.manifest.roi : media.manifest.bounds) : { lonMin: -180, lonMax: 180, latMin: -90, latMax: 90 };
  const pct = (lon: number, lat: number) => ({ x: ((lon - box.lonMin) / (box.lonMax - box.lonMin)) * 100, y: ((box.latMax - lat) / (box.latMax - box.latMin)) * 100 });
  const a = pct(PH_BOX.lonMin, PH_BOX.latMax), b = pct(PH_BOX.lonMax, PH_BOX.latMin);
  const aspect = media.manifest ? (visual.roi ? media.manifest.roi.pixelSize[0] / media.manifest.roi.pixelSize[1] : 2) : 2;
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
        <button className={`btn small ${visual.roi ? 'active' : ''}`} aria-pressed={visual.roi} onClick={() => setVisual({ roi: !visual.roi })} disabled={!media.manifest}><I.Roi /> ROI</button>
        <select value={visual.fit} onChange={(e) => setVisual({ fit: e.target.value as 'fit' | 'fill' })} aria-label="Image fit"><option value="fit">Fit</option><option value="fill">Fill</option></select>
        <button className="btn icon small" onClick={fullscreen} aria-label="Toggle fullscreen"><I.Expand /></button>
      </div>
      <div className={`frame-wrap ${visual.roi ? 'roi' : ''}`} ref={stage.ref}>
        {media.state !== 'ready' && (
          <div className="feed-empty">
            <div className="frame-label" style={{ top: 12, right: 12 }}>Preview placeholder</div>
            <div style={{ position: 'relative', width: '60%', maxWidth: 560, aspectRatio: '2 / 1', border: '1px dashed var(--line-2)', borderRadius: 6 }} aria-hidden="true">
              <div className="roi-box" style={{ left: `${pct(PH_BOX.lonMin, PH_BOX.latMax).x}%`, top: `${pct(PH_BOX.lonMin, PH_BOX.latMax).y}%`, width: `${b.x - a.x}%`, height: `${b.y - a.y}%` }} />
              <span className="roi-tag" style={{ left: `${b.x + 2}%`, top: `${a.y - 12}%`, background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--line-2)' }}>Requested ROI · Philippines</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>{media.state === 'loading' ? media.message : media.state === 'error' ? 'The NASA visual feed could not be loaded' : 'Import NASA video or frame sequence'}</div>
            {media.state === 'error' && <div className="callout danger"><I.Warn /><div className="txt">{media.message}</div></div>}
            <div className="row">
              <button className="btn primary" onClick={() => void importVisualFeed()} disabled={media.state === 'loading'}><I.Play /> {media.state === 'error' ? 'Retry import' : 'Import visual feed'}</button>
              <a className="btn" href="https://svs.gsfc.nasa.gov/5478/" target="_blank" rel="noreferrer"><I.External /> Open NASA source</a>
            </div>
            <div className="italic dim">No NASA frame is displayed yet</div>
          </div>
        )}
        {media.state === 'ready' && displayed && (
          <>
            <div style={{ position: 'relative', width: stage.w, height: stage.h, flex: 'none' }}>
            <img src={displayed.src} style={{ width: '100%', height: '100%', opacity: pending ? 0.25 : 1 }} alt={`NASA SVS 5478 IMERG precipitation climatology frame for ${shownFrame?.label} (seasonal average 2001–2022)${visual.roi ? ', West Pacific region of interest' : ''}`}
              />
            {!visual.roi && (
              <>
                <div className="roi-box" style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${b.x - a.x}%`, height: `${b.y - a.y}%` }} />
                <span className="roi-tag" style={{ left: `calc(${b.x}% + 8px)`, top: `calc(${a.y}% - 4px)` }}>{REGION_NAMES[visual.regionId]} ROI</span>
              </>
            )}
            {visual.roi && <div className="roi-box" style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${b.x - a.x}%`, height: `${b.y - a.y}%` }} />}
            </div>
            <div className="frame-label" style={{ top: 10, left: 10, fontWeight: 600 }}>IMERG precipitation climatology</div>
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

function SoundStudio() {
  const media = useStore((s) => s.media);
  const link = useStore((s) => s.link);
  const linked = link.state === 'reconstructed';
  return (
    <section className="panel" aria-labelledby="studio-title">
      <div className="panel-head"><h2 className="panel-title" id="studio-title">Sound studio</h2></div>
      <div className="panel-body">
        <div className="field" style={{ gridTemplateColumns: '60px 1fr' }}>
          <span className="label">Source</span>
          <div style={{ display: 'grid', gap: 5 }}>
            <span className={`chip ${linked ? 'accent' : link.state === 'incompatible' ? 'danger' : ''}`}><I.Link size={13} /> Linked measurements — {linked ? 'Reconstructed' : link.state === 'incompatible' ? 'Incompatible' : 'Not connected'}</span>
            <span className="chip" style={{ opacity: 0.6 }} title="Deferred: image-derived features are not rainfall measurements"><I.Image size={13} /> Image features — Experimental (off)</span>
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
        <InstrumentRow />
        <ScaleRow />
        <Disclosure title="Mappings" defaultOpen>
          <MappingRows compact />
        </Disclosure>
        <PitchRange />
        <MasterVolume />
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
        <Disclosure title="Layer levels"><LayerLevels /></Disclosure>
        <div className="disclosure" style={{ opacity: 0.55, cursor: 'default' }}><I.Caret /> Hybrid · Later</div>
      </div>
    </section>
  );
}

function SeasonalGraph() {
  const link = useStore((s) => s.link);
  const visual = useStore((s) => s.visual);
  const media = useStore((s) => s.media);
  const [tab, setTabState] = useState<'rain' | 'dist'>('rain');
  const obs = useMemo(() => seasonalObservations(), [link.climatology, visual.regionId, media.manifest]); // eslint-disable-line react-hooks/exhaustive-deps
  const linked = link.state === 'reconstructed' && obs.length > 0;
  const ticks = useMemo(() => (media.manifest?.frames ?? []).map((f, i) => ({ f, i })).filter(({ f }) => f.label.endsWith(' 01') && ['Jan', 'Apr', 'Jul', 'Oct'].includes(f.label.slice(0, 3))).map(({ f, i }) => ({ index: i, label: f.label.slice(0, 3) })), [media.manifest]);
  const cur = obs[visual.day];
  return (
    <section className="panel" aria-labelledby="graphs-title">
      <div className="panel-head"><h2 className="panel-title" id="graphs-title">Graphs</h2></div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="seg" role="tablist" aria-label="Graph type" style={{ width: '100%' }}>
          <button role="tab" style={{ flex: 1 }} aria-selected={tab === 'rain'} onClick={() => setTabState('rain')}>Rainfall</button>
          <button role="tab" style={{ flex: 1 }} aria-selected={tab === 'dist'} onClick={() => setTabState('dist')}>Distribution</button>
        </div>
        {!linked ? (
          <div className="empty" style={{ border: '1px dashed var(--line-2)', borderRadius: 8 }}>
            <I.Chart size={34} /><div className="big">Connect numerical data to show graphs</div><div className="italic">No values inferred from this preview</div>
          </div>
        ) : tab === 'rain' ? (
          <>
            <div className="row"><b>{REGION_NAMES[visual.regionId]} · seasonal mean</b><span className="spacer" /><span className="mono">{cur?.value?.toFixed(3)} mm/hr</span></div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <TimeSeriesGraph points={obs.map((o, i) => ({ key: media.manifest!.frames[i].label, value: o.value }))} cursor={visual.day} onSelect={(i) => seek(i)}
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
