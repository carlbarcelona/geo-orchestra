import { useState } from 'react';
import { INSTRUMENTS, type InstrumentId, type LayerLevels as Levels } from '../../sound/engine';
import { NORMAL } from '../../sound/context';
import { MAPPING, midiToName, scaleNotes, SCALES, stepSize } from '../../sound/mapping';
import { ELEMENT_LABELS, MODE_ELEMENTS, toggleMute, updateSound } from '../../state/actions';
import { set, useStore } from '../../state/store';
import * as I from '../icons';

export function ModeTabs({ disabled }: { disabled?: boolean }) {
  const mode = useStore((s) => s.sound.mode);
  return (
    <div className="seg" role="tablist" aria-label="Sound mode" style={{ width: '100%' }}>
      <button role="tab" style={{ flex: 1 }} aria-selected={mode === 'musical'} disabled={disabled} onClick={() => updateSound({ mode: 'musical' })}><I.Note size={14} /> Musical</button>
      <button role="tab" style={{ flex: 1 }} aria-selected={mode === 'geophony'} disabled={disabled} onClick={() => updateSound({ mode: 'geophony' })}><I.Wave size={14} /> Geophony</button>
    </div>
  );
}

export function InstrumentRow() {
  const s = useStore((st) => st.sound);
  return (
    <div className="field">
      <label htmlFor="instrument">Instrument</label>
      <select id="instrument" value={s.instrument} onChange={(e) => updateSound({ instrument: e.target.value as InstrumentId })}>
        {INSTRUMENTS.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
      </select>
    </div>
  );
}

export function ScaleRow() {
  const s = useStore((st) => st.sound);
  return (
    <div className="field">
      <label htmlFor="scale">Scale</label>
      <select id="scale" value={s.scale} onChange={(e) => updateSound({ scale: e.target.value })}>
        {Object.keys(SCALES).map((k) => <option key={k}>{k}</option>)}
      </select>
    </div>
  );
}

export function PitchRange() {
  const s = useStore((st) => st.sound);
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="row"><span className="dim">Pitch range</span><span className="spacer" /><span className="mono">{midiToName(s.pitchLow)} – {midiToName(s.pitchHigh)}</span></div>
      <div className="muted" style={{ fontSize: 11.5 }}>
        {(() => { const n = scaleNotes(s.scale, s.pitchLow, s.pitchHigh).length; return `${n} notes · one step ≈ ${stepSize('area', n).toFixed(3)} mm/hr (area mean) or ${stepSize('cell', n).toFixed(3)} mm/hr (cell)`; })()}
      </div>
      <div className="row">
        <input type="range" min={36} max={72} step={1} value={s.pitchLow} aria-label={`Lowest note ${midiToName(s.pitchLow)}`}
          onChange={(e) => updateSound({ pitchLow: Math.min(Number(e.target.value), s.pitchHigh - 12) })} />
        <input type="range" min={60} max={96} step={1} value={s.pitchHigh} aria-label={`Highest note ${midiToName(s.pitchHigh)}`}
          onChange={(e) => updateSound({ pitchHigh: Math.max(Number(e.target.value), s.pitchLow + 12) })} />
      </div>
    </div>
  );
}

export function MasterVolume() {
  const master = useStore((st) => st.sound.master);
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="row"><I.Volume /><span className="dim">Master volume</span><span className="spacer" /><span className="mono">{master.toFixed(2)}</span></div>
      <input type="range" min={0} max={1} step={0.01} value={master} onChange={(e) => updateSound({ master: Number(e.target.value) })} aria-label="Master volume" aria-valuetext={`${Math.round(master * 100)} percent`} />
    </div>
  );
}

const LAYER_ROWS: [keyof Levels, string][] = [['melody', 'Melody layer'], ['context', 'Normal & cues'], ['texture', 'Rain texture'], ['markers', 'Markers'], ['image', 'Frame sweep & band']];

/** Speaker toggle for one mixer element; the slider value is kept while muted. */
export function MuteButton({ k }: { k: keyof Levels }) {
  const muted = useStore((st) => st.sound.muted[k]);
  const name = ELEMENT_LABELS[k];
  return (
    <button type="button" className={`mute-btn${muted ? ' on' : ''}`} aria-pressed={muted} onClick={() => toggleMute(k)} aria-label={`Mute ${name}`} title={muted ? `Unmute ${name}` : `Mute ${name}`}>
      {muted ? <I.VolumeOff size={14} /> : <I.Volume size={14} />}
    </button>
  );
}

/** Level sliders for the layers heard in the current mode, each with a mute toggle. */
export function LayerLevels() {
  const layers = useStore((st) => st.sound.layers);
  const muted = useStore((st) => st.sound.muted);
  const mode = useStore((st) => st.sound.mode);
  return (
    <>
      {LAYER_ROWS.filter(([k]) => MODE_ELEMENTS[mode].includes(k)).map(([k, label]) => (
        <div className="field" key={k} style={{ gridTemplateColumns: '26px 96px 1fr 36px', opacity: muted[k] ? 0.6 : 1 }}>
          <MuteButton k={k} />
          <label htmlFor={`lvl-${k}`}>{label}</label>
          <input id={`lvl-${k}`} type="range" min={0} max={1} step={0.01} value={layers[k]} onChange={(e) => updateSound({ layers: { ...layers, [k]: Number(e.target.value) } })} />
          <span className="mono">{muted[k] ? 'off' : layers[k].toFixed(2)}</span>
        </div>
      ))}
    </>
  );
}

/** On/off chips for every element heard in the current mode. */
export function ElementMutes() {
  const mode = useStore((st) => st.sound.mode);
  const muted = useStore((st) => st.sound.muted);
  return (
    <div className="element-mutes" role="group" aria-label={`Sound elements in ${mode === 'musical' ? 'Musical' : 'Geophony'} mode`}>
      {MODE_ELEMENTS[mode].map((k) => (
        <button key={k} type="button" className={`chip mute-chip${muted[k] ? ' off' : ''}`} aria-pressed={!muted[k]} onClick={() => toggleMute(k)}
          title={muted[k] ? `Unmute ${ELEMENT_LABELS[k]}` : `Mute ${ELEMENT_LABELS[k]}`}>
          {muted[k] ? <I.VolumeOff size={12} /> : <I.Volume size={12} />} {ELEMENT_LABELS[k]}
        </button>
      ))}
    </div>
  );
}

/** Colour-coded statement of the current sound mode, so it is never ambiguous. */
export function ModeBanner() {
  const mode = useStore((st) => st.sound.mode);
  return (
    <div className={`mode-banner ${mode}`}>
      {mode === 'musical' ? <I.Note size={18} /> : <I.Wave size={18} />}
      <div>
        <div className="mode-name">{mode === 'musical' ? 'Musical mode' : 'Geophony mode'}</div>
        <div className="mode-desc">{mode === 'musical' ? 'Rainfall plays as notes on an instrument.' : 'Rainfall plays as a rain soundscape: noise bed and droplets.'}</div>
      </div>
    </div>
  );
}

export function ModeTag() {
  const mode = useStore((st) => st.sound.mode);
  return <span className={`mode-tag ${mode}`}>{mode === 'musical' ? 'Musical' : 'Geophony'}</span>;
}

export function MappingRows({ compact }: { compact?: boolean }) {
  const s = useStore((st) => st.sound);
  return (
    <div style={{ fontSize: 13 }}>
      <div className="field" style={{ gridTemplateColumns: '20px 1fr 20px 1.2fr' }}>
        <I.Rain /><span>Rainfall</span><span>→</span><select value="pitch" disabled aria-label="Rainfall maps to"><option value="pitch">Pitch &amp; velocity</option></select>
      </div>
      <div className="field" style={{ gridTemplateColumns: '20px 1fr 20px 1.2fr' }}>
        <I.Chart /><span>Normal ({NORMAL.baseline[0]}–{String(NORMAL.baseline[1]).slice(2)})</span><span>→</span>
        <select value={s.reference ? 'hum' : 'off'} onChange={(e) => updateSound({ reference: e.target.value === 'hum' })} aria-label="Normal maps to">
          <option value="hum">Hum (reference pitch)</option><option value="off">Off</option>
        </select>
      </div>
      <div className="field" style={{ gridTemplateColumns: '20px 1fr 20px 1.2fr' }}>
        <I.Note /><span>Wetter / drier</span><span>→</span>
        <select value={s.harmony ? 'chord' : 'off'} onChange={(e) => updateSound({ harmony: e.target.value === 'chord' })} aria-label="Wetter or drier than normal maps to">
          <option value="chord">Major / minor chord</option><option value="off">Off</option>
        </select>
      </div>
      <div className="field" style={{ gridTemplateColumns: '20px 1fr 20px 1.2fr' }}>
        <I.Warn /><span>Unusual months</span><span>→</span>
        <select value={s.cues ? 'cues' : 'off'} onChange={(e) => updateSound({ cues: e.target.value === 'cues' })} aria-label="Unusual months map to">
          <option value="cues">Bell · thunder · dry wind</option><option value="off">Off</option>
        </select>
      </div>
      <div className="field" style={{ gridTemplateColumns: '20px 1fr 20px 1.2fr' }}>
        <I.Wave /><span>Variation</span><span>→</span>
        <select value={s.variation ? 'density' : 'off'} onChange={(e) => updateSound({ variation: e.target.value === 'density' })} aria-label="Variation maps to">
          <option value="density">Note density</option><option value="off">Off</option>
        </select>
      </div>
      <div className="field" style={{ gridTemplateColumns: '20px 1fr 20px 1.2fr' }}>
        <I.Arrows /><span>Longitude</span><span>→</span>
        <select value={s.spatialPhrases ? 'stereo' : 'off'} onChange={(e) => updateSound({ spatialPhrases: e.target.value === 'stereo', preset: e.target.value === 'stereo' ? 'rain-pitch-spatial' : 'rain-pitch' })} aria-label="Longitude maps to" disabled={compact}>
          <option value="stereo">Stereo (5 sampled cells)</option><option value="off">Off</option>
        </select>
      </div>
      <p className="muted" style={{ fontSize: 11.5, margin: '0 0 6px' }}>Mappings are fixed across dates and regions (version {MAPPING.version}: linear pitch, area means 0–{MAPPING.ranges.area[1]} and cells 0–{MAPPING.ranges.cell[1]} mm/hr). Changing instrument or scale never changes the measurements.</p>
    </div>
  );
}

export function GeophonyMapping() {
  return (
    <div style={{ fontSize: 13 }}>
      <div className="field" style={{ gridTemplateColumns: '20px 1fr 20px 1.2fr' }}><I.Rain /><span>Rainfall</span><span>→</span><span>Rain loudness &amp; brightness</span></div>
      <div className="field" style={{ gridTemplateColumns: '20px 1fr 20px 1.2fr' }}><I.Wave /><span>Rainfall &amp; change</span><span>→</span><span>Droplets per second</span></div>
      <p className="muted" style={{ fontSize: 11.5, margin: '0 0 6px' }}>Instrument, scale and pitch range apply to Musical mode only.</p>
    </div>
  );
}

export function LegendButton() {
  return <button className="btn primary" style={{ width: '100%', padding: '8px 12px', fontSize: 15 }} onClick={() => set({ dialogs: { ...useStore.getState().dialogs, legend: true } })}><I.Play /> Audio legend</button>;
}

export function Disclosure({ title, children, defaultOpen = false, extra }: { title: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; extra?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      <div className="row" style={{ marginBottom: open ? 4 : 8 }}>
        <button className="disclosure" style={{ marginBottom: 0 }} aria-expanded={open} onClick={() => setOpen(!open)}><I.Caret className="caret" /> {title}</button>
        {extra}
      </div>
      {open && <div style={{ padding: '4px 2px 8px' }}>{children}</div>}
    </>
  );
}
