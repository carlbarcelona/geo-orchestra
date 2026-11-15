import { useRef, useState } from 'react';
import { NORMAL } from '../../sound/context';
import { MAPPING } from '../../sound/mapping';
import { importProcessedFile, loadNasa, loadSynthetic, removeDataset, removePin, select, selectRegion } from '../../state/actions';
import { useStore } from '../../state/store';
import * as I from '../icons';

export function ProjectPanel() {
  const ds = useStore((s) => s.dataset);
  const load = useStore((s) => s.load);
  const selection = useStore((s) => s.selection);
  const pins = useStore((s) => s.pins);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showMap, setShowMap] = useState(false);
  const loading = load.state === 'loading';

  return (
    <section className="panel" aria-labelledby="project-title">
      <div className="panel-head"><h2 className="panel-title" id="project-title"><I.Layers size={18} /> Project</h2></div>
      <div className="panel-body">
        <div className="section">
          <div className="section-head"><I.Database /> Data</div>
          <div className="section-body">
            {ds ? (
              <div className={`dataset-card ${ds.kind === 'synthetic' ? 'synthetic' : ''}`}>
                {ds.kind === 'synthetic' ? <I.Flask style={{ color: 'var(--amber)', marginTop: 2 }} /> : <I.Check style={{ color: 'var(--accent)', marginTop: 2 }} />}
                <div className="grow">
                  <div className="t">{ds.kind === 'nasa' ? 'IMERG monthly precipitation' : ds.kind === 'synthetic' ? 'SYNTHETIC demo — not NASA data' : ds.title}</div>
                  <div className="s">precipitation · mm/hr · monthly · {ds.months.length} months</div>
                  <div className="s mono">{ds.months[0]} → {ds.months[ds.months.length - 1]}</div>
                </div>
                <button className="btn small ghost" onClick={removeDataset} aria-label="Remove dataset"><I.Trash /></button>
              </div>
            ) : (
              <div className="dataset-card empty">
                <I.Database style={{ marginTop: 2, color: 'var(--text-3)' }} />
                <div><div className="t">IMERG monthly precipitation</div><div className="s">precipitation · mm/hr · monthly · not loaded</div></div>
              </div>
            )}
            <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
              <button className="btn small" onClick={() => void loadNasa()} disabled={loading}><I.Plus /> NASA sample</button>
              <button className="btn small" onClick={() => void loadSynthetic()} disabled={loading}><I.Flask /> Synthetic demo</button>
              <button className="btn small" onClick={() => fileRef.current?.click()} disabled={loading}><I.File /> Import JSON</button>
              <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importProcessedFile(f); e.target.value = ''; }} aria-label="Import processed JSON file" />
            </div>
            {loading && (
              <div style={{ marginTop: 8 }} role="status" aria-live="polite">
                <div className="progress"><div style={{ width: `${Math.round(load.progress * 100)}%` }} /></div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{load.message}</div>
                <button className="btn small ghost" onClick={() => void (load.source === 'nasa' ? loadNasa() : null)} hidden>Retry</button>
              </div>
            )}
            {load.errors.length > 0 && (
              <div className="callout danger" style={{ marginTop: 8 }} role="alert">
                <I.Warn />
                <div><div className="ttl">{load.message}</div>
                  <ul className="txt" style={{ margin: '4px 0 0', paddingLeft: 16 }}>{load.errors.map((e) => <li key={e}>{e}</li>)}</ul>
                  {load.source === 'nasa' && <button className="btn small" style={{ marginTop: 6 }} onClick={() => void loadNasa()}>Retry</button>}
                  {ds && <div className="txt" style={{ marginTop: 4 }}>The previously loaded dataset is unchanged.</div>}
                </div>
              </div>
            )}
            {load.warnings.length > 0 && load.state === 'ready' && (
              <div className="callout" style={{ marginTop: 8 }}><I.Info /><ul className="txt" style={{ margin: 0, paddingLeft: 16 }}>{load.warnings.map((w) => <li key={w}>{w}</li>)}</ul></div>
            )}
            {!ds && !loading && <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>“NASA sample” loads the prepared IMERG V07B package for the Philippines (Jun 2000 – Dec 2024). No live NASA connection is required.</p>}
          </div>
        </div>

        <div className="section">
          <div className="section-head"><I.Pin /> Pins / Regions</div>
          <div className="section-body">
            {!ds ? (
              <div className="empty" style={{ padding: 8 }}><I.Pin size={22} /><div>No pins yet</div><div className="italic" style={{ fontSize: 12 }}>Pin or select a region in Map to analyze data</div></div>
            ) : (
              <>
                {ds.regions.length > 0 && (
                  <>
                    <label className="muted" htmlFor="region-select" style={{ fontSize: 12 }}>Named region (area mean)</label>
                    <select id="region-select" style={{ width: '100%', margin: '4px 0 8px' }} value={selection?.regionId ?? ''} onChange={(e) => selectRegion(e.target.value)}>
                      <option value="" disabled>Choose a region…</option>
                      {ds.regions.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.cellCount} cells</option>)}
                    </select>
                  </>
                )}
                {ds.points && ds.points.length > 0 && (
                  <select style={{ width: '100%', marginBottom: 8 }} value={selection?.id ?? ''} onChange={(e) => { const pt = ds.points!.find((p) => `point:${p.id}` === e.target.value); if (pt) select({ id: `point:${pt.id}`, type: 'cell', label: pt.label, aggregation: 'imported point (as supplied)', lat: pt.lat, lon: pt.lon }); }} aria-label="Imported location">
                    {ds.points.map((p) => <option key={p.id} value={`point:${p.id}`}>{p.label}</option>)}
                  </select>
                )}
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Pinned selections">
                  {pins.map((p) => (
                    <li key={p.id} className="row" style={{ padding: '3px 0' }}>
                      <button className={`btn small ${selection?.id === p.id ? 'active' : ''}`} style={{ flex: 1, justifyContent: 'flex-start' }} onClick={() => select(p)} aria-pressed={selection?.id === p.id}>
                        {p.type === 'area' ? <I.Roi /> : <I.Pin />} <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.label}</span>
                      </button>
                      <span className={`chip ${p.type === 'area' ? 'accent' : 'note'}`} style={{ fontSize: 11 }}>{p.type === 'area' ? 'area' : 'cell'}</span>
                      <button className="btn small ghost" onClick={() => removePin(p.id)} aria-label={`Remove pin ${p.label}`}><I.X size={13} /></button>
                    </li>
                  ))}
                </ul>
                {ds.grid && <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Click any cell in Map to pin a single 0.1° cell. Cells and area means are labelled separately.</p>}
              </>
            )}
          </div>
        </div>

        <button className="disclosure" aria-expanded={showMap} onClick={() => setShowMap(!showMap)}>
          <I.Caret className="caret" /> <I.Layers /> Mappings
        </button>
        {showMap && (
          <div className="section"><div className="section-body" style={{ fontSize: 12.5 }}>
            <dl className="kv" style={{ gridTemplateColumns: '120px 1fr' }}>
              <dt>Mapping version</dt><dd>{MAPPING.version}</dd>
              <dt>Rainfall</dt><dd style={{ fontFamily: 'var(--font)' }}>→ pitch &amp; velocity, linear on a fixed range: area means 0–{MAPPING.ranges.area[1]}, single cells 0–{MAPPING.ranges.cell[1]} mm/hr (above is clipped and flagged)</dd>
              <dt>Normal (hum)</dt><dd style={{ fontFamily: 'var(--font)' }}>a soft hum plays the {NORMAL.baseline[0]}–{NORMAL.baseline[1]} mean of the same calendar month; melody above = wetter, below = drier</dd>
              <dt>Harmony</dt><dd style={{ fontFamily: 'var(--font)' }}>major chord = wetter, minor = drier, open fifth = near normal (±{NORMAL.zNear} SD); a bell marks |z| ≥ {NORMAL.zExtreme}</dd>
              <dt>Change</dt><dd style={{ fontFamily: 'var(--font)' }}>→ optional note density (+1 note per {MAPPING.densityStep} mm/hr, max {MAPPING.maxNotesPerStep}; off by default); never computed across a gap</dd>
              <dt>Longitude</dt><dd style={{ fontFamily: 'var(--font)' }}>→ stereo pan of the 5 sampled cells (spatial phrases)</dd>
              <dt>Geophony</dt><dd style={{ fontFamily: 'var(--font)' }}>rainfall → drop density, rain-bed intensity and brightness; thunder = much wetter, dry wind = much drier than normal</dd>
              <dt>Missing</dt><dd style={{ fontFamily: 'var(--font)' }}>no note, a muted thud and a red gap — never zero</dd>
              <dt>Zero</dt><dd style={{ fontFamily: 'var(--font)' }}>lowest note plus a bright “zero” tick</dd>
            </dl>
          </div></div>
        )}
      </div>
    </section>
  );
}
