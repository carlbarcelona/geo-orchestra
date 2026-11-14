/**
 * Rain intensity classes shared by the frame sweep, the explore cursor, the rain-band voice and the
 * spoken/braille descriptions. Discrete classes are easier to hear than a continuous loudness.
 * Thresholds are in mm/day (the SVS colorbar unit); mm/hr values are converted ×24.
 */
export type IntensityClass = 'dry' | 'light' | 'moderate' | 'heavy' | 'very heavy';

export const INTENSITY = {
  thresholds: [2, 5, 8, 14] as const, // mm/day: light ≥ 2, moderate ≥ 5, heavy ≥ 8, very heavy ≥ 14
  velocity: { dry: 0, light: 0.25, moderate: 0.45, heavy: 0.65, 'very heavy': 0.85 } as Record<IntensityClass, number>,
};

export function toMmDay(v: number, unit: 'mm/day' | 'mm/hr'): number { return unit === 'mm/hr' ? v * 24 : v; }

export function intensityClass(mmDay: number): IntensityClass {
  const [l, m, h, vh] = INTENSITY.thresholds;
  return mmDay < l ? 'dry' : mmDay < m ? 'light' : mmDay < h ? 'moderate' : mmDay < vh ? 'heavy' : 'very heavy';
}

/** Kept for existing callers: the same classes as words. */
export const intensityWord = intensityClass;
