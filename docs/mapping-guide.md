# Mapping guide (version `rain-v2`, frame sweep `scan-v3`, time cues `cue-v1`)

Sound is a **designed mapping** of satellite estimates. It is not a recording. The mapping is fixed across dates and regions, so the same sound always means the same thing.

The idea of `rain-v2`: every month is heard **against its normal**. Pitch answers "how much rain?", the hum answers "compared to what?", and the chord answers "wetter or drier?".

## Measurements → sound (`rain-v2`)

| Data | Musical sonification | Geophony | Visual |
| --- | --- | --- | --- |
| Precipitation rate (mm/hr, monthly mean) | Pitch on the chosen scale (default C pentatonic, C3–C6), **linear** on a fixed range, plus velocity | Drop density, rain-bed loudness and brightness | Graph height, map colour |
| **Normal** for the same calendar month (2001–2022 mean) | A soft sustained **hum** at the pitch of the normal. Melody above the hum = wetter, below = drier | The hum plays here too | Dashed "normal" line on the graph and the piano roll |
| How the month compares (z = anomaly ÷ SD of that calendar month) | A quiet **chord** under the melody: major = wetter, minor = drier, open fifth = near normal, fuller chords for much wetter or much drier | **Thunder** = much wetter, **dry wind** = much drier | Notes outlined blue ▲ (wetter) or orange ▼ (drier); wetter and drier areas shaded on the graph |
| Unusual month (\|z\| ≥ 2) | A two-note **bell** | Bell | ◆ "unusual" in the Event-markers lane |
| Change from the previous **valid** month (optional, off by default) | Note density: +1 note per 0.08 mm/hr, up to 4 per step | Extra agitation | |
| Longitude of 5 sampled cells (Puerto Princesa, Manila, Iloilo, Cebu, Davao) | Stereo pan, west → left (spatial-phrase preset) | — | Purple dots on map |
| Year boundary | Heard through the time-cue layer (below) | same | Marker lane "2001" |
| **Zero** rainfall (measured) | Lowest note plus a bright "zero" tick | Quietest rain | Real 0 in table |
| **Missing** | No note, a muted thud, red gap. The hum still plays the normal, labelled "from other years" | Rain fades to silence | "missing", never 0 |

### Ranges and steps

| Selection | Fixed range | One scale step (16 notes) |
| --- | --- | --- |
| Area mean (Philippines, Luzon, Visayas, Mindanao, seasonal climatology) | 0–0.8 mm/hr | ≈ 0.053 mm/hr (≈ 1.3 mm/day) |
| Single 0.1° cell, imported point, spatial samples | 0–1.5 mm/hr | 0.1 mm/hr (2.4 mm/day) |

- Values above the range are clipped and flagged `clipped`. The raw value is kept on the event.
- In `rain-v1` (square root on 0–1.5 for everything), Philippine area means reached only notes 3–9 of 16, and the seasonal climatology 2–3 notes. With `rain-v2` the record uses at least 10 distinct notes (asserted in `tests/context.test.ts`).

### The normal

- **Monthly history:** the mean of the same calendar month over **2001–2022**, the averaging years of NASA SVS 5478. Only valid values are used.
- A calendar month with fewer than **5** valid baseline years has **no normal**: no hum, no chord and no category. The caption says so. This applies to the synthetic demo (2022–2024) and to short imported files.
- Categories, by z: ≤ −1.5 much drier · ≤ −0.5 drier · < 0.5 near normal · < 1.5 wetter · ≥ 1.5 much wetter.
- For the Philippine area mean (295 months) this gives 12 much drier, 93 drier, 100 near normal, 65 wetter and 25 much wetter, with 14 unusual months (for example Apr 2022, z +2.9, and Aug 2024, z −2.1).
- **Seasonal climatology (visual feed):** the reference is the **yearly average** of the cycle. Categories use the ratio to it: < 0.7, < 0.9, ≤ 1.1, ≤ 1.3, above.
- The normal is a reference computed from the measurements. It is not a new measurement, and it is never used to fill a missing month.

### Rules that did not change

- **No change across gaps:** density is never computed across a missing month.
- **Timbre only:** instrument, scale, pitch range, volume and the listening presets change how events sound, never the measurements. Events are regenerated deterministically.
- **Area vs cell:** the event inspector states whether a note came from an area mean (cos-latitude weighted, valid cells inside a Natural Earth outline, with coverage) or from a single 0.1° cell.

### Captions

Every step has a plain-language caption ("Now hearing"), for example:

> December 2000 · 0.392 mm/hr · wetter than a normal December (+0.6 SD) · you hear melody above the hum, bright (major) chord

- The same text is used by screen-reader announcements on pause and step, and by the optional spoken narration (Accessibility → Speak summaries).
- During playback, narration speaks only unusual months and rain-band turns.

## Region of interest (`scan-v4`)

`scan-v4` keeps every `scan-v3` rule and turns the old ROI toggle and "Crop sweep" into one **ROI tool** (decision 0003).

- **Choosing the region.** The ROI button in the Visual feed header opens a bar with:
  - quick picks: Whole frame, West Pacific (detailed), Philippines, Maritime Continent
  - **Draw on map**: drag a box on the frame
  - four number fields (West, East, South, North in degrees; negative = W or S), so it also works from the keyboard
  - **Isolate**, **Clear**

  A region must be at least 3° × 3°.
- **Isolate** zooms the frame to the region: the NASA image is scaled and shifted so the region fills the stage, and the overlays (scan line, rain systems, explore cursor) follow. With Isolate off, the whole frame stays visible and the outside is dimmed. "West Pacific (detailed)" shows NASA's sharper pre-cropped frames.
- **Sounds from the region.** The sweep (S), the Frame score, the rain systems and the explore cursor read only the region. Its pitch table spans the region's own latitudes, and its beats (4 to 24) follow its width.
  - A region inside the West Pacific box (95–150°E, 10°S–30°N) is read from the **1° West Pacific grid**. Anywhere else, it is read from the **2.5° whole-frame grid**.
- **ROI voice (new).** During the timelapse, each day plays **one short plucked note** for the rain inside the region:

| Region property | Sound |
| --- | --- |
| cos-latitude-weighted mean of the decoded cells (mm/day) | **Pitch**: linear over a fixed **0–24 mm/day** (the NASA colorbar's range) on the current scale; higher = more rain |
| Rain class of that mean | **Loudness** (light / moderate / heavy / very heavy, as the sweep) |
| Mean below light rain (2 mm/day) | **Silence** |
| No decodable cell that day | Nothing plays. It is never treated as 0 |

  - It plays half a step after the measured melody, on the "Frame sweep & band" layer. It is listed in the briefing, the "What you hear" guide and the caption ("your region: 3.0 mm/day (image-derived) → plucked E3"), and it can be turned off in Sound studio → Image features.
  - The values are **image-derived** (decoded from NASA's colours), not measurements. The piano melody still plays the linked, reconstructed area mean of the region chosen under "Selection" (Philippines, Luzon, Visayas or Mindanao); the ROI never relabels it.

## Frame sweep (`scan-v3`): the whole frame, edge to edge

`scan-v3` keeps every rule of `scan-v2` below and changes **what is swept** (decision 0002):

- **The whole frame.** In the Visual feed's full view, the sweep reads the entire NASA SVS frame, 180°W → 180°E, from a whole-frame grid of 2.5° cells (144 × 72, `public/data/svs5478/frame-scan-global.bin`). It plays **24 beats** (15° of longitude each, about 10 s).
- **Pitch table = the frame's own latitudes.** In the whole-frame view, the latitude → note table spans **60°S–60°N** (where IMERG has data), south = lowest, so north is still higher. The ROI view keeps the 10°S–30°N table and its 11 beats, and a crop uses the crop's own latitudes. Within one view, a latitude is always the same note.
- **Rain systems.** A rain system is a connected patch (8-neighbour) of at least 3 cells at **heavy rain or more (≥ 8 mm/day**, where the colorbar turns green). Each one is a musical element of its own:

| Rain system property | Sound and picture |
| --- | --- |
| Where the line enters and leaves it | A **held pad** starts when the scan line reaches the system and stops when the line leaves it |
| Centre latitude (rain-weighted) | Pitch, from the same table as the beat notes |
| Peak rain class | Loudness |
| Zone: centre within 23.5° of the equator, or not | Timbre: **warm pad = tropical**, **darker horn = mid-latitude storm track** |
| Centre longitude | Stereo position |
| Its cells in the column under the line | The scan line **widens over exactly those latitudes**, in the zone's colour (teal tropical, violet mid-latitude), and the whole system lights up while the line is inside it. A label gives its number, zone, rain class and shape ("stretched southwest–northeast", from its long axis). |

- Systems are numbered west → east. Systems already passed keep a faint outline. The Frame score outlines them too.
- **Crop (optional).** Drag a box on the full frame. The sweep, the score, the rain systems and the explore cursor then read only that box, and its beats (4 to 24) follow its width. In `scan-v4` this is the ROI tool (above).
- **Limits:** a system that crosses the 180° edge of the frame is counted as two, one at each edge. A system is a listening and viewing aid computed from image-derived values; it is never a new measurement, and never named as a storm or cyclone.

### The `scan-v2` rules that still apply

A frame (a NASA SVS image, or a measured IMERG month in the Numerical map) is turned into music by one rule:

| Frame property | Sound |
| --- | --- |
| West → east | Time: the frame is played as **11 beats** (4.5 s for a frame, 3.5 s for a month, or inside one timelapse step) |
| Latitude | **Pitch** from one fixed table: each scale note is a 2.5° latitude band, from C3 = 10–7.5°S up to C6 = 27.5–30°N. C4 ≈ 2.5–5°N, and the Philippines is about D4–D5. |
| Rain in a band | **Loudness** in four classes: light ≥ 2, moderate ≥ 5, heavy ≥ 8, very heavy ≥ 14 mm/day (mm/hr × 24) |
| Dry beat (no band at light rain or more) | **Silence** (a rest) |
| West / east | Stereo left / right |
| Beats over the Philippine sector (116–127.5°E) | A soft tick |

- Each beat plays at most its **2 wettest latitude bands**, so a sweep has at most 22 notes; `scan-v1` could play about 220.
- The rhythm shows where it rains. A steady pitch line is the rain band (ITCZ), which sits higher in July than in January.
- **One table everywhere:** the sweep, the rain-band voice (a gliding string tone that follows the band's latitude in 115–130°E), the explore cursor and the Frame score's axis all use the same latitude → note table, so a latitude is always the same note.
- **Timbre tells you the question:** piano = "how much rain?" (the measurement melody); bells and the string glide = "where is the rain?".
- A two-note chime marks the days when the rain band turns around.
- **Sources:**
  - In the Visual feed, values are **image-derived**: decoded from NASA's colorbar (see verification.md).
  - In the Numerical map, values are **measured** IMERG cells, averaged to 0.5°.
- The Describe tab and the Frame score give the sweep in words, for example "Beats 1–2 are silent (dry). The tune sits mostly on D4 (5°N to 7.5°N)…".
- The sweep never changes the measurement melody. It is a separate layer ("Frame sweep & band") with its own volume.

## Listening presets (Preset mode)

Presets are bundles of the settings above. They never change data.

| Workspace | Preset | Settings |
| --- | --- | --- |
| Numerical | Compare with normal (default) | Musical, soft piano, hum + chord + cues |
| Numerical | Rain sounds | Geophony, hum + cues |
| Numerical | Simple melody | amount only |
| Visual feed | Follow the monsoon (default) | rain-band voice + Philippine amount vs the yearly average |
| Visual feed | Rain amount only | no band voice |
| Visual feed | Rain sounds | Geophony + band voice |

### Session briefing

Before the first playback (always in Preset, by default in Advanced) a spoken briefing explains each sound that is on, with the same examples as the Audio legend (`legendEvents`), the time-cue preview and, in the Visual feed, a south → north rain-band glide. The script is `briefingScript()` in `src/a11y/briefing.ts`. It plays no new mapping and changes no data, so `MAPPING.version` is unchanged.

## Time cues and checkpoints (`cue-v1`)

Time cues mark the **timeline**, not the data. They are short percussive sounds at the start of a period, so a listener can tell how far playback has gone.

- They sound the same in Musical and Geophony.
- They never change with the measurements: a missing month still gets its cue.
- They have their own mixer layer, "Time cues".

| | Numerical (one step = one month) | Visual feed (one step = one day of the seasonal cycle) |
| --- | --- | --- |
| **Preset mode** (fixed) | A woodblock knock every **January** | A woodblock knock on the **1st of every month** |
| Checkpoint (both modes) | The same knock, **louder and doubled** | same |
| Advanced: "Mark every" | Off, N months, N quarters (Jan/Apr/Jul/Oct) or N years | Off, N days, N weeks (every 7th day), N months or N quarters |
| Advanced: sounds | Woodblock knock, small bell, click, low drum or two-note chime, set separately for the period cue and the checkpoint cue | same |
| Advanced: accent | "Louder when a larger period starts", e.g. a January is louder when marking quarters | same |

- **Checkpoints** are steps the user marks: press **C**, or use the ⚑ Checkpoint button, at the current step. They work in both modes and in both workspaces.
  - A checkpoint replaces the ordinary cue on its step.
  - It shows as a flag in the piano roll, a dotted line in the graph and a chip above the caption. Click the chip to jump to it.
  - The caption starts with "Checkpoint “label” ·", and an ordinary cue step starts with "New year ·", "New month ·" and so on.
  - With *Speak summaries* on, narration reads the checkpoint label during playback.
- Counting for "every N" starts at the beginning of the timeline, so cues don't move when the playback range changes.
- Advanced mode warns when cues would come closer than 0.25 s at the current speed.
- The old `year` tick was played only in Musical mode. It is no longer sounded by the rain mapping; the year marker stays in the event list, and its sound now comes from this layer, in both modes. The rain mapping's events are unchanged, so `MAPPING.version` stays `rain-v2`.
- Checkpoints and Advanced cue settings are saved in project files (optional fields; older files still open).
