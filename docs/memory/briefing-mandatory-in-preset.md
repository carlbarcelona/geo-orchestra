---
name: briefing-mandatory-in-preset
description: "The spoken session briefing is mandatory in Preset (both workspaces) and optional in Advanced; it must describe only the sounds that are on"
type: feedback
date: 2026-11-15
---

Before the music starts, a commentator-style briefing names each sound, plays it, and says what an increase means. A modal highlights each word as it is read and closes when the briefing ends. The lead asked for it on 2026-11-15: **mandatory in Preset for Numerical and Visual, with an option to turn it off in Advanced.**

**Why:** first-time listeners (students, judges) did not know what the hum, chord, bell or knock meant until they opened the legend. A briefing tied to playback means nobody hears the music without the key.

**How to apply:**
- Never add a Skip or an off switch to Preset; Pause and "Replay this part" are fine.
- A new sound or layer needs a segment in `briefingScript()` (`src/a11y/briefing.ts`) with an example, gated on the setting that turns the sound on, plus a test in `tests/briefing.test.ts`.
- Keep the closing honesty line (not recordings; reconstructed average in the Visual feed) and the "missing is never zero" line.
