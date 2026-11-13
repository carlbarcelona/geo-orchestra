import { useEffect, useMemo, useRef, useState } from 'react';

export interface GraphPoint { key: string; value: number | null }

interface Props {
  points: GraphPoint[];
  cursor: number;
  range?: [number, number];
  onSelect?: (i: number) => void;
  yLabel: string;
  kind?: 'line' | 'bars';
  ticks: { index: number; label: string }[];
  describe: string;
  color?: string;
  yMax?: number;
  formatValue?: (v: number) => string;
}

/** SVG time series. Missing values break the line and are marked; they are never drawn as zero. */
export function TimeSeriesGraph({ points, cursor, range, onSelect, yLabel, kind = 'line', ticks, describe, color = '#2dd4bf', yMax, formatValue = (v) => v.toFixed(3) }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 260 });
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const m = { l: 52, r: 14, t: 12, b: 28 };
  const W = Math.max(100, size.w), H = Math.max(120, size.h);
  const n = points.length;
  const vmax = useMemo(() => {
    const mx = Math.max(0, ...points.map((p) => p.value ?? 0));
    if (yMax) return yMax;
    const nice = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5];
    return nice.find((x) => x >= mx * 1.08) ?? mx * 1.1;
  }, [points, yMax]);
  const x = (i: number) => m.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - m.l - m.r));
  const y = (v: number) => H - m.b - (v / vmax) * (H - m.t - m.b);
  const segments = useMemo(() => {
    const segs: string[] = [];
    let cur = '';
    points.forEach((p, i) => {
      if (p.value == null) { if (cur) segs.push(cur); cur = ''; return; }
      cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
    });
    if (cur) segs.push(cur);
    return segs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, W, H, vmax]);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => +(f * vmax).toFixed(3));
  const pick = (e: React.MouseEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    return Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / (W - m.l - m.r)) * (n - 1))));
  };
  const hp = hover != null ? points[hover] : null;
  const cp = points[cursor];
  const barW = Math.max(1, (W - m.l - m.r) / Math.max(1, n) - 1);
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 140 }}>
      <svg className="graph" width={W} height={H} role="img" aria-label={describe}
        onMouseMove={(e) => setHover(pick(e))} onMouseLeave={() => setHover(null)} onClick={(e) => onSelect?.(pick(e))}>
        <g className="grid">{yTicks.map((t) => <line key={t} x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} />)}</g>
        {range && n > 1 && (range[0] > 0 || range[1] < n - 1) && (
          <rect x={x(range[0])} y={m.t} width={Math.max(2, x(range[1]) - x(range[0]))} height={H - m.t - m.b} fill="rgba(45,212,191,0.07)" />
        )}
        <g className="axis">
          {yTicks.map((t) => <text key={t} x={m.l - 6} y={y(t) + 3.5} textAnchor="end">{t}</text>)}
          {ticks.map((t) => <text key={t.index} x={x(t.index)} y={H - 9} textAnchor="middle">{t.label}</text>)}
          <line x1={m.l} x2={W - m.r} y1={H - m.b} y2={H - m.b} />
          <text transform={`translate(13 ${(H - m.b + m.t) / 2}) rotate(-90)`} textAnchor="middle" style={{ fontFamily: 'var(--font)' }}>{yLabel}</text>
        </g>
        {kind === 'bars'
          ? points.map((p, i) => p.value == null ? null : <rect key={i} x={x(i) - barW / 2} y={y(p.value)} width={barW} height={H - m.b - y(p.value)} fill={color} opacity={0.75} />)
          : segments.map((d, k) => <path key={k} d={d} fill="none" stroke={color} strokeWidth={n > 150 ? 1.3 : 2} />)}
        {kind === 'line' && n <= 40 && points.map((p, i) => p.value == null ? null : <circle key={i} cx={x(i)} cy={y(p.value)} r={3} fill={color} />)}
        {points.map((p, i) => p.value == null ? <g key={`m${i}`}><line x1={x(i)} x2={x(i)} y1={m.t} y2={H - m.b} stroke="#f87171" strokeDasharray="3 3" opacity={0.6} /><text x={x(i)} y={m.t + 10} fill="#f87171" fontSize={10} textAnchor="middle">missing</text></g> : null)}
        {cp && (
          <g>
            <line x1={x(cursor)} x2={x(cursor)} y1={m.t} y2={H - m.b} stroke="#f5b942" strokeWidth={1.5} />
            {cp.value != null && <circle cx={x(cursor)} cy={y(cp.value)} r={5.5} fill="#f5b942" stroke="#0b1622" strokeWidth={1.5} />}
          </g>
        )}
        {hp && hover != null && <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={H - m.b} stroke="rgba(255,255,255,0.35)" />}
      </svg>
      {hp && hover != null && (
        <div className="map-readout" style={{ top: 6, right: 8 }} aria-hidden="true">
          <div className="mono">{hp.key}</div>
          <div><b className="mono">{hp.value == null ? 'missing' : formatValue(hp.value)}</b> {hp.value == null ? '' : 'mm/hr'}</div>
        </div>
      )}
    </div>
  );
}
