# Verification record (14 Nov 2026)

## IMERG monthly package
- **Source:** CMR lists 295 granules `GPM_3IMERGM` V07B for 2000-06 to 2024-12. All 295 were retrieved through Earthdata Cloud OPeNDAP (`opendap.earthdata.nasa.gov`, collection C2723754851-GES_DISC). The legacy `gpm1.gesdisc` server timed out.
- **Subset:** lon index 2960–3074 (116.05–127.45°E) and lat index 945–1114 (4.55–21.45°N), 115 × 170 cells. The variables are precipitation, randomError and precipitationQualityIndex.
- **Results (`public/data/imerg-ph/validation.json`):**
  - 295/295 months present, no duplicates, in order
  - unit mm/hr, fill value -9999.9 treated as missing
  - 0 missing cells in this region; value range 0–3.578 mm/hr
- **Independent spot checks:** 5/5 match. Each processed value was compared with a separate single-cell OPeNDAP request:
  - 2000-06 at 13.15°N 122.05°E
  - 2010-07 at 14.55°N 121.05°E
  - 2013-11 at 11.25°N 124.95°E
  - 2024-12 at 7.05°N 125.55°E
  - 2024-01 at 4.55°N 116.05°E
- **Area masks** (Natural Earth 10m), by cell count:
  - Philippines: 2441
  - Luzon: 1177
  - Visayas: 452
  - Mindanao: 811

## SVS 5478 frame-to-date alignment (`public/data/svs5478/alignment.json`)
- There are 1000 source frames. Consecutive date overlays were compared pixel by pixel. Frames from the same day differ by at most 54 pixels (encoder noise), and a new day changes about 6,355 or more.
- The result is **366 day runs, not 365.** The overlays contain **February 29** (frames 162–164), but the published `IMERGclim_dates2.txt` (501 lines) does not. Using that text file as a frame index would shift every date from March on by one day.
- Manual spot checks: frame 3 = January 02, frame 162 = February 29, frame 165 = March 01, frame 1000 = December 31.
- A unit test confirms that a fixed-rate mapping from frame number to day would drift.

## Climatology linkage
- **Status: reconstructed (approximate).** The steps were:
  1. Take the IMERG V07B monthly area means for 2001–2022 (22 years per calendar month).
  2. Place each month's mean at mid-month.
  3. Interpolate periodically across 366 days.
  4. Apply a trailing 30-day mean.
- This is not the SVS daily product, and the app never labels it as exact.

## Automated checks (`npm test`, 22 passing)
- Missing vs zero
- No change computed across gaps
- cos-latitude aggregation, coverage threshold and mask
- Fixed normalization, clipping and determinism
- Geophony monotonicity and longitude pan
- SVS alignment: 366 days, Feb 29, coverage of all 1000 frames, fixed-rate drift
- Import validation, with absent months shown as missing
- Controller behavior:
  - seek cancels stale ticks and draws
  - no doubled schedules after repeated play/pause
  - buffering on an unready frame
  - loop wrap

## Browser checks (Claude in Chrome, localhost)
Exercised in the browser:
- empty states (mockup Pictures 2 and 4)
- NASA sample load
- Table, Map and Graph synchronization
- Musical playback
- switching to Geophony during playback
- synthetic demo gap rendering
- visual feed import, then connect, play and ROI

The console showed no application errors.

**Timing:**
- UI state updates are timer-driven from the audio clock. In the test browser they fired within about 12 ms of the scheduled time.
- The paint-time lag shown in the status bar (`sync mean/max ms`) **could not be verified** against the 100 ms target. The automated browser window was throttled to about 3 animation frames per second. Verify on the declared demonstration device in a foreground window.
