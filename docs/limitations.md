# Known limitations and release status

| Item | Status |
| --- | --- |
| Historical archive Jun 2000 – Dec 2024 (295 months) | **Delivered and verified** |
| Musical + Geophony on the same measurements | Delivered |
| Rolling piano roll + event inspection | Delivered |
| Authentic NASA EIC visual (SVS 5478) with correct identification | Delivered |
| EIC synchronization with measurements | **Partial:** the linkage is a *reconstruction* from monthly IMERG, not the SVS daily data. It is labelled approximate. |
| 100 ms visual/audio sync target | Implemented and instrumented. **Not verified on a foreground display** (see verification.md). |
| Hybrid mode, staff notation, MIDI/WAV export, CSV import, region drawing | Not in this release |
| Image-feature sonification | Delivered as **image-derived** values decoded from NASA's colorbar (r = 0.97 against the reconstruction). Always labelled approximate and kept separate from measurements. |
| Sound against the normal (`rain-v2`) and the beat-based frame sweep (`scan-v2`) | Delivered and unit-tested. **Not yet judged by listeners** (balance of hum, chords and cues). |
| Preset / Advanced mode | Delivered. Preset is the first-run default. |
| Whole-frame sweep with rain systems and crop (`scan-v3`) | Delivered and unit-tested. **Not yet heard on speakers or checked in a browser.** |
| Braille charts on refreshable displays | Implemented with Unicode braille. **Not verified on hardware.** |

Other notes:
- Values are monthly mean **rates** (mm/hr). The app shows x24 for mm/day but does not convert to monthly accumulation.
- The area masks use cell centres inside the Natural Earth 10m polygons, so very small islands may have no cell.
- The SVS colorbar is in mm/day. The app's own maps use mm/hr on a fixed 0–1.5 range.
- Saved projects store settings only. An imported file must be imported again after opening a project.
- The legacy `gpm1.gesdisc` server is retired. `pipeline/fetch_imerg_subset.py` targets Earthdata Cloud OPeNDAP.
- "Normal" needs at least 5 valid years of a calendar month within 2001–2022. The synthetic demo and short imports have no normal, so they play the amount only (the caption says so).
- Wetter/drier categories and the "unusual" bell are listening aids computed from the measurements. They are not new measurements and are not attributed to any cause (for example ENSO).
- Narration depends on the browser's speech engine and voices.
- An isolated ROI is the web-sized NASA frame (1024 × 512) enlarged, so a small region looks soft or blocky. "West Pacific (detailed)" uses NASA's sharper pre-cropped frames.
- Outside the West Pacific box the ROI voice and sweep read 2.5° cells, so a small region there covers only a few cells. A region that crosses the 180° edge cannot be drawn.
- The briefing's word highlight follows the voice's word events. Some voices (several network voices in Chrome) send none; the highlight then follows an estimated reading speed and can drift from the voice by a word or two.
