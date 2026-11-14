---
date: 2026-11-15
model: claude-opus-5-5
commits: none (left uncommitted for review)
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
