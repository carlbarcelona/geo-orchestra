---
date: 2026-11-15
model: claude-opus-5-5
commits: be7a245 on sound/element-mute-mode-panel; reworked onto main as sound/element-mute-v2
---

## Asked

1. Let the user mute a single sound element in Musical or Geophony mode,
   for example from the audio legend.
2. Make the sound settings panel react visibly to the mode, so it is always
   clear whether Musical or Geophony is active.

## Done

- `SoundSettings.muted` (store) holds a mute flag per mixer element (melody,
  texture, markers, image), separate from the level, so unmuting restores the
  slider value. `mixLevels()` in `actions.ts` sends the engine the effective
  levels; `toggleMute()` flips one and announces it.
- `MODE_ELEMENTS` lists which elements sound in each mode (Musical: melody,
  markers, image; Geophony: texture, markers, image).
- New `ElementMutes` chips in the Sound panel, the Sound studio and the Audio
  legend dialog. `LayerLevels` shows only the current mode's layers, each
  with a mute button.
- Both sound panels get a mode colour (violet = Musical, teal = Geophony), a
  mode tag in the header and a `ModeBanner`. Musical-only controls
  (instrument, preset, scale, pitch range) are hidden in Geophony, which shows
  its own mapping summary (`GeophonyMapping`).
- No mapping change, so `MAPPING.version` is unchanged.

## Tried and abandoned

Nothing.

## Still open

- Not checked in a browser yet; only `npm run check` (typecheck + tests).
- `tests/mix.test.ts` now covers `mixLevels` and `MODE_ELEMENTS`.

## Rework onto main (later the same day)

The teammate's `sound/understanding-presets` landed first. It added a fifth mixer layer (`context`: the normal hum, chords and cues), a rewritten audio legend and Preset mode. While merging:
- `muted` gained `context`, and `MODE_ELEMENTS` lists "Normal & cues" in both modes. `mixLevels` now zeroes any muted key instead of naming four.
- The legend keeps the teammate's sections; "Elements in this mode" became section 4.
- Opening a project merges saved `layers` and `muted` with the defaults.
- Preset mode's sound panels (`PresetSoundPanel`, the visual Preset studio) got the mode colour and the mode tag. No new controls were added to Preset.
- Checked in Claude in Chrome (localhost): Geophony hides the instrument and lists four elements; muting Rain texture announces "Rain texture muted"; Musical brings Melody and the instrument back.
