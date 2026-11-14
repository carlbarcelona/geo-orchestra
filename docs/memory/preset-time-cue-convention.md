---
name: preset-time-cue-convention
description: "Preset mode's time cue is fixed: one woodblock knock per year (Numerical) or month (Visual feed); a checkpoint is the same knock doubled"
type: feedback
date: 2026-11-15
---

In Preset mode the time cue is one uniform sound, a woodblock knock, and it is identical in Musical and Geophony.
- Numerical marks every January. The Visual feed marks the 1st of every month.
- A user checkpoint is the same knock, louder and doubled.
- Only Advanced mode can change the period, the sounds or the accents.

**Why:** the team lead wants first-time listeners to learn one cue and keep it. Distinguishing a checkpoint by accent rather than by a different sound keeps Preset uniform while still telling "a year passed" apart from "your checkpoint". Cueing every step at the default speeds (1 month/s, 10 days/s) would sound like a metronome.

**How to apply:** don't add Preset-mode cue options or give checkpoints a different sound in Preset. New cue sounds or units belong in Advanced (`TimeCueControls`). `PRESET_TIME_CUES` in `src/sound/timeCues.ts` is the single source of the Preset behaviour.
