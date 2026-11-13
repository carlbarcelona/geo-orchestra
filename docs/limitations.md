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
| Braille charts on refreshable displays | Implemented with Unicode braille. **Not verified on hardware.** |

Other notes:
- Values are monthly mean **rates** (mm/hr). The app shows x24 for mm/day but does not convert to monthly accumulation.
- The area masks use cell centres inside the Natural Earth 10m polygons, so very small islands may have no cell.
- The SVS colorbar is in mm/day. The app's own maps use mm/hr on a fixed 0–1.5 range.
- Saved projects store settings only. An imported file must be imported again after opening a project.
- The legacy `gpm1.gesdisc` server is retired. `pipeline/fetch_imerg_subset.py` targets Earthdata Cloud OPeNDAP.
