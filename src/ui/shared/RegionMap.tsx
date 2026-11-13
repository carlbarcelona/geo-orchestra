import { useEffect, useMemo, useRef, useState } from 'react';
import type { Selection } from '../../contracts';
import { cellValue, formatValue, monthLabel, type Dataset } from '../../data/dataset';
import { MAP_RANGE, MAP_TICKS, RAMP_CSS, valueColor, valueToT } from '../colormap';
import { useSweepProgress } from './FrameScore';

interface Props {
  dataset: Dataset;
  monthIndex: number;
  selection: Selection | null;
  onSelectCell: (latIndex: number, lonIndex: number) => void;
}

const REGION_CODE: Record<string, number[]> = { philippines: [1, 2, 3, 4], luzon: [1], visayas: [2], mindanao: [3] };

/** Rainfall raster rendered by GeoOrchestra from IMERG cells (not NASA imagery), with outline and selection. */
export function RegionMap({ dataset, monthIndex, selection, onSelectCell }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 400 });
  const [hover, setHover] = useState<{ li: number; lo: number } | null>(null);
  const g = dataset.grid!;
  const sweepP = useSweepProgress('numerical');

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const view = useMemo(() => {
    const lonMin = g.lon0 - g.step / 2, lonMax = g.lon0 + (g.nlon - 0.5) * g.step;
    const latMin = g.lat0 - g.step / 2, latMax = g.lat0 + (g.nlat - 0.5) * g.step;
    const kx = Math.cos((13 * Math.PI) / 180); // local aspect correction around 13°N
    const dataW = (lonMax - lonMin) * kx, dataH = latMax - latMin;
    const scale = Math.min(size.w / dataW, size.h / dataH) * 0.96;
    const ox = (size.w - dataW * scale) / 2, oy = (size.h - dataH * scale) / 2;
    return {
      lonMin, latMax, kx, scale, ox, oy,
      x: (lon: number) => ox + (lon - lonMin) * kx * scale,
      y: (lat: number) => oy + (latMax - lat) * scale,
      inv: (px: number, py: number) => ({ lon: lonMin + (px - ox) / (kx * scale), lat: latMax - (py - oy) / scale }),
    };
  }, [g, size]);

  // raster image for the month, one pixel per cell
  const raster = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = g.nlon; c.height = g.nlat;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(g.nlon, g.nlat);
    for (let j = 0; j < g.nlat; j++) {
      for (let i = 0; i < g.nlon; i++) {
        const v = cellValue(g, monthIndex, j, i);
        const o = ((g.nlat - 1 - j) * g.nlon + i) * 4;
        if (v == null) { img.data[o] = 60; img.data[o + 1] = 60; img.data[o + 2] = 60; img.data[o + 3] = 120; continue; }
        const [r, gg, b] = valueColor(v);
        img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 235;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }, [g, monthIndex]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = size.w * dpr; cv.height = size.h * dpr;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.imageSmoothingEnabled = false;
    const x0 = view.x(g.lon0 - g.step / 2), y0 = view.y(g.lat0 + (g.nlat - 0.5) * g.step);
    const x1 = view.x(g.lon0 + (g.nlon - 0.5) * g.step), y1 = view.y(g.lat0 - g.step / 2);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(raster, x0, y0, x1 - x0, y1 - y0);
    ctx.globalAlpha = 1;
    // graticule
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.font = '10px JetBrains Mono, monospace'; ctx.fillStyle = 'rgba(200,220,235,0.6)';
    for (let lon = 118; lon <= 127; lon += 2) { const x = view.x(lon); ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); ctx.fillText(`${lon}°E`, x + 2, y1 - 4); }
    for (let lat = 6; lat <= 20; lat += 2) { const y = view.y(lat); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.fillText(`${lat}°N`, x0 + 3, y - 3); }
    // outlines
    const drawGeom = (geom: { type: string; coordinates: any }) => {
      const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
      ctx.beginPath();
      for (const poly of polys) for (const ring of poly) {
        ring.forEach(([lon, lat]: number[], k: number) => (k ? ctx.lineTo(view.x(lon), view.y(lat)) : ctx.moveTo(view.x(lon), view.y(lat))));
        ctx.closePath();
      }
    };
    const feats = dataset.outline?.features ?? [];
    const ph = feats.find((f) => f.id === 'philippines');
    if (ph) { drawGeom(ph.geometry); ctx.strokeStyle = 'rgba(235,245,255,0.75)'; ctx.lineWidth = 1; ctx.stroke(); }
    if (selection?.type === 'area' && selection.regionId) {
      const f = feats.find((x) => x.id === selection.regionId);
      if (f) { drawGeom(f.geometry); ctx.strokeStyle = '#f5b942'; ctx.lineWidth = 2.2; ctx.setLineDash([5, 3]); ctx.stroke(); ctx.setLineDash([]); }
    }
    // spatial samples
    for (const s of dataset.samples) {
      const x = view.x(s.cell.lon), y = view.y(s.cell.lat);
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fillStyle = '#a78bfa'; ctx.fill(); ctx.strokeStyle = '#0b1622'; ctx.lineWidth = 1; ctx.stroke();
    }
    // selected cell
    if (selection?.type === 'cell' && selection.lat != null && selection.lon != null) {
      const s = g.step / 2;
      const xa = view.x(selection.lon - s), ya = view.y(selection.lat + s);
      const w = Math.max(6, view.x(selection.lon + s) - xa), h = Math.max(6, view.y(selection.lat - s) - ya);
      ctx.strokeStyle = '#f5b942'; ctx.lineWidth = 2.5; ctx.strokeRect(xa - 2, ya - 2, w + 4, h + 4);
    }
    if (sweepP != null) {
      const xs = x0 + (x1 - x0) * sweepP;
      ctx.strokeStyle = '#f5b942'; ctx.lineWidth = 2.5; ctx.shadowColor = '#f5b942'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(xs, y0); ctx.lineTo(xs, y1); ctx.stroke(); ctx.shadowBlur = 0;
    }
    if (hover) {
      const lat = g.lat0 + hover.li * g.step, lon = g.lon0 + hover.lo * g.step, s = g.step / 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
      ctx.strokeRect(view.x(lon - s), view.y(lat + s), view.x(lon + s) - view.x(lon - s), view.y(lat - s) - view.y(lat + s));
    }
  }, [view, raster, selection, hover, dataset, size, g, sweepP]);

  const toCell = (e: React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const { lon, lat } = view.inv(e.clientX - r.left, e.clientY - r.top);
    const lo = Math.round((lon - g.lon0) / g.step), li = Math.round((lat - g.lat0) / g.step);
    if (li < 0 || lo < 0 || li >= g.nlat || lo >= g.nlon) return null;
    return { li, lo };
  };

  const hv = hover ? cellValue(g, monthIndex, hover.li, hover.lo) : undefined;
  const region = hover && dataset.cellRegion ? dataset.cellRegion[hover.li * g.nlon + hover.lo] : 0;
  const regionName = ['Ocean / outside', 'Luzon', 'Visayas', 'Mindanao', 'Philippines (other)'][region] ?? '';
  void REGION_CODE;

  return (
    <div className="map-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Rainfall map for ${monthLabel(dataset.months[monthIndex], true)}. Rendered by GeoOrchestra from IMERG 0.1° cells. Use the location selector for keyboard access.`}
        onMouseMove={(e) => setHover(toCell(e))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => { const c = toCell(e); if (c) onSelectCell(c.li, c.lo); }}
      />
      <div className="map-legend">
        <div>Precipitation rate · mm/hr · {monthLabel(dataset.months[monthIndex])}</div>
        <div className="bar" style={{ background: RAMP_CSS }} />
        <div style={{ position: 'relative', height: 14, width: 220 }} className="mono">
          {MAP_TICKS.map((t) => (
            <span key={t} style={{ position: 'absolute', left: `${valueToT(t) * 100}%`, transform: 'translateX(-50%)', fontSize: 10.5, color: 'var(--text-2)' }}>{t}</span>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 11 }}>Map rendered from data (≥{MAP_RANGE[1]} saturates) · ● sample cells</div>
      </div>
      {hover && (
        <div className="map-readout" aria-hidden="true">
          <div className="mono">{(g.lat0 + hover.li * g.step).toFixed(2)}°N, {(g.lon0 + hover.lo * g.step).toFixed(2)}°E</div>
          <div><b className="mono">{formatValue(hv)}</b> mm/hr <span className="muted">· {regionName}</span></div>
          <div className="muted">Click to select this cell</div>
        </div>
      )}
    </div>
  );
}
