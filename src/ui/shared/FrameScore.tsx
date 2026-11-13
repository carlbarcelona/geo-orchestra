import { useEffect, useMemo, useRef, useState } from 'react';
import type { SoundEvent } from '../../contracts';
import { controller } from '../../playback/controller';
import { cellLat, cellLon, type ScanGrid } from '../../sound/frameScan';
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
 * Frame score: the frame itself turned into a score. x = west→east sweep (time), y = latitude (pitch, north = high),
 * cell colour = rain, dots = the notes actually played (loudness = dot size).
 */
export function FrameScore({ grid, events, title, tab, emptyText }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 220 });
  const selectedId = useStore((s) => s.selectedEventId);
  const explore = useStore((s) => s.explore);
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
    const left = 64, right = 12, top = 22, bottom = 26;
    return { left, top, plotW: Math.max(50, size.w - left - right), plotH: Math.max(40, size.h - top - bottom) };
  }, [size]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !grid) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = size.w * dpr; cv.height = size.h * dpr;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const { left, top, plotW, plotH } = layout;
    const cw = plotW / grid.ncol, rh = plotH / grid.nrow;
    // heat cells
    for (let r = 0; r < grid.nrow; r++) for (let c = 0; c < grid.ncol; c++) {
      const v = grid.value(r, c);
      const y = top + (grid.nrow - 1 - r) * rh;
      if (v == null) { ctx.fillStyle = 'rgba(120,120,120,0.25)'; ctx.fillRect(left + c * cw, y, cw, rh); continue; }
      const [R, G, B] = rampColor(Math.sqrt(Math.min(1, v / grid.refMax)));
      ctx.fillStyle = `rgba(${R | 0},${G | 0},${B | 0},0.55)`;
      ctx.fillRect(left + c * cw, y, cw + 0.5, rh + 0.5);
    }
    // played notes
    for (const e of events) {
      if (!e.scan) continue;
      const x = left + (e.scan.col + 0.5) * cw, y = top + (grid.nrow - 1 - e.scan.row + 0.5) * rh;
      const rad = 1.5 + (e.velocity ?? 0.5) * Math.min(cw, rh) * 0.55;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2);
      const passed = progress != null && e.scan.col / grid.ncol <= progress;
      ctx.fillStyle = e.id === selectedId ? '#f5b942' : passed ? '#ede9fe' : '#a78bfa';
      ctx.fill();
    }
    // axes
    ctx.fillStyle = '#a9bccb'; ctx.font = '11px JetBrains Mono, monospace';
    for (let r = 0; r < grid.nrow; r += Math.max(1, Math.round(grid.nrow / 6))) {
      const lat = cellLat(grid, r);
      ctx.fillText(`${Math.abs(lat).toFixed(0)}°${lat >= 0 ? 'N' : 'S'}`, 6, top + (grid.nrow - 1 - r + 0.7) * rh);
    }
    for (let c = 0; c < grid.ncol; c += Math.max(1, Math.round(grid.ncol / 8))) ctx.fillText(`${cellLon(grid, c).toFixed(0)}°E`, left + c * cw, top + plotH + 16);
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText('pitch ↑ = north', 6, 14);
    ctx.fillText('sweep → west to east = time · louder = more rain', left + 40, 14);
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
  }, [grid, events, size, layout, progress, selectedId, explore]);

  if (!grid) return <div className="empty"><I.Image size={28} /><div className="big">{emptyText}</div></div>;

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const col = Math.floor(((e.clientX - r.left - layout.left) / layout.plotW) * grid.ncol);
    const row = grid.nrow - 1 - Math.floor(((e.clientY - r.top - layout.top) / layout.plotH) * grid.nrow);
    if (col < 0 || row < 0 || col >= grid.ncol || row >= grid.nrow) return;
    const hit = events.find((ev) => ev.scan?.col === col && ev.scan?.row === row);
    if (hit) set({ selectedEventId: hit.id });
    exploreAt(row, col);
  };

  const notes = events.length;
  const cols = new Set(events.map((e) => e.scan?.col)).size;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="row" style={{ padding: '4px 12px', flexWrap: 'wrap' }}>
        <b>{title}</b>
        <span className="muted" style={{ fontSize: 12 }}>{notes} notes across {cols} of {grid.ncol} columns · {grid.derivation === 'image-derived' ? 'image-derived (decoded from NASA colorbar)' : 'measured IMERG cells'}</span>
        <span className="spacer" />
        <button className="btn small primary" onClick={() => void scanCurrent()} aria-keyshortcuts="S"><I.Play size={13} /> Sweep this {tab === 'visual' ? 'frame' : 'month'} (S)</button>
      </div>
      <div ref={wrapRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }} onClick={onClick}
          role="img" aria-label={`${title}. Frame score with ${notes} notes. West to east is time, north is higher pitch, louder means more rain. Use Explore with the arrow keys on the frame to hear single cells.`} />
      </div>
    </div>
  );
}
