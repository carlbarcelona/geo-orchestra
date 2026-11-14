import type { AnomalyCategory, Observation, SoundEvent, StepContext } from '../contracts';

/**
 * Context for listening: how each value compares with its "normal". Pure and deterministic.
 * Monthly history: the normal is the 2001–2022 mean of the same calendar month (the averaging years of
 * NASA SVS 5478), so the numerical and the visual-feed workspaces share one definition of "normal".
 * Seasonal climatology: the reference is the yearly average of the cycle itself.
 * Missing values are never used to build a normal and never get a category.
 */
export const NORMAL = { baseline: [2001, 2022] as [number, number], minYears: 5, zNear: 0.5, zFar: 1.5, zExtreme: 2 };

export const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface MonthNormal { mean: number; sd: number; n: number }

/** Same-month normals (index 0 = January). A month with fewer than `minYears` valid baseline years has no normal (null). */
export function monthlyNormals(obs: Observation[], baseline = NORMAL.baseline, minYears = NORMAL.minYears): (MonthNormal | null)[] {
  const by: number[][] = Array.from({ length: 12 }, () => []);
  for (const o of obs) {
    if (o.value == null || Number.isNaN(o.value) || !/^\d{4}-\d{2}$/.test(o.t)) continue;
    const y = Number(o.t.slice(0, 4)), m = Number(o.t.slice(5, 7));
    if (y < baseline[0] || y > baseline[1]) continue;
    by[m - 1].push(o.value);
  }
  return by.map((v) => {
    if (v.length < minYears) return null;
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1));
    return { mean, sd, n: v.length };
  });
}

export function categoryFromZ(z: number): AnomalyCategory {
  return z <= -NORMAL.zFar ? 'much-drier' : z <= -NORMAL.zNear ? 'drier' : z < NORMAL.zNear ? 'near-normal' : z < NORMAL.zFar ? 'wetter' : 'much-wetter';
}

export function categoryFromRatio(r: number): AnomalyCategory {
  return r < 0.7 ? 'much-drier' : r < 0.9 ? 'drier' : r <= 1.1 ? 'near-normal' : r <= 1.3 ? 'wetter' : 'much-wetter';
}

/** Context for every monthly observation: normal, anomaly, z-score, category and rank among the same calendar month. */
export function monthlyContexts(obs: Observation[], normals = monthlyNormals(obs)): StepContext[] {
  const sameMonth: number[][] = Array.from({ length: 12 }, () => []);
  for (const o of obs) if (o.value != null && /^\d{4}-\d{2}$/.test(o.t)) sameMonth[Number(o.t.slice(5, 7)) - 1].push(o.value);
  sameMonth.forEach((v) => v.sort((a, b) => b - a));
  const baseline = `${NORMAL.baseline[0]}–${NORMAL.baseline[1]} same-month mean`;
  return obs.map((o) => {
    const mi = /^\d{4}-\d{2}$/.test(o.t) ? Number(o.t.slice(5, 7)) - 1 : -1;
    const nm = mi >= 0 ? normals[mi] : null;
    const periodLabel = mi >= 0 ? MONTH_LONG[mi] : '';
    const normal = nm ? nm.mean : null;
    if (o.value == null || nm == null) {
      return { normal, anomaly: null, z: null, ratio: null, category: null, rank: null, baseline, periodLabel };
    }
    const anomaly = o.value - nm.mean;
    const z = nm.sd > 0 ? anomaly / nm.sd : 0;
    const list = sameMonth[mi];
    const position = list.indexOf(o.value) + 1;
    return {
      normal, anomaly, z, ratio: nm.mean > 0 ? o.value / nm.mean : null, category: categoryFromZ(z),
      rank: { position, of: list.length, wettest: position <= list.length / 2 }, baseline, periodLabel,
    };
  });
}

/** Context for a seasonal cycle (visual feed): the reference is the yearly average of the cycle. */
export function seasonalContexts(values: (number | null)[]): StepContext[] {
  const valid = values.filter((v): v is number => v != null && !Number.isNaN(v));
  const mean = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  const baseline = 'annual mean of the seasonal cycle';
  return values.map((v) => {
    if (v == null || mean == null) return { normal: mean, anomaly: null, z: null, ratio: null, category: null, rank: null, baseline, periodLabel: 'the yearly average' };
    const ratio = mean > 0 ? v / mean : 1;
    return { normal: mean, anomaly: v - mean, z: null, ratio, category: categoryFromRatio(ratio), rank: null, baseline, periodLabel: 'the yearly average' };
  });
}

const ORD = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

export const CATEGORY_WORDS: Record<AnomalyCategory, string> = {
  'much-drier': 'much drier than', drier: 'drier than', 'near-normal': 'close to', wetter: 'wetter than', 'much-wetter': 'much wetter than',
};

/** "much wetter than a normal July" / "drier than the yearly average" */
export function comparePhrase(c: StepContext): string {
  if (!c.category) return '';
  const target = c.periodLabel === 'the yearly average' ? 'the yearly average' : `a normal ${c.periodLabel}`;
  return `${CATEGORY_WORDS[c.category]} ${target}`;
}

/** "wettest of 25" style rank text, only for the top or bottom three. */
export function rankPhrase(c: StepContext): string {
  if (!c.rank || c.rank.of < 3) return '';
  const { position, of } = c.rank;
  if (position <= 3) return `${position === 1 ? '' : ORD(position) + ' '}wettest ${c.periodLabel} of ${of}`;
  const fromBottom = of - position + 1;
  if (fromBottom <= 3) return `${fromBottom === 1 ? '' : ORD(fromBottom) + ' '}driest ${c.periodLabel} of ${of}`;
  return '';
}

export function isExtreme(c: StepContext | undefined | null): boolean {
  return !!c && c.z != null && Math.abs(c.z) >= NORMAL.zExtreme;
}

const MUSIC_WORDS: Record<AnomalyCategory, string> = {
  'much-drier': 'melody far below the hum, dark full chord',
  drier: 'melody below the hum, dark (minor) chord',
  'near-normal': 'melody close to the hum, open (neutral) chord',
  wetter: 'melody above the hum, bright (major) chord',
  'much-wetter': 'melody high above the hum, bright full chord',
};
const GEO_WORDS: Record<AnomalyCategory, string> = {
  'much-drier': 'sparse rain with a dry wind',
  drier: 'lighter rain than usual',
  'near-normal': 'an ordinary rain bed',
  wetter: 'heavier rain than usual',
  'much-wetter': 'dense rain with distant thunder',
};

/**
 * Plain-language caption for one step: what was measured, how it compares, and what you hear.
 * Used by the caption strip, screen-reader announcements, narration and the Event details.
 */
export function explainStep(events: SoundEvent[], mode: 'musical' | 'geophony', label: string, unit = 'mm/hr'): string {
  const missing = events.find((e) => e.marker === 'missing');
  const main = events.find((e) => e.kind === 'melody' && e.id.endsWith('#m0')) ?? events.find((e) => e.kind === 'melody') ?? events.find((e) => e.kind === 'texture');
  const ctx = (main ?? missing ?? events.find((e) => e.kind === 'reference'))?.context;
  const fmt = (v: number) => v.toFixed(3);
  if (missing || !main) {
    const hum = ctx?.normal != null ? ` The hum still plays the normal for ${ctx.periodLabel || 'this step'} (${fmt(ctx.normal)} ${unit}) from other years.` : '';
    return `${label}: measurement missing — no note is played and no value is invented.${hum}`;
  }
  const v = main.original.value!;
  const parts = [`${label} · ${fmt(v)} ${unit}`];
  if (v === 0) parts.push('zero rainfall measured');
  if (ctx?.category) {
    const extra = [ctx.z != null ? `${ctx.z >= 0 ? '+' : ''}${ctx.z.toFixed(1)} SD` : ctx.ratio != null ? `${Math.round(ctx.ratio * 100)}% of it` : '', rankPhrase(ctx)].filter(Boolean).join(', ');
    parts.push(`${comparePhrase(ctx)}${extra ? ` (${extra})` : ''}`);
    const sound = mode === 'musical' ? MUSIC_WORDS[ctx.category] : GEO_WORDS[ctx.category];
    parts.push(`you hear ${sound}${isExtreme(ctx) ? ' and a bell: an unusual month' : ''}`);
  } else if (ctx) {
    parts.push(`no normal available (fewer than ${NORMAL.minYears} years of ${ctx.periodLabel || 'this period'} in ${NORMAL.baseline[0]}–${NORMAL.baseline[1]}), so you hear the amount only`);
  } else {
    parts.push(mode === 'musical' ? 'higher note = more rain' : 'denser rain = more rain');
  }
  return parts.join(' · ');
}
