---
date: 2026-11-15
model: claude-opus-5-5
commits: branch sound/full-frame-sweep, merged into main with a merge commit
---

## Asked

The team lead pointed at four NASA image sonifications (the Mice Galaxies, Arp 140, Pismis 24 and NGC 1300) and asked for:
- a sweep of the **entire frame** end to end, left to right, instead of the Philippine portion;
- a scan line designed for this use, which lights up and widens over the objects it crosses;
- optionally, a crop so the sweep reads only part of the map.

The design was left to the implementer. The lead also asked to first pull the teammate's `sound/understanding-presets` branch.

## Done

- Merged `sound/understanding-presets` into `main` (merge commit) and built on top of it.
- **Pipeline:** `pipeline/analyze_svs_frames.py` now also writes `frame-scan-global.bin`, the whole 2048×1024 frame as 144 × 72 cells of 2.5°, and adds `globalGrid` to `frame-features.json`. The West Pacific outputs are unchanged. The run takes about 5 minutes.
- **Sound, `scan-v3`:** `src/sound/frameScan.ts` adds:
  - `frameGridGlobal`, the whole-frame grid: 24 beats and a 60°S–60°N pitch table;
  - `cropGrid`;
  - `detectSystems`: 8-connected heavy-rain patches of at least 3 cells, with extents, shape and zone;
  - `systemEvents`: one held note per system for as long as the line is inside it.

  The engine plays these on two pads per voice slot: a warm AM pad for tropical systems and a darker FM pad for mid-latitude ones.
- **UI:**
  - `src/ui/visual/ScanOverlay.tsx` draws the scan line. It widens (white core, zone-coloured rim) over the system's latitudes in the current column, lights the whole system, and shows a label with number, zone, rain class and shape.
  - "Crop sweep" (drag a box) and "Full frame" sit in the Visual feed header.
  - The Frame score, the legend, the guide and the spoken description follow the swept view.
- **Docs:** decision 0002, a `scan-v3` section in the mapping guide, and updates to verification and limitations. 12 new tests (`tests/fullframe.test.ts`), 86 in total.
- **Browser (Claude in Chrome, localhost:5181):**
  - The whole-frame sweep runs, and the line widens over systems with labels.
  - Crop to 69.6–156.1°E, 7.7°S–44.4°N gives 18 beats and the score follows.
  - No console errors.

## Tried and abandoned

- **Watching the reference videos.** That isn't possible with the tools available. A web fetch of the YouTube pages returned only the titles. The design draws on the general approach of NASA's image sonifications (a line scanning the image, vertical position as pitch, brightness as loudness) and on what the lead described.
- **A teal highlight for active systems.** It blended into NASA's teal colour ramp. It was replaced with a white fill and a zone-coloured rim and glow.

## Still open

- Nobody has listened on speakers yet: system pads against the beat bells and the piano.
- Systems that cross the 180° edge count as two, one at each edge.
- The tropical rain band can be one system spanning half the map, which gives one very long held note.
- Crop has no keyboard alternative yet. Dragging needs a pointer.
- `sweepEveryFrame` during timelapse now sweeps the whole frame (24 beats) at 1 day/s. That may be too dense; it hasn't been listened to.
