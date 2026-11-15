import { useEffect, useRef } from 'react';
import { announce } from '../../state/store';
import { clampColumns, clampTop, LIMITS, layoutVars, parseTracks, readLayout, RESET_LAYOUT_EVENT, writeLayout, type Layout, type WorkspaceId } from './layout';

export type Edge = 'left' | 'right' | 'top';
const LABEL: Record<Edge, string> = {
  left: 'Resize the left panel',
  right: 'Resize the right panel',
  top: 'Resize the music chart: drag up or down',
};

/**
 * Drag handles between the workspace panels. They are absolutely positioned grid children, so they take no grid
 * cell and sit in the gaps, and they change the grid tracks through CSS variables on the workspace, so dragging
 * never re-renders React. Keyboard: focus a handle, arrows move 16 px (Shift 64), Home/End go to the limits,
 * Enter (or a double-click) resets.
 */
export function ResizeHandles({ workspace, edges }: { workspace: WorkspaceId; edges: { edge: Edge; className: string }[] }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const host = () => anchor.current?.parentElement ?? null;

  useEffect(() => {
    const el = host();
    if (!el) return;
    const fit = () => apply(el, clampLayout(el, readLayout(workspace)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    const reset = () => { writeLayout(workspace, {}); apply(el, {}); };
    window.addEventListener(RESET_LAYOUT_EVENT, reset);
    return () => { ro.disconnect(); window.removeEventListener(RESET_LAYOUT_EVENT, reset); };
  }, [workspace]);

  /** Set one edge to `to` px (clamped), apply it and return the full layout. */
  const move = (el: HTMLElement, edge: Edge, to: number): Layout => {
    const cur = resolved(el);
    const next: Layout = { ...readLayout(workspace) };
    if (edge === 'top') next.top = to;
    else { next.left = edge === 'left' ? to : (next.left ?? cur.left); next.right = edge === 'right' ? to : (next.right ?? cur.right); }
    const l = clampLayout(el, next, edge === 'right' ? 'right' : 'left');
    apply(el, l);
    return l;
  };

  const onPointerDown = (edge: Edge) => (e: React.PointerEvent<HTMLDivElement>) => {
    const el = host();
    if (!el || e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const start = resolved(el);
    const x0 = e.clientX, y0 = e.clientY;
    let last: Layout | null = null, raf = 0, pending: PointerEvent | null = null;
    document.body.classList.add(edge === 'top' ? 'resizing-row' : 'resizing-col');
    const step = () => {
      raf = 0;
      if (!pending) return;
      const dx = pending.clientX - x0, dy = pending.clientY - y0;
      last = move(el, edge, edge === 'top' ? start.top + dy : edge === 'left' ? start.left + dx : start.right - dx);
    };
    const onMove = (ev: PointerEvent) => { pending = ev; if (!raf) raf = requestAnimationFrame(step); };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      if (raf) { cancelAnimationFrame(raf); step(); }
      document.body.classList.remove('resizing-row', 'resizing-col');
      if (last) writeLayout(workspace, last);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };

  const resetEdge = (edge: Edge) => {
    const el = host();
    if (!el) return;
    const l = { ...readLayout(workspace) };
    if (edge === 'top') delete l.top; else { delete l.left; delete l.right; }
    writeLayout(workspace, l);
    apply(el, l);
    announce(edge === 'top' ? 'Music chart height reset' : 'Panel widths reset');
  };

  const onKeyDown = (edge: Edge) => (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = host();
    if (!el) return;
    const cur = resolved(el)[edge];
    const d = e.shiftKey ? 64 : 16;
    const keys: Record<string, number> = edge === 'top' ? { ArrowDown: d, ArrowUp: -d } : edge === 'left' ? { ArrowRight: d, ArrowLeft: -d } : { ArrowLeft: d, ArrowRight: -d };
    let to: number | null = null;
    if (e.key in keys) to = cur + keys[e.key];
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = 1e5;
    else if (e.key === 'Enter') { e.preventDefault(); resetEdge(edge); return; }
    if (to == null) return;
    e.preventDefault();
    e.stopPropagation();
    writeLayout(workspace, move(el, edge, to));
  };

  return (
    <>
      <span ref={anchor} hidden />
      {edges.map(({ edge, className }) => (
        <div key={edge} className={`splitter ${edge === 'top' ? 'splitter-row' : 'splitter-col'} ${className}`}
          role="separator" tabIndex={0} aria-orientation={edge === 'top' ? 'horizontal' : 'vertical'} aria-label={LABEL[edge]}
          title={`${LABEL[edge]} · double-click to reset`}
          onPointerDown={onPointerDown(edge)} onDoubleClick={() => resetEdge(edge)} onKeyDown={onKeyDown(edge)}>
          <span className="splitter-grip" aria-hidden="true" />
        </div>
      ))}
    </>
  );
}

const inner = (el: HTMLElement) => ({ w: el.clientWidth - 2 * LIMITS.pad, h: el.clientHeight - 2 * LIMITS.pad });

/** The sizes the grid currently resolves to (stored or stylesheet default). */
function resolved(el: HTMLElement): Required<Layout> {
  const cs = getComputedStyle(el);
  const c = parseTracks(cs.gridTemplateColumns), r = parseTracks(cs.gridTemplateRows);
  return { left: c[0] ?? 300, right: c[2] ?? 330, top: r[0] ?? 400 };
}

function clampLayout(el: HTMLElement, l: Layout, moving: 'left' | 'right' = 'left'): Layout {
  const { w, h } = inner(el);
  const out: Layout = {};
  if (l.left != null && l.right != null) Object.assign(out, clampColumns(l.left, l.right, w, moving));
  if (l.top != null) out.top = clampTop(l.top, h);
  return out;
}

function apply(el: HTMLElement, l: Layout) {
  for (const [k, v] of Object.entries(layoutVars(l))) {
    if (v) el.style.setProperty(k, v); else el.style.removeProperty(k);
  }
}
