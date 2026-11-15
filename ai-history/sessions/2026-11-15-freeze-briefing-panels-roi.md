---
date: 2026-11-15
model: claude-opus-5-5
commits: fix/mode-switch-freeze, ui/resizable-panels, ui/session-briefing, sound/roi-crop (each merged into main with --no-ff and pushed)
---

## Asked

The team lead asked for four things:
1. Switching from Preset to Advanced freezes the whole interface. Find the bottleneck or cause and fix it.
2. A commentator-style briefing at the start of a music session. For each variable it says "this is the sound", plays it, and says what an increase means. A pop-up highlights every word as it is read and disappears once the briefing has been read. It is mandatory in Preset (Numerical and Visual) and can be turned off in Advanced.
3. Make each window adjustable: for example, drag the music chart's top up and down, and the same for the other panels. All selections must stay readable.
4. Refine the ROI option into a cropping tool: crop and isolate part of the map and derive sounds from it. If that is not what ROI was, explain.

The design was left to the implementer.

## Done

- **Freeze (`fix/mode-switch-freeze`):**
  - Reproduced in Chrome: in the Visual feed, Preset → Advanced emptied `#root`. `NasaDataPanel` returned the Preset panel *before* its `useState` calls, so React threw "Rendered more hooks than during the previous render", and with no error boundary the whole app unmounted. The Numerical tab never hit it.
  - Split the component, and added an `ErrorBoundary` around the workspace.
  - Also: the seasonal events were rebuilt on every switch and render (366 whole-frame grids when "sweep every frame" is on); they are now cached. Event caches moved out of the store so render never writes state (`eventsRev`).
- **Panels (`ui/resizable-panels`):**
  - Splitters in the grid gaps (absolutely positioned grid items) set `--cols`/`--rows`, with no React render while dragging.
  - Keyboard support, clamped minimums, sizes remembered per browser, Reset layout.
  - Readability: option colours, wrapping panel heads, and narrow panels stack label over control (container query).
- **Briefing (`ui/session-briefing`):**
  - `src/a11y/briefing.ts` builds the script from the live settings. `briefingPlayer.ts` reads it with the browser voice, uses word boundaries for highlighting with a timer fallback, and plays the Audio legend examples.
  - `BriefingModal` shows the text. `togglePlay` routes through the briefing when one is due.
  - Preset: no skip. Advanced: Skip, and an off switch (also in Accessibility).
- **ROI (`sound/roi-crop`, scan-v4):**
  - One ROI tool: quick picks, draw on map, typed edges, Isolate (zoom), Clear.
  - The sweep, score and explore follow the region, using the 1° grid inside the West Pacific and 2.5° elsewhere.
  - New per-day ROI voice; caption, briefing and guide entries; project file fields; decision 0003.
- `npm run check`: 138 tests (40 new). `npm run build` passes. Clicked through in Chrome (docs/verification.md).

## Tried and abandoned

- **Placing the splitters as normal grid items.** Auto-placed panels would flow around their cells. Absolutely positioned grid children don't take cells. They need both grid lines, though: `grid-row: 1` alone made the right splitter run the full height, because a missing end line means the container edge.
- **The isolated ROI first rendered black.** The global `.frame-wrap img { max-height: 100% }` squashed the enlarged image. The zoomed image now sets `maxHeight: 'none'`.
- **Writing multi-line edits through bash heredocs** failed on quoting in this Windows shell; edit scripts were written to the scratchpad instead. Tooling only.

## Still open

- Nobody has listened on speakers to the ROI voice against the piano and the band glide, or to the briefing's voice level against the examples.
- Word-boundary support varies by voice. The Chrome voice used in testing advanced the highlight, but the timer fallback has not been checked on Safari or Firefox.
- An isolated small ROI is an enlarged web frame and looks soft. A region crossing 180° cannot be drawn.
- The briefing has not been tried with a screen reader running; the voice and the reader may talk over each other.
