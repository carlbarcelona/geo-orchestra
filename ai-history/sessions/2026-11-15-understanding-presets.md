---
date: 2026-11-15
model: claude-opus-5-5
commits: 3e19260 + the docs commit after it, on branch sound/understanding-presets (pushed for review, not merged)
---

## Asked

The team lead asked for three changes:
1. The sound should "add an understanding value to those who listen to it, not just make a sound of the inferred data from the data of NASA".
2. The visual-frame conversion should be refined, because the frames had no inferable pattern for how they become musical input.
3. Add a **Preset** mode (the default for first-time and non-technical users) and an **Advanced** mode (the existing interface), with a switch at the top right on the same row as Numerical | Visual.

The lead's choices:
- the normal is the 2001–2022 mean
- narration is an opt-in toggle
- Preset starts with a one-click start card
- pitch is linear with a fixed range per selection type

## Done

- `rain-v2` (decision 0001): new `src/sound/context.ts` provides normals, z categories, rank and captions (`explainStep`). `mapping.ts` adds reference (hum), chord, extreme-bell and thunder or wind cue events. Variation density is now opt-in.
- The engine gains a context channel: hum, harmony pad, bell, thunder and wind. `silence()` releases them.
- `scan-v2`: one latitude → note table, 11 beats, at most 2 notes per beat, intensity classes from the new `src/sound/intensity.ts`, and Philippine-sector ticks. `cellEvent` serves the cursor. The +12 and −12 transpositions in the engine were removed. FrameScore is redrawn as the rule. `describeSweep` was added.
- Preset / Advanced:
  - `uiMode` lives in the store, persisted in localStorage with try/catch, and is saved as an optional field in project files.
  - The `ModeSwitch` sits in the SubBar.
  - New `src/ui/preset/PresetPanels.tsx` with the start panel, preset cards, guide and Now card.
  - DatasetPanel has a `simple` prop.
  - The Visual workspace has preset branches.
  - `src/sound/presets.ts` defines the listening presets.
- The graph shows the normal line with wetter and drier shading. The piano roll shows the hum line, ▲/▼ marks and a "Now hearing" caption. Event details show the normal, the anomaly, z and the rank.
- The audio legend gains comparison cases and a frame-rule section.
- Narration (`src/a11y/speech.ts`), opt-in.
- The playhead now starts at the first month after loading (code review bug #3).
- Checked with `npm run check` (74 tests, up from 40) and `npm run build`. A Claude in Chrome walkthrough on localhost covered both modes and both workspaces, with no console errors (see docs/verification.md).

## Tried and abandoned

- **A sweep-axis option (north → south)** was dropped at the planning stage. Pitch would then have meant longitude, which breaks the "same latitude = same note" rule that makes the frames learnable.
- **The category counts in the planning question (12/95/98/65/25) were wrong.** They came from z-scores rounded to two decimals in a quick Python check. The exact split is 12/93/100/65/25, which a test now asserts.
- **The planned four-commit split (sound / frame / ui / docs)** was dropped. The new modules depend on each other: the engine's layer type needs the store defaults, and `ProjectPanel` reads the mapping range. The early commits would not have compiled on their own, and the pre-commit hook would not have caught it, because it checks the working tree, not the staged tree. The code went in as one commit, and it was verified to build alone by stashing the docs first. The docs went in as a second commit.
- The first draft gave the hum a "reconstructed" derivation. That was wrong for the monthly normal, which is a mean of measurements, so it was removed.

## Still open

- **A listening session on real speakers** is still needed: hum level against the piano, chord balance, and the thunder and wind cues. Nobody has listened yet.
- The 1180 px and 720 px layouts with the new switch and preset panels were not checked in a browser.
- Code review items 1 (notes scheduled past a pause), 2 (sync readout) and 4 (image features on by default) are unchanged. The new hum and chords start at the step start, so they don't make item 1 worse.
- Narration was not heard. It depends on the browser's voices.
