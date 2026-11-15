---
status: accepted
date: 2026-11-15
---

## Decision

"ROI" in the Visual feed now means a **region of interest the user chooses**: drawn on the map, typed as edges, or picked from a list. The region can be isolated (the frame zooms to it), and sounds are derived from it: the sweep, the Frame score, the explore cursor, and a new per-day **ROI voice** (`scan-v4`). The fixed West Pacific view survives as one quick pick, "West Pacific (detailed)".

## Context

The team lead asked on 15 Nov 2026 to refine the ROI option into "a cropping tool of where in the map you can crop and isolate, and then derive sounds from", and asked whether that was what the ROI tool was.

It was not. "ROI" was an on/off switch to NASA's pre-cropped West Pacific frames (95–150°E, 10°S–30°N). A separate "Crop sweep" button (scan-v3) let the user drag a box, but that box only changed the sweep: the frame was not isolated, and nothing played from it during the timelapse.

Options weighed:
- Keep both buttons and add zoom to Crop sweep. Rejected: two overlapping region concepts on one header, and "ROI" would still not mean the user's region.
- Make the ROI also replace the piano's measurement region. Rejected: the reconstructed climatology exists only for the Philippines, Luzon, Visayas and Mindanao. Any other box would need values that do not exist, and calling image-derived values "measurements" would break the honesty rules.
- One ROI tool, with image-derived sounds from the region and the piano left on the linked region. **Chosen.**

## Consequences

- The ROI voice is image-derived (decoded NASA colours, 1° inside the West Pacific box, 2.5° elsewhere). Its caption and explanations say so, and it must never be presented as a measurement.
- Unknown cells are left out of the ROI mean. A day with no decodable cell plays nothing; it is never treated as 0.
- Project files gain optional `visual.crop` and `visual.isolate`. Older files still open.
- The briefing and the Preset "What you hear" guide describe the ROI voice whenever it is on.
- Any change to these rules bumps `SCAN.version` and updates `docs/mapping-guide.md`.
