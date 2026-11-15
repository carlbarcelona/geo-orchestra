---
date: 2026-11-15
model: claude-opus-5-5, gemini-4-hydrogen
commits: uncommitted (branch ui/enhancement)
---

## Asked

Improve the UI/UX based on the attached aerospace/telemetry reference images:
- Add light mode and dark mode, with dark mode as the default.
- Make Preset mode more user-friendly while keeping Advanced mode dense and technical.
- Give the UI an aerospace mission-control aesthetic without explicitly labelling it as NASA-inspired.
- Make the layout responsive across all device dimensions (desktop, laptop, tablet, phone, small phone, touch).
- Edit only UI code, leaving all data, playback, and sound logic untouched.

## Done

- **Theme system (`index.html`, `src/ui/shell/theme.ts`, `src/styles.css`, `src/ui/shell/Shell.tsx`, `src/ui/icons.tsx`):**
  - Added `data-theme="dark" | "light"` (defaulting to `dark`, persisted in `localStorage` under `geoorchestra:theme`, applied before first paint in `index.html`).
  - Added `Sun` / `Moon` icons and `ThemeToggle` in the header, plus a live `UtcClock` telemetry readout and status indicator dot.
  - Updated `Logo` to a line-drawn globe with orbit and sound wave using `currentColor`.
  - Kept data display surfaces (`.map-wrap`, `.frame-wrap`, `.chart-area`, `svg.graph` and its `.graph-key` / `.map-readout`) in dark screen tokens in light mode so canvas/SVG colors remain legible.
  - Removed inline `#fbbf24` on the `Checkpoints` tag in `src/ui/shared/MusicChart.tsx` so it follows `--amber` in both themes.
- **Aerospace mission-control styling (`src/styles.css`):**
  - Introduced `Barlow`, `Barlow Condensed`, and `JetBrains Mono` typography, hairline borders, 2px radius, subtle background grid, numbered panel headers (`01`, `02`, ...), and viewfinder corner ticks.
- **Preset vs. Advanced (`src/ui/preset/PresetPanels.tsx`, `src/ui/visual/VisualWorkspace.tsx`, `src/styles.css`):**
  - Restructured `StartPanel` into a numbered 3-step guided path (Load record -> Choose a place with region hint tiles -> Press play) with summary stat cards.
  - Reordered `PresetSoundPanel` to lead with the "Now" plain-language card and large value readout, followed by listening presets, volume, and legend.
  - Kept Advanced mode dense with uppercase monospace field labels.
- **Responsive layout (`src/styles.css`):**
  - Added breakpoints for laptops (`<=1380px`, `<=1280px`), tablets (`<=1180px` with sticky header/subbar/statusbar and 2-column grid), phones (`<=720px` single column, bottom-sheet dialogs), small phones (`<=420px`), large monitors (`>=1800px`), and coarse pointers (`pointer: coarse`).
- **Verification:**
  - `npm.cmd run check`: `tsc -p tsconfig.json` and all 11 Vitest suites (138 tests) passed.
  - `npm.cmd run build`: `vite build` succeeded.

## Tried and abandoned

- `git checkout -- package-lock.json` inside the sandbox failed with `.git/index.lock: Permission denied`; left `package-lock.json` as updated by `npm install` (no dependency changes in `package.json`).

## Still open

- Visual click-through in a live browser (`npm run dev`) across light/dark modes and mobile/tablet viewports.
- Commit and push branch `ui/enhancement` outside the sandbox.
