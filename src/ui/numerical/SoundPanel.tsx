import { useMemo } from 'react';
import { monthLabel } from '../../data/dataset';
import { currentObservations, numericalEvents, updateSound } from '../../state/actions';
import { useStore } from '../../state/store';
import * as I from '../icons';
import { BrailleChart } from '../shared/BrailleChart';
import { Disclosure, ElementMutes, GeophonyMapping, InstrumentRow, LayerLevels, LegendButton, MappingRows, MasterVolume, ModeBanner, ModeTabs, ModeTag, PitchRange, ScaleRow, TimeCueControls } from '../shared/SoundControls';

export function SoundPanel() {
  const ds = useStore((s) => s.dataset);
  const selection = useStore((s) => s.selection);
  const cursor = useStore((s) => s.cursor);
  const sound = useStore((s) => s.sound);
  const eventsCache = useStore((s) => s.eventsCache);
  const obs = useMemo(() => currentObservations(), [ds, selection]); // eslint-disable-line react-hooks/exhaustive-deps
  const events = useMemo(() => (ds && selection ? numericalEvents() : []), [ds, selection, eventsCache]); // eslint-disable-line react-hooks/exhaustive-deps
  const o = obs[cursor];
  const stepEvents = events[cursor] ?? [];
  const note = stepEvents.find((e) => e.kind === 'melody');
  const tex = stepEvents.find((e) => e.kind === 'texture');

  return (
    <section className={`panel sound-mode-${sound.mode}`} aria-labelledby="sound-title">
      <div className="panel-head"><h2 className="panel-title" id="sound-title">{sound.mode === 'musical' ? <I.Note size={18} /> : <I.Wave size={18} />} Sound</h2><span className="spacer" /><ModeTag /></div>
      <div className="panel-body">
        <div className="callout info" style={{ marginBottom: 10 }}>
          <div className="txt italic" style={{ fontSize: 12.5 }}>{selection ? <>Source: <b style={{ fontStyle: 'normal', color: 'var(--text)' }}>{selection.label}</b> · {selection.type === 'area' ? 'area mean' : 'single cell'}{ds?.kind === 'synthetic' ? ' · SYNTHETIC' : ''}</> : 'Source: awaiting measurements'}</div>
        </div>
        <div style={{ marginBottom: 8 }}><ModeTabs /></div>
        <div style={{ marginBottom: 10 }}><ModeBanner /></div>
        {sound.mode === 'musical' && <InstrumentRow />}
        {sound.mode === 'musical' && <div className="field">
          <label htmlFor="preset">Mapping preset</label>
          <select id="preset" value={sound.preset} onChange={(e) => updateSound({ preset: e.target.value as typeof sound.preset, spatialPhrases: e.target.value === 'rain-pitch-spatial' })}>
            <option value="rain-pitch">Rainfall → Pitch</option>
            <option value="rain-pitch-spatial">Rainfall → Pitch + spatial phrases</option>
          </select>
        </div>}
        <MasterVolume />
        <div className="dim" style={{ fontSize: 12 }}>Elements (click to mute)</div>
        <ElementMutes />
        <Disclosure title="Advanced mappings">
          {sound.mode === 'musical' ? <><ScaleRow /><PitchRange /><MappingRows /></> : <GeophonyMapping />}
          <LayerLevels />
        </Disclosure>
        <Disclosure title="Time cues & checkpoints"><TimeCueControls /></Disclosure>
        <div style={{ marginBottom: 10 }}><LegendButton /></div>

        {o && (
          <div className="section" aria-live="off">
            <div className="section-head" style={{ fontSize: 12 }}>Now · {monthLabel(o.t, true)}</div>
            <div className="section-body">
              <dl className="kv" style={{ gridTemplateColumns: '96px 1fr' }}>
                <dt>Precipitation</dt><dd><b style={{ fontSize: 15 }}>{o.value == null ? 'missing' : o.value.toFixed(3)}</b> {o.value == null ? '' : 'mm/hr'}</dd>
                <dt>≈ per day</dt><dd>{o.value == null ? '—' : `${(o.value * 24).toFixed(2)} mm/day (rate × 24)`}</dd>
                {o.randomError != null && <><dt>Random error</dt><dd>± {o.randomError.toFixed(3)} mm/hr</dd></>}
                {o.coverage != null && <><dt>Coverage</dt><dd>{(o.coverage * 100).toFixed(1)}% valid</dd></>}
                <dt>Availability</dt><dd><span className={`badge ${o.quality}`}>{o.quality}</span></dd>
                <dt>Sound</dt><dd style={{ fontFamily: 'var(--font)' }}>{sound.mode === 'musical' ? (note ? `${note.note} · velocity ${note.velocity}` : 'no note (missing)') : (tex?.texture ? `${tex.texture.dropsPerSecond} drops/s · intensity ${tex.texture.intensity}` : 'silence (missing)')}</dd>
              </dl>
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
