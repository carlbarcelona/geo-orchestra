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

## Automated checks (`npm test`, 86 passing on 15 Nov 2026)
- Missing vs zero
- No change computed across gaps
- cos-latitude aggregation, coverage threshold and mask
- Fixed normalization, clipping and determinism
- Geophony monotonicity and longitude pan
- SVS alignment: 366 days, Feb 29, coverage of all 1000 frames, fixed-rate drift
- Import validation, with absent months shown as missing
- `rain-v2` (tests/context.test.ts):
  - normals use only valid 2001–2022 values; fewer than 5 years gives no normal
  - category thresholds, ranks, missing months keep the hum but get no category
  - the hum is the pitch mapping of the normal; the melody sits above it when wetter and below when drier
  - wetter → major chord, drier → minor, |z| ≥ 2 → bell, much wetter → thunder; layers can be switched off
  - captions for compared, missing, zero, no-normal and seasonal steps
  - on the shipped Philippine record: every month has a category, the split is 12 / 93 / 100 / 65 / 25, 14 unusual months, at least 10 distinct melody notes
- `scan-v2` (tests/framescan.test.ts): the 16-band latitude table, rain classes, 11 beats with at most 2 notes each, dry beats are rests, Philippine-sector ticks, and the same note for the same latitude in the sweep, the band voice and the cursor
- Time cues `cue-v1` (tests/timecues.test.ts):
  - Preset cues fall on every January (monthly) and on every month's 1st across the 366-day SVS cycle, including Mar 01 after Feb 29.
  - Quarters, weeks, every step and every N.
  - The accent for larger periods.
  - A checkpoint replaces the ordinary cue and is accented.
  - Unknown keys are ignored; output is deterministic and independent of the data.
  - Captions start with "Checkpoint …" or "New year …".
  - Preset mode always uses the fixed cue.
  - Toggling a checkpoint never changes data, selection or range.
  - Project files with and without checkpoints parse, and an unknown cue sound is rejected.
- Preset / Advanced (tests/presets.test.ts): first visit is Preset; switching mode and applying listening presets never change data, selection or range; edits make a preset "custom"; project files with and without `uiMode` parse; legend examples land in their stated categories
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

## Image-derived frame values (`public/data/svs5478/frame-features.json`)

- **Colorbar calibration:** the tick marks at x = 155 … 791 px mark 2 … 22 mm/day, and a linear fit gives 0.031446 mm/day per px. Decoding the colorbar's own ticks returns them within 0.3 mm/day (asserted).
- **Decoding:** taken from the lossless 2048×1024 source frames. Each pixel is matched to the nearest colorbar color. 1.18% of pixels are too far from any colorbar color (coastlines, labels) and are treated as unknown.
- **Cross-validation:** the decoded Philippine land mean was compared with the IMERG-based reconstruction (×24) over 366 days. The result is Pearson **r = 0.97**, mean bias **−0.30 mm/day** (6.98 vs 7.28 mm/day). The two sources are independent: NASA's daily product rendered as images, and our monthly-derived reconstruction. Their agreement supports both.
- **Phenomenon check:** the decoded rain-band latitude in the Philippine sector is 1.5°N on Jan 15 and 13.1°N on Jul 15, which matches the monsoon / ITCZ migration.
- **Automated:** `tests/framescan.test.ts` (18 tests) covers:
  - braille encoding
  - sweep order, pitch and loudness
  - unknown cells staying silent
  - west/east panning
  - the decode-validation thresholds
  - monsoon direction
  - turning-point markers
  - description wording
- **Browser:**
  - frame sweep: gold line over the NASA frame plus the score playhead
  - keyboard exploration announced "12.5°N, 124.5°E: 15.6 mm/day, very heavy (image-derived)"
  - braille charts render
  - timelapse with a sweep on every frame, at 1 day/s
  - no console errors

## rain-v2, scan-v2 and Preset mode (15 Nov 2026, Claude in Chrome, localhost)

- Fresh load shows Preset. **Start listening** loaded 295 months, selected the Philippines and played from Jun 2000. The caption read, for example, "Dec 2000 · 0.392 mm/hr · wetter than a normal December (+0.6 SD) · you hear melody above the hum, bright (major) chord".
- The graph shows the dashed 2001–2022 normal with wetter and drier shading; the piano roll shows the hum line and ▲/▼ marks.
- Switching to Advanced during playback restored every control and did not stop playback; switching back hid them.
- Visual feed in Preset: one button imported the frames, connected the reconstructed climatology and played. **S** drew the Frame score with 11 numbered beats, notes on the note/latitude axis and the Philippine beats shaded.
- No console errors.
- **Not verified:** how it sounds on speakers (hum level, chord balance, thunder and wind cues), narration voices, and the 1180 px / 720 px layouts. These need a listening session on the demo laptop.

## Time cues and checkpoints (15 Nov 2026, Claude in Chrome, localhost)

- Preset Numerical: Start listening, then pause and step.
  - Pressing C at Jan 2001 added a checkpoint. It showed as a chip, a flag in the piano roll and a dotted line on the graph, and the caption read "Checkpoint “Jan 2001” · Jan 2001 · 0.225 mm/hr · close to a normal January…".
  - At Jan 2002 the caption read "New year · Jan 2002 · …".
- Advanced: set "Mark every" to quarter with a drum. At Apr 2001 the caption read "New quarter · Apr 2001 · …". Switching back to Preset removed the quarter cue (year-only again) without stopping anything.
- Preset Visual feed: one click opened and played. Jan 01 and Feb 01 start with "New month", and Jan 02 has no cue.
- No application errors once real key events are used. A synthetic key event sent to `window` crashed the shortcut handler; it now treats such events as page-level keys.
- **Not verified:** how the cues sound on speakers (knock loudness against the hum and the rain), and the save → open round trip in the browser. The schema is unit-tested.
