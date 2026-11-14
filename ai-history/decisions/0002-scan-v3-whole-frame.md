---
status: accepted
date: 2026-11-15
---

## Decision

The frame sweep moves from `scan-v2` to `scan-v3`:

- In the Visual feed's full view, the sweep reads the **whole NASA SVS frame** (180°W → 180°E) in 24 beats, from a new 2.5° whole-frame grid. The Philippine / West Pacific sweep remains in the ROI view.
- The latitude → note table spans the latitudes of the view being swept: 60°S–60°N for the whole frame, 10°S–30°N for the ROI, the crop's own range for a crop.
- **Rain systems** (connected heavy-rain patches) each get a held voice for as long as the scan line is inside them, and the line widens over them on screen.
- Users can **crop** the frame so the sweep reads only that box.

## Context

The team lead studied four NASA image sonifications (the Mice Galaxies, Arp 140, Pismis 24 and NGC 1300). In those, a line scans the entire image, and the line lights up and widens over the objects it crosses. The lead asked for the same: scan the whole frame, not only the Philippine portion, with a scan line designed for this use, and a crop as an extra. The lead left the design to the implementer.

- The lead believed the references give each detected object its own musical element. The project could not confirm this from the videos: the pages can't be watched or read by the tools available, and only their titles were retrieved. The design here does it anyway, because it makes objects audible.
- The previous single table (10°S–30°N) cannot cover the whole frame. Keeping it would put everything outside 10°S–30°N on its top or bottom note, which hides the storm tracks.

## Consequences

- "Same latitude = same note" now holds **within a view**, not across views. The legend, the score axis and the guide state the table for each view.
- `public/data/svs5478/frame-scan-global.bin` (3.8 MB) is loaded with the frame data.
- Rain systems are aids computed from image-derived values. They must not be presented as measurements or named as storms or cyclones without a source.
- Any further change bumps `SCAN.version` and updates `docs/mapping-guide.md`.
