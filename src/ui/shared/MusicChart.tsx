import { useEffect, useMemo, useRef, useState } from 'react';
import type { SoundEvent } from '../../contracts';
import { controller } from '../../playback/controller';
import { midiToName } from '../../sound/mapping';
import { useStore, set } from '../../state/store';
import { seek, setSpeed, stepBy, togglePlay, toggleLoop } from '../../state/actions';
import * as I from '../icons';

interface Props {
  events: SoundEvent[][];
  stepLabels: string[];       // observation axis labels, e.g. "Jan 2024" / "Jul 15"
  axisTitle: string;          // e.g. "Observation month (UTC)"
  cursor: number;
  range: [number, number];
  speeds: { value: number; label: string }[];
  speed: number;
  visibleSteps: number;
  enabled: boolean;
  emptyTitle: string;
  emptyHint?: string;
  rightInfo?: React.ReactNode;
  footNote?: string;
}

const LOW = 48, HIGH = 84; // C3..C6 display range
const BLACK = new Set([1, 3, 6, 8, 10]);

export function MusicChart(p: Props) {
  const playback = useStore((s) => s.playback);
  const loop = useStore((s) => s.loop);
  const tab = useStore((s) => s.chartTab);
  const selectedId = useStore((s) => s.selectedEventId);
  const reduced = useStore((s) => s.a11y.reducedMotion);
  const mode = useStore((s) => s.sound.mode);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 220 });
  const hitRef = useRef<{ x: number; y: number; w: number; h: number; ev: SoundEvent }[]>([]);
  const n = p.events.length;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    setSize({ w: el.clientWidth, h: el.clientHeight });
    ro.observe(el);
    return () => ro.disconnect();
  }, [tab, p.enabled]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    for (const step of p.events) for (const e of step) if (e.id === selectedId) return e;
    return null;
  }, [selectedId, p.events]);

  useEffect(() => {
    if (tab !== 'roll') return;
    let raf = 0;
    const draw = () => {
      const cv = canvasRef.current;
      if (!cv) return;
      const dpr = window.devicePixelRatio || 1;
      const W = size.w, H = size.h;
      if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
      const ctx = cv.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const left = 128, keysW = 30, top = 48, bottom = 6;
      const plotX = left + keysW, plotW = W - plotX - 12;
      const laneTex = 34, laneMark = 26, gap = 6;
      const pitchH = Math.max(60, H - top - bottom - laneTex - laneMark - gap * 2);
      const texY = top + pitchH + gap, markY = texY + laneTex + gap;
      const V = Math.min(p.visibleSteps, Math.max(1, n));
      const prog = playback === 'playing' && !reduced ? controller.progress() : 0;
      const head = p.cursor + prog;
      let first = Math.max(0, Math.min(n - V, head - Math.floor(V * 0.25)));
      if (reduced) first = Math.max(0, Math.min(n - V, Math.floor(p.cursor / V) * V));
      const stepW = plotW / V;
      const sx = (s: number) => plotX + (s - first) * stepW;
      const py = (m: number) => top + ((HIGH - m) / (HIGH - LOW)) * (pitchH - 6) + 3;

      ctx.font = '12px Inter, sans-serif';
      ctx.fillStyle = '#a9bccb';
      ctx.fillText('Playback (s)', 12, 16);
      ctx.fillText(p.axisTitle, 12, 38);
      ctx.fillText('Rainfall', 12, top + pitchH / 2 - 4); ctx.fillText(mode === 'musical' ? 'melody' : 'melody (muted)', 12, top + pitchH / 2 + 12);
      ctx.fillText('Rain texture', 12, texY + laneTex / 2 + 4);
      ctx.fillText('Event markers', 12, markY + laneMark / 2 + 4);

      // piano keys
      for (let m = LOW; m <= HIGH; m++) {
        const y0 = py(m + 0.5), y1 = py(m - 0.5);
        ctx.fillStyle = BLACK.has(m % 12) ? '#111' : '#e9eef2';
        ctx.fillRect(left, y0, keysW - 6, Math.max(1, y1 - y0 - 0.5));
        if (m % 12 === 0) { ctx.fillStyle = '#7890a3'; ctx.font = '10px JetBrains Mono, monospace'; ctx.fillText(midiToName(m), left - 26, py(m) + 3); }
      }
      // grid + time axes
      ctx.save();
      ctx.beginPath(); ctx.rect(plotX, 0, plotW, H); ctx.clip();
      ctx.fillStyle = '#0a1622'; ctx.fillRect(plotX, top, plotW, pitchH);
      ctx.fillStyle = '#0b1824'; ctx.fillRect(plotX, texY, plotW, laneTex); ctx.fillRect(plotX, markY, plotW, laneMark);
      const labelEvery = Math.max(1, Math.ceil(V / 12));
      for (let s = Math.floor(first); s <= first + V + 1 && s < n; s++) {
        const x = sx(s);
        ctx.strokeStyle = '#1a2d40'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, markY + laneMark); ctx.stroke();
        if (s % labelEvery === 0) {
          ctx.fillStyle = '#a9bccb'; ctx.font = '11px JetBrains Mono, monospace';
          const secs = (s - p.range[0]) / p.speed;
          ctx.fillText(secs >= 0 ? (secs < 60 ? `${secs.toFixed(secs % 1 ? 1 : 0)}s` : `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')}`) : '', x + 3, 16);
          ctx.fillStyle = '#d5e2ec'; ctx.font = '11.5px Inter, sans-serif';
          ctx.fillText(p.stepLabels[s] ?? '', x + 3, 38);
        }
      }
      for (let m = LOW; m <= HIGH; m += 12) { ctx.strokeStyle = '#1f3448'; ctx.beginPath(); ctx.moveTo(plotX, py(m)); ctx.lineTo(plotX + plotW, py(m)); ctx.stroke(); }
      // out-of-range shading
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      if (p.range[0] > first) ctx.fillRect(plotX, top, sx(p.range[0]) - plotX, markY + laneMark - top);
      if (p.range[1] + 1 < first + V) ctx.fillRect(sx(p.range[1] + 1), top, plotX + plotW - sx(p.range[1] + 1), markY + laneMark - top);

      const hits: typeof hitRef.current = [];
      for (let s = Math.max(0, Math.floor(first) - 1); s <= Math.min(n - 1, first + V + 1); s++) {
        const isCur = s === p.cursor;
        for (const ev of p.events[s] ?? []) {
          const x = sx(s + ev.offset), w = Math.max(3, ev.duration * stepW - 2);
          const sel = ev.id === selectedId;
          if (ev.kind === 'melody' && ev.midi != null) {
            const y = py(ev.midi) - 4;
            ctx.fillStyle = sel ? '#f5b942' : isCur ? '#c4b5fd' : '#8b6ff0';
            ctx.globalAlpha = mode === 'musical' ? 1 : 0.4;
            roundRect(ctx, x, y, w, 8, 2); ctx.fill();
            if (ev.marker === 'clipped') { ctx.fillStyle = '#f87171'; ctx.fillRect(x + w - 3, y, 3, 8); }
            ctx.globalAlpha = 1;
            hits.push({ x, y: y - 2, w, h: 12, ev });
          } else if (ev.kind === 'sample' && ev.midi != null) {
            const y = py(ev.midi) - 2;
            ctx.fillStyle = sel ? '#f5b942' : 'rgba(167,139,250,0.55)';
            ctx.globalAlpha = mode === 'musical' ? 1 : 0.35;
            ctx.fillRect(x, y, Math.max(3, w), 4);
            ctx.globalAlpha = 1;
            hits.push({ x, y: y - 3, w: Math.max(5, w), h: 10, ev });
          } else if (ev.kind === 'texture' && ev.texture) {
            const h = Math.max(2, ev.texture.intensity * (laneTex - 6));
            ctx.fillStyle = sel ? '#f5b942' : isCur ? '#5eead4' : 'rgba(45,212,191,0.45)';
            ctx.globalAlpha = mode === 'geophony' ? 1 : 0.45;
            ctx.fillRect(sx(s) + 1, texY + laneTex - 3 - h, stepW - 2, h);
            ctx.globalAlpha = 1;
            // droplet dots: density
            const dots = Math.min(14, Math.round(ev.texture.dropsPerSecond / 3));
            ctx.fillStyle = 'rgba(200,240,255,0.55)';
            for (let k = 0; k < dots; k++) ctx.fillRect(sx(s) + 2 + ((k * 37) % Math.max(4, stepW - 4)), texY + 3 + ((k * 13) % 10), 1.5, 1.5);
            hits.push({ x: sx(s), y: texY, w: stepW, h: laneTex, ev });
          } else if (ev.kind === 'marker') {
            if (ev.marker === 'missing') {
              ctx.fillStyle = 'rgba(248,113,113,0.12)'; ctx.fillRect(sx(s) + 1, top, stepW - 2, markY + laneMark - top);
              ctx.strokeStyle = 'rgba(248,113,113,0.7)'; ctx.setLineDash([4, 3]); ctx.strokeRect(sx(s) + 1, top, stepW - 2, markY + laneMark - top); ctx.setLineDash([]);
              ctx.fillStyle = '#f87171'; ctx.font = '11px Inter, sans-serif'; ctx.fillText('missing', sx(s) + 4, markY + 16);
              hits.push({ x: sx(s), y: markY, w: stepW, h: laneMark, ev });
            } else {
              const col = ev.marker === 'zero' ? '#f5b942' : '#a78bfa';
              ctx.fillStyle = sel ? '#f5b942' : col;
              ctx.fillRect(sx(s) + 1, markY + 5, 4, laneMark - 10);
              if (ev.marker === 'year' && stepW > 20) { ctx.font = '10px JetBrains Mono, monospace'; ctx.fillText(ev.original.t.slice(0, 4), sx(s) + 8, markY + 17); }
              if (ev.marker === 'zero') { ctx.font = '10px Inter, sans-serif'; ctx.fillText('zero', sx(s) + 8, markY + 17); }
              hits.push({ x: sx(s), y: markY, w: 8, h: laneMark, ev });
            }
          }
        }
      }
      // playhead
      const hx = sx(head);
      ctx.strokeStyle = '#f5b942'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(hx, top - 6); ctx.lineTo(hx, markY + laneMark); ctx.stroke();
      ctx.fillStyle = '#f5b942'; ctx.beginPath(); ctx.moveTo(hx - 6, top - 10); ctx.lineTo(hx + 6, top - 10); ctx.lineTo(hx, top - 2); ctx.fill();
      ctx.restore();
      hitRef.current = hits;
      if (playback === 'playing' && !reduced) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [p.events, p.cursor, p.range, p.speed, p.visibleSteps, p.stepLabels, p.axisTitle, size, playback, reduced, selectedId, tab, n, mode]);

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const hit = [...hitRef.current].reverse().find((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
    if (hit) {
      set({ selectedEventId: hit.ev.id });
      if (playback === 'stopped') seek(hit.ev.stepIndex);
    }
  };

  const curEvents = p.events[p.cursor] ?? [];
  const primary = curEvents.find((e) => e.kind === 'melody') ?? curEvents.find((e) => e.kind === 'marker');
  const rollLabel = primary ? `Piano roll. Current step ${p.stepLabels[p.cursor]}: ${primary.explanation}` : 'Piano roll';
  const playing = playback !== 'stopped';

  return (
    <section className="panel span-all" aria-labelledby="chart-title" style={{ flex: 1 }}>
      <div className="panel-head" style={{ flexWrap: 'wrap' }}>
        <h2 className="panel-title" id="chart-title"><I.Note size={18} /> Music chart</h2>
        <div className="seg" role="tablist" aria-label="Music chart view">
          <button role="tab" aria-selected={tab === 'roll'} onClick={() => set({ chartTab: 'roll' })}>Piano roll</button>
          <button role="tab" aria-selected={tab === 'details'} onClick={() => set({ chartTab: 'details' })}>Event details</button>
        </div>
        <div className="spacer" />
        <div className="row" role="group" aria-label="Playback controls">
          <button className="btn icon" onClick={() => stepBy(-1)} disabled={!p.enabled} aria-label="Previous observation"><I.Prev /></button>
          <button className="btn play" onClick={() => void togglePlay()} disabled={!p.enabled} aria-label={playing ? 'Pause (Space)' : 'Play (Space)'} aria-pressed={playing}>
            {playing ? <I.Pause /> : <I.Play />}
          </button>
          <button className="btn icon" onClick={() => stepBy(1)} disabled={!p.enabled} aria-label="Next observation"><I.Next /></button>
          <button className={`btn ${loop ? 'active' : ''}`} onClick={toggleLoop} disabled={!p.enabled} aria-pressed={loop}><I.Loop /> Loop</button>
          <label className="row"><span className="muted">Speed</span>
            <select value={p.speed} onChange={(e) => setSpeed(Number(e.target.value))} disabled={!p.enabled} aria-label="Playback speed">
              {p.speeds.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          {playback === 'buffering' && <span className="chip amber">Buffering…</span>}
          {p.rightInfo}
        </div>
      </div>
      {!p.enabled ? (
        <div className="panel-body"><div className="empty"><I.Note size={30} style={{ color: 'var(--note)' }} /><div className="big">{p.emptyTitle}</div>{p.emptyHint && <div className="italic">{p.emptyHint}</div>}</div></div>
      ) : tab === 'roll' ? (
        <div className="chart-area" ref={wrapRef}>
          <canvas ref={canvasRef} role="img" aria-label={rollLabel} onClick={onCanvasClick} style={{ cursor: 'pointer' }} />
          {selected && (
            <button className="chip amber" style={{ position: 'absolute', right: 14, top: 52, cursor: 'pointer' }} onClick={() => set({ chartTab: 'details' })}>
              {selected.kind === 'texture' ? 'Rainfall → texture' : selected.kind === 'marker' ? 'Marker' : 'Rainfall → note'} · Inspect event
            </button>
          )}
        </div>
      ) : (
        <div className="panel-body"><EventDetails selected={selected} current={curEvents} label={p.stepLabels[p.cursor]} /></div>
      )}
      {p.footNote && <div className="panel-foot" style={{ justifyContent: 'center' }}><span className="italic">{p.footNote}</span></div>}
    </section>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function EventDetails({ selected, current, label }: { selected: SoundEvent | null; current: SoundEvent[]; label: string }) {
  const list = selected ? [selected] : current;
  if (!list.length) return <div className="empty">No events at {label}.</div>;
  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>{selected ? 'Selected event' : `Events at the current step (${label}). Click a note in the piano roll to inspect it.`}
        {selected && <button className="btn small ghost" onClick={() => set({ selectedEventId: null })}>Show current step</button>}</p>
      <div className="event-details">
        {list.map((e) => (
          <dl className="kv" key={e.id} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10 }}>
            <dt>Kind</dt><dd>{e.kind}{e.marker ? ` · ${e.marker}` : ''}</dd>
            <dt>Observation</dt><dd>{e.original.label}</dd>
            <dt>Original value</dt><dd>{e.original.value == null ? 'missing' : `${e.original.value.toFixed(4)} ${e.original.unit}`}</dd>
            {e.midi != null && <><dt>Note</dt><dd>{e.note} (MIDI {e.midi}) · vel {e.velocity}</dd></>}
            {e.pan != null && e.kind === 'sample' && <><dt>Stereo pan</dt><dd>{e.pan}</dd></>}
            {e.texture && <><dt>Texture</dt><dd>{e.texture.dropsPerSecond} drops/s · intensity {e.texture.intensity}</dd></>}
            <dt>Selection</dt><dd>{e.selectionId}</dd>
            <dt>Sources</dt><dd style={{ wordBreak: 'break-all' }}>{e.sourceObservationIds.join(', ')}</dd>
            <dt>Mapping</dt><dd>{e.mappingVersion}</dd>
            <dt>Explanation</dt><dd style={{ fontFamily: 'var(--font)' }}>{e.explanation}</dd>
          </dl>
        ))}
      </div>
    </div>
  );
}
