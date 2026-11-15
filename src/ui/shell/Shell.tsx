import { useEffect, useRef, useState } from 'react';
import { controller } from '../../playback/controller';
import { speechAvailable, stopSpeaking } from '../../a11y/speech';
import { NORMAL } from '../../sound/context';
import { MAPPING } from '../../sound/mapping';
import { SCAN } from '../../sound/frameScan';
import { audition, auditionCue, openProject, saveProject, scanCurrent, setTab, setUiMode, stepBy, toggleCheckpoint, togglePlay, toggleLoop, type LegendKind } from '../../state/actions';
import { announce, set, useStore } from '../../state/store';
import { RESET_LAYOUT_EVENT, writeLayout } from './layout';
import * as I from '../icons';
import { ElementMutes } from '../shared/SoundControls';

export function Header() {
  const ds = useStore((s) => s.dataset);
  const tab = useStore((s) => s.tab);
  const media = useStore((s) => s.media);
  const link = useStore((s) => s.link);
  const load = useStore((s) => s.load);
  const openRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<string[] | null>(null);
  let status = '';
  if (tab === 'numerical') status = load.state === 'loading' ? 'Loading…' : !ds ? 'Before import' : ds.kind === 'synthetic' ? 'SYNTHETIC DEMO · not NASA data' : ds.kind === 'nasa' ? `NASA IMERG V07B · ${ds.months.length} months` : 'Imported file';
  else status = media.state !== 'ready' ? 'Media not loaded' : link.state === 'reconstructed' ? 'NASA SVS frames · reconstructed linkage' : 'NASA SVS frames · measurements not connected';
  return (
    <header className="header">
      <div className="brand">
        <I.Logo />
        <div><div className="brand-name">GeoOrchestra</div><div className="brand-sub">Earth Information Jukebox</div></div>
      </div>
      <div className="header-divider" />
      <div className="project-title"><I.Folder /> Philippines · Rainfall</div>
      <span className="spacer" />
      <span className={`header-status ${ds?.kind === 'synthetic' && tab === 'numerical' ? 'synthetic' : ''}`} role="status">{status}</span>
      <button className="btn" onClick={saveProject}><I.Save /> Save project</button>
      <button className="btn" onClick={() => openRef.current?.click()}><I.Open /> Open</button>
      <input ref={openRef} type="file" accept=".json,application/json" hidden aria-label="Open project file"
        onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setToast(await openProject(f)); }} />
      <button className="btn access" onClick={() => set({ dialogs: { ...useStore.getState().dialogs, a11y: true } })}><I.Access /> Accessibility</button>
      {toast && <div className="toast" role="status"><div className="row"><b>Project</b><span className="spacer" /><button className="btn small ghost" onClick={() => setToast(null)} aria-label="Dismiss"><I.X /></button></div>{toast.map((t) => <div key={t} className="dim" style={{ fontSize: 12.5 }}>{t}</div>)}</div>}
    </header>
  );
}

export function SubBar() {
  const tab = useStore((s) => s.tab);
  const ds = useStore((s) => s.dataset);
  const load = useStore((s) => s.load);
  const media = useStore((s) => s.media);
  const link = useStore((s) => s.link);
  return (
    <nav className="subbar" aria-label="Workspaces">
      <div className="ws-tabs" role="tablist" aria-label="Workspace">
        <button role="tab" className="ws-tab" aria-selected={tab === 'numerical'} onClick={() => setTab('numerical')}>Numerical</button>
        <button role="tab" className="ws-tab" aria-selected={tab === 'visual'} onClick={() => setTab('visual')}>Visual feed</button>
      </div>
      <div className="header-divider" style={{ height: 22 }} />
      {tab === 'numerical' ? (
        <>
          <span className="chip"><I.Rain size={14} /> IMERG Monthly V07B</span>
          {ds ? <span className={`chip ${ds.kind === 'synthetic' ? 'amber' : 'ok'}`}><span className="dot" /> {ds.kind === 'synthetic' ? 'Synthetic' : 'Loaded'} · {ds.months.length} months</span>
            : <span className="chip"><span className="dot" style={{ background: 'transparent', border: '1.5px solid currentColor' }} /> {load.state === 'loading' ? 'Loading' : 'Not loaded'}</span>}
        </>
      ) : (
        <>
          <span className="chip accent"><I.Link size={14} /> NASA SVS / EIC</span>
          <span className="chip note">Seasonal climatology</span>
          {media.state === 'ready' && <span className={`chip ${link.state === 'reconstructed' ? 'amber' : ''}`}>{link.state === 'reconstructed' ? 'Linkage: reconstructed (approximate)' : 'Linkage: not connected'}</span>}
        </>
      )}
      <span className="spacer" />
      <ModeSwitch />
    </nav>
  );
}

/** Preset | Advanced. Only changes which controls are shown — never the data, the sound mapping or playback. */
export function ModeSwitch() {
  const mode = useStore((s) => s.uiMode);
  return (
    <div className="mode-switch" role="group" aria-label="Interface mode">
      <span className="mode-switch-label hide-sm" aria-hidden="true">Mode</span>
      <div className="seg">
        <button aria-pressed={mode === 'preset'} onClick={() => setUiMode('preset')} title="Preset: the essentials and recommended listening settings, for first-time and non-technical users">
          <I.Play size={12} /> Preset
        </button>
        <button aria-pressed={mode === 'advanced'} onClick={() => setUiMode('advanced')} title="Advanced: every configuration control (instruments, scales, mappings, layers, alignment evidence)">
          <I.Layers size={13} /> Advanced
        </button>
      </div>
    </div>
  );
}

export function StatusBar() {
  const tab = useStore((s) => s.tab);
  const media = useStore((s) => s.media);
  const link = useStore((s) => s.link);
  const lag = useStore((s) => s.lag);
  const pauseReason = useStore((s) => s.pauseReason);
  const playback = useStore((s) => s.playback);
  return (
    <footer className="statusbar">
      <I.Info />
      {tab === 'numerical' ? <span>One clock · Table · Map · Graph · audio · chart follow the same observation</span>
        : <span>Media: {media.state === 'ready' ? 'Imported' : 'Not imported'} · Numerical link: {link.state === 'reconstructed' ? 'Reconstructed' : 'Not connected'}</span>}
      {playback === 'stopped' && pauseReason && ['page hidden', 'end of range', 'audio unavailable', 'a NASA frame failed to load'].includes(pauseReason) && <span className="chip" style={{ fontSize: 11 }}>{pauseReason}</span>}
      <span className="spacer" />
      <span className="hide-sm"><span className="kbd">Space</span> Play/Pause · <span className="kbd">L</span> Loop · <span className="kbd">C</span> Checkpoint · <span className="kbd">←</span><span className="kbd">→</span> Step</span>
      {lag.samples > 0 && <span className="hide-sm mono" title="Delay between scheduled audio time and visual highlight (target ≤ 100 ms)">sync {lag.mean.toFixed(0)}/{lag.max.toFixed(0)} ms</span>}
      <button className="btn small ghost hide-sm" onClick={() => { writeLayout('numerical', {}); writeLayout('visual', {}); window.dispatchEvent(new Event(RESET_LAYOUT_EVENT)); announce('Panel layout reset'); }} title="Put every panel back to its default size">Reset layout</button>
      <button className="btn small ghost" onClick={() => set({ dialogs: { ...useStore.getState().dialogs, sources: true } })}><I.Database /> NASA data sources</button>
    </footer>
  );
}

export function LiveRegion() {
  const ann = useStore((s) => s.announcement);
  return <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" key={ann.id}>{ann.text}</div>;
}

/** Global keyboard shortcuts (ignored while typing in a field). */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // key events dispatched on window/document have no element target; treat them as page-level keys
      const t = e.target instanceof Element ? e.target : document.body;
      if (t.closest('input, select, textarea, [contenteditable="true"], [role="separator"]') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ' ' && !t.closest('button, a, [role="tab"]')) { e.preventDefault(); void togglePlay(); }
      else if (e.key === 'l' || e.key === 'L') toggleLoop();
      else if (e.key === 's' || e.key === 'S') void scanCurrent();
      else if (e.key === 'c' || e.key === 'C') toggleCheckpoint();
      else if (e.key === 'ArrowRight' && !t.closest('[role="tablist"]')) { e.preventDefault(); stepBy(1); }
      else if (e.key === 'ArrowLeft' && !t.closest('[role="tablist"]')) { e.preventDefault(); stepBy(-1); }
      else if (e.key === 'Home') controller.seek(controller.range[0]);
      else if (e.key === 'End') controller.seek(controller.range[1]);
      else if (e.key === '?') set({ dialogs: { ...useStore.getState().dialogs, shortcuts: true } });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function LegendRows({ rows }: { rows: [LegendKind, string, string][] }) {
  return (
    <>
      {rows.map(([k, label, desc]) => (
        <div className="legend-row" key={k}>
          <b>{label}</b><span className="dim" style={{ fontSize: 12.5 }}>{desc}</span>
          <button className="btn small primary" onClick={() => void audition(k)} aria-label={`Play legend example: ${label}`}><I.Play size={13} /> Play</button>
        </div>
      ))}
    </>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, [href], input, select')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus(); };
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="panel-head"><h2>{title}</h2><span className="spacer" /><button className="btn small ghost" onClick={onClose} aria-label="Close dialog"><I.X /></button></div>
        <div className="panel-body">{children}</div>
      </div>
    </div>
  );
}

export function Dialogs() {
  const d = useStore((s) => s.dialogs);
  const a11y = useStore((s) => s.a11y);
  const mode = useStore((s) => s.sound.mode);
  const close = (k: keyof typeof d) => () => set({ dialogs: { ...useStore.getState().dialogs, [k]: false } });
  const setA = (p: Partial<typeof a11y>) => set({ a11y: { ...a11y, ...p } });
  return (
    <>
      {d.a11y && (
        <Dialog title="Accessibility" onClose={close('a11y')}>
          <p>Every measurement is readable without audio in Table view and Event details. Keyboard: <span className="kbd">Space</span> play/pause, <span className="kbd">L</span> loop, <span className="kbd">←</span>/<span className="kbd">→</span> previous/next observation, <span className="kbd">Home</span>/<span className="kbd">End</span> range start/end, <span className="kbd">?</span> shortcuts.</p>
          <label className="row" style={{ padding: '6px 0' }}><input type="checkbox" checked={a11y.reducedMotion} onChange={(e) => setA({ reducedMotion: e.target.checked })} /> Reduced motion (piano roll moves step by step, no smooth scrolling)</label>
          <label className="row" style={{ padding: '6px 0' }}><input type="checkbox" checked={a11y.highContrast} onChange={(e) => setA({ highContrast: e.target.checked })} /> High contrast</label>
          <label className="row" style={{ padding: '6px 0' }}><input type="checkbox" checked={a11y.largeText} onChange={(e) => setA({ largeText: e.target.checked })} /> Larger text and numbers</label>
          <label className="row" style={{ padding: '6px 0' }}><input type="checkbox" checked={a11y.announceSteps} onChange={(e) => setA({ announceSteps: e.target.checked })} /> Announce the value when stepping while paused</label>
          <label className="row" style={{ padding: '6px 0' }}><input type="checkbox" checked={a11y.brailleCharts} onChange={(e) => setA({ brailleCharts: e.target.checked })} /> Braille charts (Unicode braille dots for refreshable braille displays)</label>
          <label className="row" style={{ padding: '6px 0' }}>Describe the frame during visual-feed playback every
            <select value={a11y.describeEvery} onChange={(e) => setA({ describeEvery: Number(e.target.value) })} aria-label="Describe every N frames">
              <option value={0}>never</option><option value={7}>7 days</option><option value={15}>15 days</option><option value={30}>30 days</option>
            </select></label>
          <label className="row" style={{ padding: '6px 0' }}><input type="checkbox" checked={a11y.haptics} onChange={(e) => setA({ haptics: e.target.checked })} /> Vibrate with rain intensity while exploring (Android browsers; not supported on iPhone)</label>
          <label className="row" style={{ padding: '6px 0' }}><input type="checkbox" checked={a11y.speak} disabled={!speechAvailable()} onChange={(e) => { setA({ speak: e.target.checked }); if (!e.target.checked) stopSpeaking(); }} /> Speak summaries aloud (browser voice): on pause and step, and for unusual months during playback{!speechAvailable() && ' — not available in this browser'}</label>
          <p style={{ marginTop: 10 }}>Screen readers hear actions and status changes (play, pause, buffering, dataset loaded, selection) but not every frame during playback. The map has a keyboard alternative: the region selector and the coordinate picker in Map view.</p>
          <p>Accessibility checks performed: keyboard-only walkthrough, focus visibility, contrast of text tokens, labelled controls. Not yet validated with blind or low-vision participants.</p>
        </Dialog>
      )}
      {d.legend && (
        <Dialog title="Audio legend" onClose={close('legend')}>
          <p>Playback pauses while you audition. Current mode: <b>{mode === 'musical' ? 'Musical sonification' : 'Geophony'}</b>. These examples use the same fixed mapping ({MAPPING.version}) as playback.</p>
          <h3 className="legend-h">1 · How much rain? (the piano)</h3>
          <LegendRows rows={[
            ['low', 'Low rainfall', '0.05 mm/hr → low, soft note · sparse drops'],
            ['middle', 'Middle', '0.40 mm/hr → middle register · steady rain'],
            ['high', 'High rainfall', '0.75 mm/hr → high, loud note · dense rain'],
            ['zero', 'Zero (measured)', '0 mm/hr → lowest note plus a bright “zero” tick'],
            ['missing', 'Missing', 'No measurement → no note, a muted thud; the hum still plays the normal'],
          ]} />
          <h3 className="legend-h">2 · Compared with normal (the hum and the chord)</h3>
          <p className="dim" style={{ fontSize: 12.5 }}>Examples for a July whose normal ({NORMAL.baseline[0]}–{NORMAL.baseline[1]}) is 0.35 mm/hr. Turn on “Normal hum”, “Harmony” and “Cues” in Advanced to hear every part.</p>
          <LegendRows rows={[
            ['near-normal', 'Near normal', 'melody on the hum · open fifth (neutral)'],
            ['wetter', 'Wetter', 'melody above the hum · bright major chord'],
            ['much-wetter', 'Much wetter', 'far above · full bright chord · thunder in Geophony'],
            ['drier', 'Drier', 'melody below the hum · dark minor chord'],
            ['much-drier', 'Much drier', 'far below · full dark chord · dry wind in Geophony'],
            ['unusual', 'Unusual month', `more than ${NORMAL.zExtreme} standard deviations from normal → a bell`],
          ]} />
          <h3 className="legend-h">3 · Where is the rain? (frame sweep, bells and the string glide)</h3>
          <p className="dim" style={{ fontSize: 12.5, margin: '0 0 6px' }}>
            Pitch = <b>latitude</b> (each note is a 2.5° band: C4 ≈ 2.5–5°N, the Philippines is about D4–D5) · loudness = <b>rain class</b> (light, moderate, heavy, very heavy) ·
            silence = <b>dry</b> · a sweep reads the <b>whole frame in {SCAN.global.beats} beats from west to east</b> (the ROI view: {SCAN.beats} beats, with a soft tick over the Philippine sector). In the whole-frame view the pitch table spans 60°S–60°N, so north is still higher. A <b>held pad</b> is a <b>rain system</b> (a connected area of heavy rain): it starts when the scan line reaches it and stops when the line leaves it; warm pad = tropical, darker horn = mid-latitude storm track. Press <span className="kbd">S</span> to hear the current frame.
          </p>
          <h3 className="legend-h">4 · When are we? (time cues)</h3>
          <p className="dim" style={{ fontSize: 12.5, margin: '0 0 6px' }}>A short knock marks time passing, in both Musical and Geophony. In Preset mode it marks every new year (Numerical) or every new month (Visual feed); Advanced lets you choose the period and the sound. Press <span className="kbd">C</span> to set your own checkpoint.</p>
          <div className="legend-row"><b>Time passes</b><span className="dim" style={{ fontSize: 12.5 }}>one knock at the start of the period</span>
            <button className="btn small primary" onClick={() => auditionCue('period')} aria-label="Play legend example: time cue"><I.Play size={13} /> Play</button></div>
          <div className="legend-row"><b>Your checkpoint</b><span className="dim" style={{ fontSize: 12.5 }}>the same knock, louder and doubled</span>
            <button className="btn small primary" onClick={() => auditionCue('checkpoint')} aria-label="Play legend example: checkpoint cue"><I.Play size={13} /> Play</button></div>
          <h3 className="legend-h">5 · Elements in this mode</h3>
          <p className="dim" style={{ fontSize: 12.5 }}>Turn an element off to hear the others on their own, in playback and in these examples. Its level is kept for when you turn it back on.</p>
          <ElementMutes />
          <p style={{ marginTop: 10 }}>Sounds are designed mappings of satellite estimates, not recordings. Instrument and volume change the timbre and loudness only, never the underlying values.</p>
        </Dialog>
      )}
      {d.sources && (
        <Dialog title="NASA data sources & credits" onClose={close('sources')}>
          <p><b>Measurements:</b> GPM IMERG Final Precipitation L3 1 month 0.1° V07B (GPM_3IMERGM), NASA GES DISC, doi:10.5067/GPM/IMERG/3B-MONTH/07. Philippines subset retrieved through Earthdata Cloud OPeNDAP, prepared with <span className="mono">pipeline/prepare_imerg.py</span>. Unit: mm/hr (monthly mean rate).</p>
          <p><b>Visual feed:</b> NASA Scientific Visualization Studio, “IMERG Daily Precipitation Climatology (2001–2022)”, ID 5478 (Earth Information Center). Visualizer Alex Kekesi; scientists George Huffman and Jackson Tan. Frames are authentic SVS images resized/cropped for the web; originals at <a href="https://svs.gsfc.nasa.gov/5478/" target="_blank" rel="noreferrer">svs.gsfc.nasa.gov/5478</a>.</p>
          <p><b>Maps in the Numerical workspace</b> are rendered by GeoOrchestra from the IMERG numbers — they are not NASA imagery.</p>
          <p><b>Boundaries:</b> Natural Earth 10m admin-0/admin-1 v5.1.2 (public domain).</p>
          <p><b>Honesty notes:</b> satellite precipitation estimates carry uncertainty (random error shown in Table); missing is never treated as zero; seasonal climatology frames are not historical events; the visual-feed linkage is a reconstruction from monthly data, not the SVS daily product.</p>
          <p className="muted"><a href="https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/" target="_blank" rel="noreferrer">NASA Space Apps 2026 — The Earth Information Jukebox</a></p>
        </Dialog>
      )}
      {d.shortcuts && (
        <Dialog title="Keyboard shortcuts" onClose={close('shortcuts')}>
          <dl className="kv"><dt>Space</dt><dd>Play / pause</dd><dt>L</dt><dd>Loop on/off</dd><dt>S</dt><dd>Sweep the current frame / month west → east</dd><dt>C</dt><dd>Add or remove a checkpoint at the current step</dd><dt>Arrows on frame</dt><dd>Explore cell by cell (Shift = 5°)</dd><dt>← →</dt><dd>Previous / next observation</dd><dt>Home / End</dt><dd>Range start / end</dd><dt>?</dt><dd>This list</dd><dt>Esc</dt><dd>Close dialogs</dd></dl>
        </Dialog>
      )}
    </>
  );
}
