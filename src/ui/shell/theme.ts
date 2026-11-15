import { useCallback, useEffect, useState } from 'react';

/**
 * Light / dark appearance. Purely visual: it only sets `data-theme` on <html> and is remembered per browser.
 * Dark is the default. index.html applies the stored choice before first paint so the page never flashes.
 */
export type Theme = 'dark' | 'light';
const KEY = 'geoorchestra:theme';

export function readTheme(): Theme {
  try { return globalThis.localStorage?.getItem(KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
}

function apply(t: Theme) {
  const r = document.documentElement;
  r.dataset.theme = t;
  r.style.colorScheme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#f3f3f1' : '#05080d');
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    apply(theme);
    try { globalThis.localStorage?.setItem(KEY, theme); } catch { /* not remembered */ }
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  return [theme, toggle];
}

export function useIsLight(): boolean {
  const [light, setLight] = useState(() => document.documentElement.dataset.theme === 'light');
  useEffect(() => {
    const r = document.documentElement;
    const sync = () => setLight(r.dataset.theme === 'light');
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(r, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return light;
}
