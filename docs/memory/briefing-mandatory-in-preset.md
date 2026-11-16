---
name: briefing-mandatory-in-preset
description: "Preset opens the spoken briefing automatically in both workspaces, but users can skip it; Escape still pauses"
type: feedback
date: 2026-11-17
---

Before the music starts, a commentator-style briefing names each sound, plays it, and says what an increase means. A modal highlights each word as it is read and closes when the briefing ends. Preset opens it automatically for Numerical and Visual, but **Skip briefing is available in both modes**, including while paused. Advanced also has an option to turn briefings off.

**Why:** the original 2026-11-15 requirement made the full briefing mandatory to introduce the sounds to first-time listeners. On 2026-11-17 the user asked to add Advanced's Skip briefing control to Preset and explicitly chose to keep Escape as pause. This replaces the earlier prohibition on skipping (decision `0004-preset-briefing-skip`).

**How to apply:**
- Keep the right-aligned Skip briefing button in both modes. Escape pauses in Preset; it retains its existing Advanced behavior.
- Skipping acknowledges only the current sound configuration in that workspace for this page session. A new configuration opens a new briefing; Preset has no permanent off switch.
- Continue pending playback once after a skip, but never start playback after skipping a manual replay.
- A new sound or layer needs a segment in `briefingScript()` (`src/a11y/briefing.ts`) with an example, gated on the setting that turns the sound on, plus a test in `tests/briefing.test.ts`.
- Keep the closing honesty line (not recordings; reconstructed average in the Visual feed) and the "missing is never zero" line.
