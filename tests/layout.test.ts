import { describe, expect, it } from 'vitest';
import { clampColumns, clampTop, LIMITS, layoutVars, parseTracks, readLayout, writeLayout } from '../src/ui/shell/layout';

describe('resizable layout', () => {
  it('parses resolved grid tracks', () => {
    expect(parseTracks('300px 812.5px 330px')).toEqual([300, 812.5, 330]);
    expect(parseTracks('  ')).toEqual([]);
  });

  it('keeps side columns at their minimum and the centre at least 420 px', () => {
    expect(clampColumns(100, 100, 1400)).toEqual({ left: LIMITS.left, right: LIMITS.right });
    const w = 1200;
    const c = clampColumns(900, 330, w, 'left');
    expect(w - 2 * LIMITS.gap - c.left - c.right).toBeGreaterThanOrEqual(LIMITS.centre);
    expect(c.right).toBe(330); // the side not being dragged is kept
    const d = clampColumns(300, 900, w, 'right');
    expect(d.left).toBe(300);
    expect(w - 2 * LIMITS.gap - d.left - d.right).toBeGreaterThanOrEqual(LIMITS.centre);
  });

  it('never squeezes a side below its minimum, even in a tiny window', () => {
    const c = clampColumns(500, 500, 600);
    expect(c.left).toBeGreaterThanOrEqual(LIMITS.left);
    expect(c.right).toBeGreaterThanOrEqual(LIMITS.right);
  });

  it('keeps the music chart at least 220 px tall and the top row at least 260 px', () => {
    expect(clampTop(10, 900)).toBe(LIMITS.top);
    expect(clampTop(5000, 900)).toBe(900 - LIMITS.gap - LIMITS.bottom);
  });

  it('only sets CSS variables for sizes that were changed', () => {
    expect(layoutVars({})).toEqual({ '--cols': null, '--rows': null });
    expect(layoutVars({ top: 380 })['--rows']).toBe('380px minmax(220px, 1fr)');
    expect(layoutVars({ left: 260, right: 300 })['--cols']).toBe('260px minmax(420px, 1fr) 300px');
  });

  it('falls back to the defaults when storage is unavailable (node has none)', () => {
    expect(() => writeLayout('visual', { top: 400 })).not.toThrow();
    expect(readLayout('visual')).toEqual({});
  });
});
