import { useRef, useState } from 'react';
import { describeShape, fmtLat, fmtLon, type CropBox, type RainSystem, type ScanGrid } from '../../sound/frameScan';

type Box = { lonMin: number; lonMax: number; latMin: number; latMax: number };

const ZONE_COLOR: Record<RainSystem['zone'], string> = { tropical: '#5eead4', extratropical: '#c4b5fd' };
const LINE = '#f5b942';

/**
 * The scan line drawn over the frame (scan-v3). A thin amber line sweeps west → east across the swept area.
 * Where it crosses a rain system the line widens over exactly the latitudes that system covers in that column,
 * in the system's zone colour, and the whole system lights up while the line is inside it, so the eye sees the
 * shape and direction that the held note is describing. Systems already passed keep a faint outline.
 */
export function ScanOverlay({ grid, systems, box, progress, reduced }: { grid: ScanGrid; systems: RainSystem[]; box: Box; progress: number | null; reduced: boolean }) {
  const X = (lon: number) => ((lon - box.lonMin) / (box.lonMax - box.lonMin)) * 100;
  const Y = (lat: number) => ((box.latMax - lat) / (box.latMax - box.latMin)) * 100;
  const range = grid.latRange ?? [grid.latMin, grid.latMin + grid.nrow * grid.step];
  const x0 = X(grid.lonMin), x1 = X(grid.lonMin + grid.ncol * grid.step);
  const yTop = Y(range[1]), yBot = Y(range[0]);
  if (progress == null) return null;
  const col = Math.min(grid.ncol - 1, Math.floor(progress * grid.ncol));
  const lineX = x0 + (x1 - x0) * progress;
  const colLon = (c: number) => grid.lonMin + c * grid.step;
  const rowLat = (r: number) => grid.latMin + r * grid.step;
  const active = systems.filter((s) => col >= s.colRange[0] && col <= s.colRange[1]);
  const passed = systems.filter((s) => col > s.colRange[1]);
  const shape = (s: RainSystem, fill: string, opacity: number, stroke?: string) =>
    [...s.extents.entries()].map(([c, [r0, r1]]) => (
      <rect key={`${s.id}:${c}`} x={X(colLon(c))} y={Y(rowLat(r1 + 1))} width={X(colLon(c + 1)) - X(colLon(c))} height={Y(rowLat(r0)) - Y(rowLat(r1 + 1))}
        fill={fill} fillOpacity={opacity} stroke={stroke ?? 'none'} strokeWidth={stroke ? 0.15 : 0} vectorEffect="non-scaling-stroke" />
    ));
  return (
    <>
      <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        {/* swept area: dim what the line has not reached yet only slightly, so the frame stays readable */}
        <rect x={x0} y={yTop} width={x1 - x0} height={yBot - yTop} fill="none" stroke={LINE} strokeOpacity={0.35} strokeDasharray="1 1" vectorEffect="non-scaling-stroke" />
        {/* white reads on every colour of NASA's ramp; the zone colour is the rim */}
        {passed.map((s) => <g key={`p${s.id}`}>{shape(s, '#ffffff', 0.1)}</g>)}
        {active.map((s) => <g key={`a${s.id}`} style={reduced ? undefined : { filter: `drop-shadow(0 0 2px ${ZONE_COLOR[s.zone]}) drop-shadow(0 0 1px ${ZONE_COLOR[s.zone]})` }}>{shape(s, '#ffffff', 0.38)}</g>)}
        {/* the line itself */}
        <line x1={lineX} x2={lineX} y1={yTop} y2={yBot} stroke={LINE} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {/* where it crosses a system, the line expands over that system's latitudes in this column */}
        {active.map((s) => {
          const e = s.extents.get(col);
          if (!e) return null;
          const y1 = Y(rowLat(e[1] + 1)), y2 = Y(rowLat(e[0]));
          return (
            <g key={`l${s.id}`}>
              <line x1={lineX} x2={lineX} y1={y1} y2={y2} stroke={ZONE_COLOR[s.zone]} strokeWidth={12} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              <line x1={lineX} x2={lineX} y1={y1} y2={y2} stroke="#ffffff" strokeWidth={4} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
      </svg>
      {active.slice(0, 3).map((s, i) => (
        <div key={`t${s.id}`} className="system-tag" style={{ ...(lineX > 66 ? { right: `calc(${100 - lineX}% + 10px)` } : { left: `calc(${lineX}% + 10px)` }), top: `calc(${Y(s.latRange[1])}% + ${i * 4}px)`, borderColor: ZONE_COLOR[s.zone] }}>
          <b style={{ color: ZONE_COLOR[s.zone] }}>System {s.id}</b> · {s.zone} · {s.intensity} · {describeShape(s)}
          <div className="dim">{fmtLat(s.latRange[0])}–{fmtLat(s.latRange[1])}, {fmtLon(s.lonRange[0])}–{fmtLon(s.lonRange[1])}</div>
        </div>
      ))}
    </>
  );
}

/** Drag a rectangle on the frame to choose the part the sweep reads. Returns the crop in degrees. */
export function CropLayer({ box, onDone }: { box: Box; onDone: (c: CropBox | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const frac = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
  };
  const toLon = (x: number) => box.lonMin + x * (box.lonMax - box.lonMin);
  const toLat = (y: number) => box.latMax - y * (box.latMax - box.latMin);
  return (
    <div ref={ref} className="crop-layer" role="presentation"
      onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); const p = frac(e); setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); }}
      onPointerMove={(e) => { e.stopPropagation(); if (!drag) return; const p = frac(e); setDrag({ ...drag, x1: p.x, y1: p.y }); }}
      onPointerUp={(e) => {
        e.stopPropagation();
        if (!drag) return;
        const xa = Math.min(drag.x0, drag.x1), xb = Math.max(drag.x0, drag.x1), ya = Math.min(drag.y0, drag.y1), yb = Math.max(drag.y0, drag.y1);
        setDrag(null);
        if (xb - xa < 0.02 || yb - ya < 0.03) { onDone(null); return; }
        onDone({ lonMin: +toLon(xa).toFixed(1), lonMax: +toLon(xb).toFixed(1), latMin: +toLat(yb).toFixed(1), latMax: +toLat(ya).toFixed(1) });
      }}>
      {drag && <div className="crop-box drawing" style={{ left: `${Math.min(drag.x0, drag.x1) * 100}%`, top: `${Math.min(drag.y0, drag.y1) * 100}%`, width: `${Math.abs(drag.x1 - drag.x0) * 100}%`, height: `${Math.abs(drag.y1 - drag.y0) * 100}%` }} />}
      {!drag && <div className="crop-hint">Drag a box over the part of the map the sweep should read · Esc to cancel</div>}
    </div>
  );
}
