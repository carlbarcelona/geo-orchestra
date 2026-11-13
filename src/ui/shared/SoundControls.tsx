import { useState } from 'react';
import { INSTRUMENTS, type InstrumentId } from '../../sound/engine';
import { midiToName, SCALES } from '../../sound/mapping';
import { updateSound } from '../../state/actions';
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

export function LayerLevels() {
  const layers = useStore((st) => st.sound.layers);
  const row = (k: keyof typeof layers, label: string) => (
    <div className="field" key={k} style={{ gridTemplateColumns: '110px 1fr 40px' }}>
      <label htmlFor={`lvl-${k}`}>{label}</label>
      <input id={`lvl-${k}`} type="range" min={0} max={1} step={0.01} value={layers[k]} onChange={(e) => updateSound({ layers: { ...layers, [k]: Number(e.target.value) } })} />
      <span className="mono">{layers[k].toFixed(2)}</span>
    </div>
  );
  return <>{row('melody', 'Melody layer')}{row('texture', 'Rain texture')}{row('markers', 'Markers')}{row('image', 'Frame sweep & band')}</>;
}

export function MappingRows({ compact }: { compact?: boolean }) {
  const s = useStore((st) => st.sound);
  return (
    <div style={{ fontSize: 13 }}>
      <div className="field" style={{ gridTemplateColumns: '20px 1fr 20px 1.2fr' }}>
        <I.Rain /><span>Rainfall</span><span>→</span><select value="pitch" disabled aria-label="Rainfall maps to"><option value="pitch">Pitch &amp; velocity</option></select>
      </div>
      <div className="field" style={{ gridTemplateColumns: '20px 1fr 20px 1.2fr' }}>
        <I.Wave /><span>Variation</span><span>→</span><select value="density" disabled aria-label="Variation maps to"><option value="density">Note density</option></select>
      </div>
      <div className="field" style={{ gridTemplateColumns: '20px 1fr 20px 1.2fr' }}>
        <I.Arrows /><span>Longitude</span><span>→</span>
        <select value={s.spatialPhrases ? 'stereo' : 'off'} onChange={(e) => updateSound({ spatialPhrases: e.target.value === 'stereo', preset: e.target.value === 'stereo' ? 'rain-pitch-spatial' : 'rain-pitch' })} aria-label="Longitude maps to" disabled={compact}>
          <option value="stereo">Stereo (5 sampled cells)</option><option value="off">Off</option>
        </select>
      </div>
      <p className="muted" style={{ fontSize: 11.5, margin: '0 0 6px' }}>Mappings are fixed across dates and regions (version rain-v1). Changing instrument or scale never changes the measurements.</p>
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
