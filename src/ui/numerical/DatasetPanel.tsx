import { useMemo, useState } from 'react';
import { formatValue, monthLabel } from '../../data/dataset';
import { currentObservations, scanCurrent, seek, selectCell, setView } from '../../state/actions';
import { useStore } from '../../state/store';
import * as I from '../icons';
import { RegionMap } from '../shared/RegionMap';
import { TimeSeriesGraph } from '../shared/TimeSeriesGraph';

type YVar = 'precipitation' | 'randomError' | 'coverage';

export function DatasetPanel() {
  const ds = useStore((s) => s.dataset);
  const view = useStore((s) => s.view);
  const selection = useStore((s) => s.selection);
  const cursor = useStore((s) => s.cursor);
  const range = useStore((s) => s.range);
  const load = useStore((s) => s.load);
  const obs = useMemo(() => currentObservations(), [ds, selection]); // eslint-disable-line react-hooks/exhaustive-deps
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'valid' | 'partial' | 'missing'>('all');
  const [cols, setCols] = useState({ error: true, coverage: true });
  const [showCols, setShowCols] = useState(false);
  const [yVar, setYVar] = useState<YVar>('precipitation');
  const [kind, setKind] = useState<'line' | 'bars'>('line');

  const rows = useMemo(() => obs.map((o, i) => ({ o, i })).filter(({ o }) => {
    if (filter !== 'all' && o.quality !== filter) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return o.t.includes(q) || monthLabel(o.t, true).toLowerCase().includes(q) || o.quality.includes(q) || formatValue(o.value).includes(q);
  }), [obs, filter, query]);

  const ticks = useMemo(() => {
    if (!ds) return [];
    const n = ds.months.length;
    if (n <= 14) return ds.months.map((t, i) => ({ index: i, label: monthLabel(t).slice(0, 3) }));
    const everyYears = n > 200 ? 4 : n > 80 ? 2 : 1;
    return ds.months.map((t, i) => ({ t, i })).filter(({ t }) => t.endsWith('-01') && Number(t.slice(0, 4)) % everyYears === 0).map(({ t, i }) => ({ index: i, label: t.slice(0, 4) }));
  }, [ds]);

  const cur = obs[cursor];

  const header = (
    <div className="panel-head">
      <h2 className="panel-title" id="dataset-title"><I.Grid size={18} /> Numerical dataset</h2>
      <div className="tabs-inline" role="tablist" aria-label="Dataset view" style={{ marginLeft: 'auto' }}>
        {(['table', 'map', 'graph'] as const).map((v) => (
          <button key={v} role="tab" className="tab-inline" aria-selected={view === v} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
        ))}
      </div>
      <button className={`btn small ${view === 'metadata' ? 'active' : ''}`} onClick={() => setView('metadata')} aria-pressed={view === 'metadata'}><I.Info /> Metadata</button>
    </div>
  );

  if (!ds) {
    return (
      <section className="panel main-panel" aria-labelledby="dataset-title">
        {header}
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column' }}>
          {view === 'table' && <TableShell />}
          <div className="empty" style={{ flex: 1 }}>
            {view === 'graph' ? <I.LineChart size={40} /> : view === 'map' ? <I.Pin size={34} /> : <I.Database size={38} />}
            <div className="big">{load.state === 'loading' ? load.message : view === 'graph' ? 'Load a time series to plot precipitation' : view === 'map' ? 'Load data to map rainfall' : 'Import a NASA sample to inspect records'}</div>
          </div>
        </div>
        <div className="panel-foot"><span>0 records loaded</span><span className="spacer" /><span className="italic">Availability is app-derived</span></div>
      </section>
    );
  }

  return (
    <section className="panel main-panel" aria-labelledby="dataset-title">
      {header}
      {view === 'table' && (
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <label className="row grow" style={{ border: '1px solid var(--line-2)', borderRadius: 6, padding: '0 8px', background: 'var(--panel-2)' }}>
              <I.Search /><input type="search" placeholder="Search records (e.g. 2010, jul, missing)" value={query} onChange={(e) => setQuery(e.target.value)} style={{ border: 'none', background: 'transparent', flex: 1 }} aria-label="Search records" />
            </label>
            <label className="row"><I.Filter /><span className="sr-only">Filter by availability</span>
              <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter by availability">
                <option value="all">All availability</option><option value="valid">Valid</option><option value="partial">Partial</option><option value="missing">Missing</option>
              </select>
            </label>
            <div style={{ position: 'relative' }}>
              <button className="btn small" onClick={() => setShowCols(!showCols)} aria-expanded={showCols}><I.Columns /> Columns</button>
              {showCols && (
                <div className="section" style={{ position: 'absolute', right: 0, top: 32, zIndex: 5, padding: 8, width: 180 }}>
                  <label className="row"><input type="checkbox" checked={cols.error} onChange={(e) => setCols({ ...cols, error: e.target.checked })} /> Random error</label>
                  <label className="row"><input type="checkbox" checked={cols.coverage} onChange={(e) => setCols({ ...cols, coverage: e.target.checked })} /> Valid coverage</label>
                </div>
              )}
            </div>
          </div>
          <div className="table-wrap">
            <table className="data">
              <caption className="sr-only">Monthly precipitation for {selection?.label}. Select a row to move the shared timeline.</caption>
              <thead><tr>
                <th>time<span className="u">UTC · month</span></th>
                <th>lat<span className="u">Latitude · °N</span></th>
                <th>lon<span className="u">Longitude · °E</span></th>
                <th>precipitation<span className="u">{selection?.type === 'area' ? 'Area mean' : 'Cell'} rate · mm/hr</span></th>
                {cols.error && <th>random error<span className="u">RMS · mm/hr</span></th>}
                {cols.coverage && <th>coverage<span className="u">valid cells</span></th>}
                <th>availability<span className="u">App status</span></th>
              </tr></thead>
              <tbody>
                {rows.map(({ o, i }) => (
                  <tr key={o.id} className={`${i === cursor ? 'current' : ''} ${o.quality === 'missing' ? 'missing' : ''}`} onClick={() => seek(i)} aria-selected={i === cursor}
                    tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') seek(i); }} ref={i === cursor ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}>
                    <td>{o.t}</td>
                    <td>{o.lat?.toFixed(2) ?? '—'}</td>
                    <td>{o.lon?.toFixed(2) ?? '—'}</td>
                    <td>{o.value == null ? 'missing' : o.value.toFixed(4)}</td>
                    {cols.error && <td>{formatValue(o.randomError, 4)}</td>}
                    {cols.coverage && <td>{o.coverage != null ? `${(o.coverage * 100).toFixed(1)}% (${o.validCells})` : o.selectionType === 'cell' ? '1 cell' : '—'}</td>}
                    <td><span className={`badge ${o.quality}`}>{o.quality}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selection?.type === 'area' && <div className="muted" style={{ fontSize: 12 }}>lat/lon show the region centre; the value is a cos-latitude-weighted mean of valid cells inside the outline.</div>}
        </div>
      )}
      {view === 'map' && (
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ds.grid ? (
            <>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <CellPicker />
                <span className="spacer" />
                <button className="btn small primary" onClick={() => void scanCurrent()} aria-keyshortcuts="S"><I.Wave size={13} /> Sweep this month (S)</button>
              </div>
              <RegionMap dataset={ds} monthIndex={cursor} selection={selection} onSelectCell={selectCell} />
            </>
          ) : <div className="empty"><I.Pin size={30} /><div className="big">Map requires gridded coordinates</div><div className="italic">Imported point files are listed in Table and Graph.</div></div>}
        </div>
      )}
      {view === 'graph' && (
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <span className="chip">X: time (UTC, month)</span>
            <label className="row"><span className="muted">Y</span>
              <select value={yVar} onChange={(e) => setYVar(e.target.value as YVar)} aria-label="Y axis variable">
                <option value="precipitation">precipitation (mm/hr)</option>
                <option value="randomError" disabled={!obs.some((o) => o.randomError != null)}>random error (mm/hr)</option>
                <option value="coverage" disabled={selection?.type !== 'area'}>valid coverage (fraction)</option>
              </select>
            </label>
            <div className="seg" role="group" aria-label="Chart type">
              <button aria-pressed={kind === 'line'} onClick={() => setKind('line')}>Line</button>
              <button aria-pressed={kind === 'bars'} onClick={() => setKind('bars')}>Bars</button>
            </div>
            <span className="spacer" />
            <span className="muted">{selection?.label} · {selection?.type === 'area' ? 'area mean' : 'single cell'}</span>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <TimeSeriesGraph
              points={obs.map((o) => ({ key: o.t, value: yVar === 'precipitation' ? o.value : yVar === 'randomError' ? o.randomError ?? null : o.coverage ?? null }))}
              cursor={cursor} range={range} onSelect={seek} kind={kind}
              yLabel={yVar === 'coverage' ? 'Valid coverage' : yVar === 'randomError' ? 'Random error (mm/hr)' : 'Precipitation rate (mm/hr)'}
              ticks={ticks} yMax={yVar === 'coverage' ? 1 : undefined}
              describe={`${yVar} for ${selection?.label}, ${ds.months[0]} to ${ds.months[ds.months.length - 1]}. Cursor at ${cur?.t}: ${cur?.value == null ? 'missing' : cur.value.toFixed(3) + ' mm/hr'}.`}
            />
          </div>
        </div>
      )}
      {view === 'metadata' && (
        <div className="panel-body">
          <dl className="kv" style={{ gridTemplateColumns: '170px 1fr' }}>
            <dt>Title</dt><dd style={{ fontFamily: 'var(--font)' }}>{ds.manifest.title}</dd>
            <dt>Dataset / version</dt><dd>{ds.manifest.datasetId} · {ds.manifest.datasetVersion}</dd>
            <dt>Variable</dt><dd>{ds.manifest.variable} — {ds.manifest.longName ?? ''}</dd>
            <dt>Unit</dt><dd>{ds.manifest.unit} <span className="muted">({ds.manifest.unitNote})</span></dd>
            <dt>Cadence / coverage</dt><dd>{ds.manifest.cadence} · {ds.manifest.coverage.start} → {ds.manifest.coverage.end} ({ds.manifest.coverage.count}{ds.manifest.coverage.target ? ` of target ${ds.manifest.coverage.target.count}` : ''})</dd>
            {ds.manifest.grid && <><dt>Grid</dt><dd>{ds.manifest.grid.nlat}×{ds.manifest.grid.nlon} cells · 0.1° · extent {ds.manifest.grid.extent.join(', ')}</dd></>}
            <dt>Source</dt><dd style={{ fontFamily: 'var(--font)' }}>{ds.manifest.source.provider}{ds.manifest.source.url && <> · <a href={ds.manifest.source.url} target="_blank" rel="noreferrer">dataset page</a></>}</dd>
            {ds.manifest.source.doi && <><dt>DOI</dt><dd>{ds.manifest.source.doi}</dd></>}
            {ds.manifest.source.access && <><dt>Access</dt><dd style={{ fontFamily: 'var(--font)' }}>{ds.manifest.source.access}</dd></>}
            {ds.manifest.source.citation && <><dt>Citation</dt><dd style={{ fontFamily: 'var(--font)' }}>{ds.manifest.source.citation}</dd></>}
            <dt>Preparation</dt><dd style={{ fontFamily: 'var(--font)' }}>{ds.manifest.preparation.script} · {String(ds.manifest.preparation.prepared ?? '')}</dd>
            {ds.manifest.preparation.missingRule && <><dt>Missing rule</dt><dd style={{ fontFamily: 'var(--font)' }}>{ds.manifest.preparation.missingRule}</dd></>}
            {ds.manifest.quality && <><dt>Quality</dt><dd style={{ fontFamily: 'var(--font)' }}>Native: {ds.manifest.quality.native.join('; ')}. {ds.manifest.quality.appDerived}.</dd></>}
            {ds.validation && <><dt>Validation</dt><dd style={{ fontFamily: 'var(--font)' }}>
              {String(ds.validation.presentMonths)}/{String(ds.validation.expectedMonths)} months · duplicates {String(ds.validation.duplicates)} · ordered {String(ds.validation.ordered)} · missing cells {String(ds.validation.missingCells)}
              <br />Spot checks against separate OPeNDAP requests: {(ds.validation.spotChecks as { match: boolean }[]).filter((s) => s.match).length}/{(ds.validation.spotChecks as unknown[]).length} match
            </dd></>}
          </dl>
        </div>
      )}
      <div className="panel-foot">
        <span>{obs.length} observations loaded{rows.length !== obs.length && view === 'table' ? ` · ${rows.length} shown` : ''}</span>
        <span className="mono">· {selection?.label}</span>
        <span className="spacer" />
        <span className="italic">Monthly mean rate · not accumulated rainfall · availability is app-derived</span>
      </div>
    </section>
  );
}

function TableShell() {
  return (
    <div className="table-wrap" style={{ flex: 'none' }}>
      <table className="data"><thead><tr>
        <th>time<span className="u">UTC · month</span></th><th>lat<span className="u">Latitude · °N</span></th><th>lon<span className="u">Longitude · °E</span></th>
        <th>precipitation<span className="u">Mean rate · mm/hr</span></th><th>availability<span className="u">App status</span></th>
      </tr></thead></table>
    </div>
  );
}

/** Keyboard alternative to clicking the map: choose a cell by coordinates. */
function CellPicker() {
  const ds = useStore((s) => s.dataset)!;
  const g = ds.grid!;
  const [lat, setLat] = useState('14.60');
  const [lon, setLon] = useState('120.98');
  const go = () => {
    const li = Math.round((Number(lat) - g.lat0) / g.step), lo = Math.round((Number(lon) - g.lon0) / g.step);
    if (Number.isFinite(li) && Number.isFinite(lo)) selectCell(li, lo);
  };
  return (
    <form className="row" style={{ flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); go(); }} aria-label="Select a grid cell by coordinates">
      <span className="muted">Location</span>
      <label className="row">lat <input type="text" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} style={{ width: 70 }} aria-label="Latitude in degrees north" /></label>
      <label className="row">lon <input type="text" inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} style={{ width: 80 }} aria-label="Longitude in degrees east" /></label>
      <button className="btn small" type="submit"><I.Pin /> Select cell</button>
      <span className="muted" style={{ fontSize: 12 }}>Extent {g.lat0 - 0.05}–{(g.lat0 + (g.nlat - 0.5) * g.step).toFixed(1)}°N, {g.lon0 - 0.05}–{(g.lon0 + (g.nlon - 0.5) * g.step).toFixed(1)}°E</span>
    </form>
  );
}
