import { useState } from 'react';
import { INSTRUMENTS, type InstrumentId } from '../../sound/engine';
import { NORMAL } from '../../sound/context';
import { MAPPING, midiToName, scaleNotes, SCALES, stepSize } from '../../sound/mapping';
import { auditionCue, jumpToCheckpoint, removeCheckpoint, renameCheckpoint, setTimeCues, toggleCheckpoint, updateSound } from '../../state/actions';
import { CUE_SOUNDS, cueSpacingSeconds, UNIT_LABEL, UNITS, type CueSound, type CueUnit } from '../../sound/timeCues';
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

export function LayerLevels() {
  const layers = useStore((st) => st.sound.layers);
  const row = (k: keyof typeof layers, label: string) => (
    <div className="field" key={k} style={{ gridTemplateColumns: '110px 1fr 40px' }}>
      <label htmlFor={`lvl-${k}`}>{label}</label>
      <input id={`lvl-${k}`} type="range" min={0} max={1} step={0.01} value={layers[k]} onChange={(e) => updateSound({ layers: { ...layers, [k]: Number(e.target.value) } })} />
      <span className="mono">{layers[k].toFixed(2)}</span>
    </div>
  );
  return <>{row('melody', 'Melody layer')}{row('context', 'Normal & cues')}{row('time', 'Time cues')}{row('texture', 'Rain texture')}{row('markers', 'Markers')}{row('image', 'Frame sweep & band')}</>;
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

/**
 * Advanced-mode time-cue settings for the current workspace (cue-v1): which period to mark, how often,
 * which sounds, accents, and the checkpoint list. Preset mode ignores these and uses the fixed uniform cue.
 */
export function TimeCueControls() {
  const tab = useStore((st) => st.tab);
  const cfg = useStore((st) => st.timeCues[st.tab]);
  const checkpoints = useStore((st) => st.checkpoints[st.tab]);
  const speed = useStore((st) => (st.tab === 'numerical' ? st.speed : st.visual.speed));
  const timeline = tab === 'numerical' ? 'monthly' : 'seasonal';
  const units = UNITS[timeline];
  const spacing = cueSpacingSeconds(timeline, cfg.unit, cfg.everyN, speed);
  const unitName = (u: CueUnit) => (u === 'step' ? `${UNIT_LABEL[timeline].step} (every step)` : UNIT_LABEL[timeline][u]);
  return (
    <div style={{ fontSize: 13 }}>
      <div className="field">
        <label htmlFor="cue-unit">Mark every</label>
        <div className="row">
          <input type="number" min={1} max={100} value={cfg.everyN} disabled={cfg.unit === 'off'} aria-label="Every how many periods"
            onChange={(e) => setTimeCues({ everyN: Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 1))) })} style={{ width: 54 }} className="num-input" />
          <select id="cue-unit" value={cfg.unit} onChange={(e) => setTimeCues({ unit: e.target.value as CueUnit | 'off' })} style={{ flex: 1 }}>
            <option value="off">Off (no time cues)</option>
            {units.map((u) => <option key={u} value={u}>{unitName(u)}</option>)}
          </select>
        </div>
      </div>
      {spacing != null && spacing < 0.25 && <p className="muted" style={{ fontSize: 11.5, margin: '-4px 0 6px' }}>At this speed the cues come every {spacing.toFixed(2)} s — choose a longer period or slow down.</p>}
      <CueSoundRow id="cue-sound" label="Cue sound" value={cfg.sound} onChange={(v) => setTimeCues({ sound: v })} onPlay={(v) => auditionCue('period', v)} />
      <label className="row" style={{ fontSize: 12.5, marginBottom: 8 }}>
        <input type="checkbox" checked={cfg.accentLarger} onChange={(e) => setTimeCues({ accentLarger: e.target.checked })} /> Louder when a larger period starts (e.g. a year when marking quarters)
      </label>
      <label className="row" style={{ fontSize: 12.5, marginBottom: 6 }}>
        <input type="checkbox" checked={cfg.checkpoints} onChange={(e) => setTimeCues({ checkpoints: e.target.checked })} /> Play checkpoint cues
      </label>
      <CueSoundRow id="cp-sound" label="Checkpoint sound" value={cfg.checkpointSound} onChange={(v) => setTimeCues({ checkpointSound: v })} onPlay={(v) => auditionCue('checkpoint', v)} disabled={!cfg.checkpoints} />
      <div className="row" style={{ marginBottom: 4 }}>
        <b style={{ fontSize: 12.5 }}>Checkpoints ({checkpoints.length})</b><span className="spacer" />
        <button className="btn small" onClick={() => toggleCheckpoint()} aria-keyshortcuts="C">⚑ Add / remove at cursor</button>
      </div>
      {checkpoints.length === 0 ? <p className="muted" style={{ fontSize: 12, margin: '0 0 6px' }}>No checkpoints yet. Move to a step and press C.</p> : (
        <ul className="cp-list">
          {checkpoints.map((c) => (
            <li key={c.key} className="row">
              <button className="btn small ghost" onClick={() => jumpToCheckpoint(c.key)} title="Jump here" aria-label={`Jump to checkpoint ${c.label}`}><span className="mono">{c.key}</span></button>
              <input type="text" value={c.label} onChange={(e) => renameCheckpoint(c.key, e.target.value)} aria-label={`Label for checkpoint ${c.key}`} style={{ flex: 1 }} />
              <button className="btn small ghost" onClick={() => removeCheckpoint(c.key)} aria-label={`Remove checkpoint ${c.label}`}><I.X size={13} /></button>
            </li>
          ))}
        </ul>
      )}
      <p className="muted" style={{ fontSize: 11.5, margin: '4px 0 6px' }}>Time cues mark the timeline, not the data: they sound the same in Musical and Geophony and never change with the measurements. Preset mode always uses one knock per {timeline === 'monthly' ? 'year' : 'month'} and a doubled knock for checkpoints.</p>
    </div>
  );
}

function CueSoundRow({ id, label, value, onChange, onPlay, disabled }: { id: string; label: string; value: CueSound; onChange: (v: CueSound) => void; onPlay: (v: CueSound) => void; disabled?: boolean }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="row">
        <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as CueSound)} style={{ flex: 1 }}>
          {CUE_SOUNDS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <button className="btn small" disabled={disabled} onClick={() => onPlay(value)} aria-label={`Preview ${label.toLowerCase()}`}><I.Play size={12} /></button>
      </div>
    </div>
  );
}
