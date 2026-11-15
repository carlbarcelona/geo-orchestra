import { useMemo } from 'react';
import type { StepContext } from '../../contracts';
import { speechAvailable, stopSpeaking } from '../../a11y/speech';
import { comparePhrase, NORMAL, rankPhrase } from '../../sound/context';
import { SCAN } from '../../sound/frameScan';
import { getPreset, LISTENING_PRESETS, matchesPreset } from '../../sound/presets';
import { monthLabel } from '../../data/dataset';
import { applyListeningPreset, auditionCue, currentObservations, numericalEvents, quickStart, selectRegion } from '../../state/actions';
import { set, useStore } from '../../state/store';
import * as I from '../icons';
import { BrailleChart } from '../shared/BrailleChart';
import { LegendButton, MasterVolume, ModeTag } from '../shared/SoundControls';

const REGION_BUTTONS = [
  { id: 'philippines', label: 'Philippines' }, { id: 'luzon', label: 'Luzon' }, { id: 'visayas', label: 'Visayas' }, { id: 'mindanao', label: 'Mindanao' },
];

const CATEGORY_CLASS: Record<string, string> = { 'much-wetter': 'wet2', wetter: 'wet1', 'near-normal': 'near', drier: 'dry1', 'much-drier': 'dry2' };

export function categoryHeadline(c: StepContext | undefined | null): string {
  if (!c?.category) return '';
  const p = comparePhrase(c);
  return p[0].toUpperCase() + p.slice(1);
}

/** Choose how to listen. Only sound settings change; the data never does. */
export function ListeningPresetCards({ workspace }: { workspace: 'numerical' | 'visual' }) {
  const chosen = useStore((s) => s.listening[workspace]);
  const sound = useStore((s) => s.sound);
  const image = useStore((s) => s.image);
  const preset = getPreset(chosen);
  const custom = preset ? !matchesPreset(preset, sound, workspace === 'visual' ? image : undefined) : false;
  return (
    <div className="preset-cards" role="radiogroup" aria-label="How to listen">
      {LISTENING_PRESETS.filter((p) => p.workspace === workspace).map((p) => {
        const on = p.id === chosen && !custom;
        return (
          <button key={p.id} role="radio" aria-checked={on} className={`preset-card ${on ? 'on' : ''}`} onClick={() => applyListeningPreset(p.id)}>
            <span className="preset-card-title">{on ? <I.Check size={14} /> : <span className="preset-dot" aria-hidden="true" />} {p.label}</span>
            <span className="preset-card-desc">{p.description}</span>
          </button>
        );
      })}
      {custom && preset && (
        <div className="callout info" style={{ padding: '6px 10px' }}>
          <I.Info size={15} />
          <div className="txt" style={{ flex: 1 }}>Custom settings from Advanced mode are active.</div>
          <button className="btn small" onClick={() => applyListeningPreset(preset.id)}>Reset to “{preset.label}”</button>
        </div>
      )}
    </div>
  );
}

export function NarrationToggle() {
  const speak = useStore((s) => s.a11y.speak);
  const a11y = useStore((s) => s.a11y);
  if (!speechAvailable()) return null;
  return (
    <label className="row" style={{ fontSize: 12.5, margin: '4px 0 10px' }}>
      <input type="checkbox" checked={speak} onChange={(e) => { set({ a11y: { ...a11y, speak: e.target.checked } }); if (!e.target.checked) stopSpeaking(); }} />
      Speak summaries aloud (on pause, step and unusual months)
    </label>
  );
}

export function ListeningGuide({ workspace }: { workspace: 'numerical' | 'visual' }) {
  const sound = useStore((s) => s.sound);
  const roiVoice = useStore((s) => (s.visual.roi || !!s.visual.crop) && s.image.enabled && s.image.roiVoice);
  const items = workspace === 'numerical'
    ? [
        sound.mode === 'musical' ? ['Piano', 'this month’s rain — higher note = more rain'] : ['Rain', 'more drops = more rain this month'],
        sound.reference && ['Soft hum', `a normal month (${NORMAL.baseline[0]}–${NORMAL.baseline[1]} average for the same month)`],
        sound.reference && sound.mode === 'musical' && ['Above / below', 'melody above the hum = wetter than normal, below = drier'],
        sound.harmony && sound.mode === 'musical' && ['Chord', 'bright = wetter, dark = drier, open = about normal'],
        sound.cues && ['Bell', 'an unusual month (far from normal)'],
        sound.cues && sound.mode === 'geophony' && ['Thunder / wind', 'much wetter / much drier than normal'],
        ['Thud', 'a missing measurement — never treated as zero'],
      ]
    : [
        ['Piano', 'Philippine rain on this day of the seasonal cycle'],
        sound.reference && ['Soft hum', 'the yearly average; above = wetter season, below = drier season'],
        ['String glide', 'the rain band’s latitude — higher = farther north'],
        ['Chime', 'the rain band turns around'],
        ['Sweep (S)', `the whole map, ${SCAN.global.beats} beats west → east · pitch = latitude · louder = heavier · silence = dry`],
        ['Held pad', 'a rain system the line is crossing (warm = tropical, darker = storm track); it lights up on the map'],
        roiVoice && ['Plucked note', 'the rain inside your region of interest (ROI) — higher = more rain, silence = dry there'],
      ];
  return (
    <div className="section listening-guide">
      <div className="section-head" style={{ fontSize: 12 }}><I.Note size={14} /> What you hear</div>
      <dl className="section-body guide-list">
        {(items.filter(Boolean) as string[][]).map(([k, v]) => <div key={k} className="guide-row"><dt>{k}</dt><dd>{v}</dd></div>)}
        <div className="guide-row">
          <dt>Knock</dt>
          <dd>
            a new {workspace === 'numerical' ? 'year' : 'month'} begins; a <b>double knock</b> is your checkpoint (press C to set one)
            <span className="row" style={{ marginTop: 3 }}>
              <button className="btn small" onClick={() => auditionCue('period')} aria-label="Preview the time cue"><I.Play size={11} /> knock</button>
              <button className="btn small" onClick={() => auditionCue('checkpoint')} aria-label="Preview the checkpoint cue"><I.Play size={11} /> double knock</button>
            </span>
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** Preset left panel: one-click start, then simple region buttons and the listening guide. */
export function StartPanel() {
  const ds = useStore((s) => s.dataset);
  const load = useStore((s) => s.load);
  const selection = useStore((s) => s.selection);
  const loading = load.state === 'loading';
  return (
    <section className="panel" aria-labelledby="start-title">
      <div className="panel-head"><h2 className="panel-title" id="start-title"><I.Layers size={18} /> {ds ? 'Listen' : 'Start here'}</h2></div>
      <div className="panel-body">
        {!ds || ds.kind !== 'nasa' ? (
          <div className="welcome-card">
            <div className="welcome-title">Hear 25 years of Philippine rainfall</div>
            <p className="dim" style={{ margin: '4px 0 10px', fontSize: 12.5 }}>
              NASA satellite measurements (IMERG), one month per second from June 2000 to December 2024. You will hear each month compared with a normal month.
            </p>
            <button className="btn primary solid big" onClick={() => void quickStart()} disabled={loading}><I.Play /> {loading ? 'Loading…' : 'Start listening'}</button>
            {loading && (
              <div style={{ marginTop: 8 }} role="status" aria-live="polite">
                <div className="progress"><div style={{ width: `${Math.round(load.progress * 100)}%` }} /></div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{load.message}</div>
              </div>
            )}
            {load.errors.length > 0 && <div className="callout danger" style={{ marginTop: 8 }} role="alert"><I.Warn /><div className="txt">{load.message} {load.errors[0]}</div></div>}
            {ds?.kind === 'synthetic' && <p className="muted" style={{ fontSize: 12 }}>The synthetic demo is loaded (not NASA data). Start listening replaces it with the NASA sample.</p>}
          </div>
        ) : (
          <>
            <div className="dataset-card" style={{ marginBottom: 10 }}>
              <I.Check style={{ color: 'var(--accent)', marginTop: 2 }} />
              <div className="grow"><div className="t">NASA IMERG rainfall</div><div className="s">{ds.months.length} months · {monthLabel(ds.months[0])} – {monthLabel(ds.months[ds.months.length - 1])}</div></div>
            </div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }} id="region-buttons-label">Where?</div>
            <div className="region-buttons" role="radiogroup" aria-labelledby="region-buttons-label">
              {REGION_BUTTONS.filter((r) => ds.regions.some((x) => x.id === r.id)).map((r) => (
                <button key={r.id} role="radio" aria-checked={selection?.regionId === r.id} className={`btn ${selection?.regionId === r.id ? 'active' : ''}`} onClick={() => selectRegion(r.id)}>{r.label}</button>
              ))}
            </div>
            {selection?.type === 'cell' && <p className="muted" style={{ fontSize: 12 }}>Listening to a single map cell: {selection.label}.</p>}
          </>
        )}
        <ListeningGuide workspace="numerical" />
      </div>
    </section>
  );
}

/** Preset right panel: how to listen, volume, legend, and the current month in words. */
export function PresetSoundPanel() {
  const ds = useStore((s) => s.dataset);
  const selection = useStore((s) => s.selection);
  const cursor = useStore((s) => s.cursor);
  const eventsCache = useStore((s) => s.eventsRev);
  const obs = useMemo(() => currentObservations(), [ds, selection]); // eslint-disable-line react-hooks/exhaustive-deps
  const events = useMemo(() => (ds && selection ? numericalEvents() : []), [ds, selection, eventsCache]); // eslint-disable-line react-hooks/exhaustive-deps
  const o = obs[cursor];
  const step = events[cursor] ?? [];
  const soundMode = useStore((s) => s.sound.mode);
  const ctx = (step.find((e) => e.kind === 'melody') ?? step.find((e) => e.marker === 'missing') ?? step.find((e) => e.kind === 'reference'))?.context;
  return (
    <section className={`panel sound-mode-${soundMode}`} aria-labelledby="psound-title">
      <div className="panel-head"><h2 className="panel-title" id="psound-title">{soundMode === 'musical' ? <I.Note size={18} /> : <I.Wave size={18} />} Sound</h2><span className="spacer" /><ModeTag /></div>
      <div className="panel-body">
        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>How to listen</div>
        <ListeningPresetCards workspace="numerical" />
        <MasterVolume />
        <NarrationToggle />
        <div style={{ marginBottom: 10 }}><LegendButton /></div>
        {o && (
          <div className={`now-card ${ctx?.category ? CATEGORY_CLASS[ctx.category] : ''}`} aria-live="off">
            <div className="now-when">{monthLabel(o.t, true)} · {selection?.label?.split(' (')[0]}</div>
            <div className="now-headline">{o.value == null ? 'Measurement missing' : categoryHeadline(ctx) || `${o.value.toFixed(3)} mm/hr`}</div>
            <div className="now-detail">
              {o.value == null ? 'No note is played and no value is invented.' : <>
                <b className="mono">{o.value.toFixed(3)}</b> mm/hr (≈ {(o.value * 24).toFixed(1)} mm/day)
                {ctx?.normal != null && <> · normal {ctx.normal.toFixed(3)}</>}
                {ctx && rankPhrase(ctx) && <> · {rankPhrase(ctx)}</>}
              </>}
            </div>
          </div>
        )}
        {o && (
          <BrailleChart title={`${selection?.label ?? ''} · all months`} values={obs.map((x) => x.value)} index={cursor}
            summary={`${obs.length} months. Lowest ${Math.min(...obs.map((x) => x.value ?? 99)).toFixed(3)}, highest ${Math.max(...obs.map((x) => x.value ?? 0)).toFixed(3)} mm/hr; the pointer line marks ${o.t}.`} />
        )}
      </div>
    </section>
  );
}
