---
name: briefing-mandatory-in-preset
description: "Preset opens the spoken briefing automatically in both workspaces, but users can skip it; Escape still pauses"
type: feedback
date: 2026-11-17
---

Before the music starts, a commentator-style briefing names each sound, plays it, and says what an increase means. A modal highlights each word as it is read and closes when the briefing ends. Preset opens it automatically for Numerical and Visual, but **Skip briefing is available in both modes**, including while paused. Advanced also has an option to turn briefings off.

**Why:** automatic briefings introduce the sounds to first-time listeners. A shared Skip briefing control lets returning listeners continue promptly, while Escape keeps Preset's pause behavior. Fuller sentences, longer examples and processing pauses give listeners time to understand each sound without extending an uninterrupted pass beyond 45 seconds.

**How to apply:**
- Keep the right-aligned Skip briefing button in both modes. Escape pauses in Preset; it retains its existing Advanced behavior.
- Keep an uninterrupted pass within 45 seconds: short natural explanations, 850 ms briefing-only samples (reduced equally to fit an eight-second demonstration budget), and a one-second pause after each complete sound group. Never add that pause between individual samples. The deadline cancels speech and queued examples before completing once. User pauses and deliberate replays may extend the session; keep the voice rate unchanged and the full transcript readable. See [the accessibility notes](../accessibility.md) for the timing budgets and slow-voice limits.
- Skipping acknowledges only the current sound configuration in that workspace for this page session. A new configuration opens a new briefing; Preset has no permanent off switch.
- Continue pending playback once after a skip, but never start playback after skipping a manual replay.
- A new sound or layer needs a segment in `briefingScript()` (`src/a11y/briefing.ts`) with an example, gated on the setting that turns the sound on, plus a test in `tests/briefing.test.ts`.
- Keep the closing honesty line (not recordings; reconstructed average in the Visual feed) and the "missing is never zero" line.
