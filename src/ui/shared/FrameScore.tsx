import { useEffect, useMemo, useRef, useState } from 'react';
import type { SoundEvent } from '../../contracts';
import { describeSweep } from '../../a11y/braille';
import { controller } from '../../playback/controller';
import { analyzeBeats, fmtLat, latitudeBands, SCAN, type ScanGrid } from '../../sound/frameScan';
import { midiToName, scaleNotes } from '../../sound/mapping';
import { exploreAt, scanCurrent } from '../../state/actions';
import { set, useStore } from '../../state/store';
import { rampColor } from '../colormap';
import * as I from '../icons';

/** 0..1 position of the current sweep (one-off "Scan" or per-frame sweep during timelapse), or null. */
export function useSweepProgress(tab: 'numerical' | 'visual'): number | null {
  const sweep = useStore((s) => s.sweep);
  const playing = useStore((s) => s.playback === 'playing');
  const perFrame = useStore((s) => s.image.sweepEveryFrame && s.image.enabled && s.tab === 'visual');
  const reduced = useStore((s) => s.a11y.reducedMotion);
  const [p, setP] = useState<number | null>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (sweep?.active && sweep.tab === tab) {
        const x = (performance.now() - sweep.startedAt) / (sweep.seconds * 1000);
        setP(x < 0 ? 0 : x > 1 ? null : x);
      } else if (perFrame && playing && tab === 'visual') {
        const q = (controller.progress() - 0.05) / 0.9;
        setP(Math.max(0, Math.min(1, q)));
      } else { setP(null); return; }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [sweep, playing, perFrame, tab, reduced]);
  return p;
}

interface Props { grid: ScanGrid | null; events: SoundEvent[]; title: string; tab: 'numerical' | 'visual'; emptyText: string }

/**
 * Frame score: the frame drawn as the rule that turns it into music (scan-v2).
 * x = 11 beats west → east (time) · y = latitude bands, each labelled with its note (pitch) ·
 * dot size = rain class (loudness) · an empty beat is a rest (dry) · the Philippine sector is shaded.
 */
export function FrameScore({ grid, events, title, tab, emptyText }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 220 });
  const selectedId = useStore((s) => s.selectedEventId);
  const explore = useStore((s) => s.explore);
  const sound = useStore((s) => s.sound);
  const progress = useSweepProgress(tab);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [grid == null]);

  const layout = useMemo(() => {
    const left = 92, right = 12, top = 26, bottom = 30;
    return { left, top, plotW: Math.max(50, size.w - left - right), plotH: Math.max(40, size.h - top - bottom) };
  }, [size]);

  const beats = useMemo(() => (grid ? analyzeBeats(grid, sound) : []), [grid, sound.scale, sound.pitchLow, sound.pitchHigh]); // eslint-disable-line react-hooks/exhaustive-deps
  const bands = useMemo(() => latitudeBands(scaleNotes(sound.scale, sound.pitchLow, sound.pitchHigh)), [sound.scale, sound.pitchLow, sound.pitchHigh]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !grid) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = size.w * dpr; cv.height = size.h * dpr;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const { left, top, plotW, plotH } = layout;
    const lonMax = grid.lonMin + grid.ncol * grid.step, latMax = grid.latMin + grid.nrow * grid.step;
    const xOf = (lon: number) => left + ((lon - grid.lonMin) / (lonMax - grid.lonMin)) * plotW;
    const yOf = (lat: number) => top + ((latMax - lat) / (latMax - grid.latMin)) * plotH;
    const cw = plotW / grid.ncol, rh = plotH / grid.nrow;
    // heat cells (faint background: what the frame shows)
    for (let r = 0; r < grid.nrow; r++) for (let c = 0; c < grid.ncol; c++) {
      const v = grid.value(r, c);
      const y = top + (grid.nrow - 1 - r) * rh;
      if (v == null) { ctx.fillStyle = 'rgba(120,120,120,0.2)'; ctx.fillRect(left + c * cw, y, cw, rh); continue; }
      const [R, G, B] = rampColor(Math.sqrt(Math.min(1, v / grid.refMax)));
      ctx.fillStyle = `rgba(${R | 0},${G | 0},${B | 0},0.35)`;
      ctx.fillRect(left + c * cw, y, cw + 0.5, rh + 0.5);
    }
    // Philippine sector shading + beat columns and numbers
    ctx.font = '10.5px JetBrains Mono, monospace';
    for (const b of beats) {
      const x0 = xOf(b.lon[0]), x1 = xOf(b.lon[1]);
      if (b.inRegion) { ctx.fillStyle = 'rgba(245,185,66,0.10)'; ctx.fillRect(x0, top, x1 - x0, plotH); }
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, top - 4); ctx.lineTo(x0, top + plotH); ctx.stroke();
      ctx.fillStyle = b.inRegion ? '#f5b942' : '#a9bccb';
      ctx.fillText(String(b.beat + 1), (x0 + x1) / 2 - 3, top - 8);
      if (!b.notes.length) { ctx.fillStyle = 'rgba(169,188,203,0.7)'; ctx.font = 'italic 10px Inter, sans-serif'; ctx.fillText('rest', (x0 + x1) / 2 - 9, top + plotH - 4); ctx.font = '10.5px JetBrains Mono, monospace'; }
    }
    // latitude bands = notes
    const bandPx = plotH / ((latMax - grid.latMin) / (bands[0] ? bands[0].hi - bands[0].lo : 1));
    const every = bandPx >= 12 ? 1 : bandPx >= 6 ? 2 : 4;
    bands.forEach((b, k) => {
      if (b.hi <= grid.latMin || b.lo >= latMax) return;
      const yLo = yOf(Math.max(b.lo, grid.latMin));
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.beginPath(); ctx.moveTo(left, yLo); ctx.lineTo(left + plotW, yLo); ctx.stroke();
      if (k % every === 0) {
        const yc = yOf((Math.max(b.lo, grid.latMin) + Math.min(b.hi, latMax)) / 2);
        ctx.fillStyle = '#d5e2ec'; ctx.font = '10.5px JetBrains Mono, monospace';
        ctx.fillText(`${midiToName(b.midi).padEnd(3)} ${fmtLat((b.lo + b.hi) / 2)}`, 4, yc + 3.5);
      }
    });
    // the notes that sound: one dot per (beat, latitude band); size = rain class
    for (const e of events) {
      if (e.kind !== 'scan' || e.scan?.beat == null) continue;
      const x = xOf(e.scan.lon), y = yOf(e.scan.lat);
      const rad = 3 + (e.velocity ?? 0.4) * 9;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2);
      const passed = progress != null && (e.scan.beat + 0.5) / Math.max(1, beats.length) <= progress;
      ctx.fillStyle = e.id === selectedId ? '#f5b942' : passed ? '#ede9fe' : '#a78bfa';
      ctx.fill();
      ctx.strokeStyle = '#0b1622'; ctx.lineWidth = 1; ctx.stroke();
    }
    // axes
    ctx.fillStyle = '#a9bccb'; ctx.font = '11px JetBrains Mono, monospace';
    for (const b of beats) if (b.beat % 2 === 0) ctx.fillText(`${Math.round(b.lon[0])}°E`, xOf(b.lon[0]) + 2, top + plotH + 14);
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText('note · latitude', 4, 14);
    ctx.fillText('beat →', left + plotW - 44, top + plotH + 26);
    // explore cursor
    if (explore && explore.col < grid.ncol && explore.row < grid.nrow) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.strokeRect(left + explore.col * cw - 1, top + (grid.nrow - 1 - explore.row) * rh - 1, cw + 2, rh + 2);
    }
    // sweep playhead
    if (progress != null) {
      const x = left + progress * plotW;
      ctx.strokeStyle = '#f5b942'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, top - 4); ctx.lineTo(x, top + plotH); ctx.stroke();
    }
  }, [grid, events, size, layout, progress, selectedId, explore, beats, bands]);

  if (!grid) return <div className="empty"><I.Image size={28} /><div className="big">{emptyText}</div></div>;

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const col = Math.floor(((e.clientX - r.left - layout.left) / layout.plotW) * grid.ncol);
    const row = grid.nrow - 1 - Math.floor(((e.clientY - r.top - layout.top) / layout.plotH) * grid.nrow);
    if (col < 0 || row < 0 || col >= grid.ncol || row >= grid.nrow) return;
    const lat = grid.latMin + (row + 0.5) * grid.step, lon = grid.lonMin + (col + 0.5) * grid.step;
    const hit = events.find((ev) => ev.kind === 'scan' && ev.scan?.latBand && lat >= ev.scan.latBand[0] && lat < ev.scan.latBand[1]
      && beats[ev.scan.beat!] && lon >= beats[ev.scan.beat!].lon[0] && lon < beats[ev.scan.beat!].lon[1]);
    if (hit) set({ selectedEventId: hit.id });
    exploreAt(row, col);
  };

  const notes = events.filter((e) => e.kind === 'scan').length;
  const silent = beats.filter((b) => !b.notes.length).length;
  const summary = describeSweep(events, beats.length);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="row" style={{ padding: '4px 12px', flexWrap: 'wrap' }}>
        <b>{title}</b>
        <span className="muted" style={{ fontSize: 12 }}>{notes} notes · {beats.length - silent} of {beats.length} beats sound · {grid.derivation === 'image-derived' ? 'image-derived (decoded from NASA colorbar)' : 'measured IMERG cells'}</span>
        <span className="spacer" />
        <button className="btn small primary" onClick={() => void scanCurrent()} aria-keyshortcuts="S"><I.Play size={13} /> Sweep this {tab === 'visual' ? 'frame' : 'month'} (S)</button>
      </div>
      <div className="score-rule" aria-hidden="true">
        <span><b>Pitch</b> = latitude (north higher)</span><span><b>Loudness</b> = rain class (dot size)</span><span><b>Silence</b> = dry</span><span><b>{SCAN.beats} beats</b> west → east</span><span className="score-ph">▮ Philippine sector (soft tick)</span>
      </div>
      <div ref={wrapRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }} onClick={onClick}
          role="img" aria-label={`${title}. ${summary} Use Explore with the arrow keys on the frame to hear single cells.`} />
      </div>
      <p className="sr-only">{summary}</p>
    </div>
  );
}
