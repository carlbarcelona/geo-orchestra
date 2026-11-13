import type { Availability } from '../contracts';

export interface AreaMeanResult { value: number | null; coverage: number; validCells: number; quality: Availability }

/**
 * Area-weighted mean over a masked set of cells. `values[i] === null` is missing and is excluded;
 * it is never treated as zero. Weights are cos(latitude). Coverage below `minCoverage` reports missing.
 */
export function areaMean(
  values: ArrayLike<number | null>,
  lats: ArrayLike<number>,
  mask: ArrayLike<boolean | number>,
  minCoverage = 0.5,
): AreaMeanResult {
  let wsum = 0, vsum = 0, total = 0, valid = 0;
  for (let i = 0; i < values.length; i++) {
    if (!mask[i]) continue;
    total++;
    const v = values[i];
    if (v == null || Number.isNaN(v)) continue;
    const w = Math.cos((lats[i] * Math.PI) / 180);
    wsum += w; vsum += v * w; valid++;
  }
  const coverage = total ? valid / total : 0;
  if (valid === 0 || coverage < minCoverage) return { value: null, coverage, validCells: valid, quality: 'missing' };
  return { value: vsum / wsum, coverage, validCells: valid, quality: coverage >= 0.999 ? 'valid' : 'partial' };
}

/** Change between successive valid observations. Across a gap the change is undefined (null). */
export function successiveChange(values: (number | null)[]): (number | null)[] {
  return values.map((v, i) => {
    if (i === 0 || v == null) return null;
    const prev = values[i - 1];
    return prev == null ? null : v - prev;
  });
}
