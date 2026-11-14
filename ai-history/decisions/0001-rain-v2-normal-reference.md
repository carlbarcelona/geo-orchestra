---
status: accepted
date: 2026-11-15
---

## Decision

The rainfall sound mapping moves from `rain-v1` to `rain-v2`:
- Pitch is **linear** on a fixed range **per selection type**: area means 0–0.8 mm/hr, single cells 0–1.5 mm/hr.
- Every month is heard against a **normal**, the 2001–2022 mean of the same calendar month. A hum plays the normal, a chord says wetter or drier, and a bell marks |z| ≥ 2.
- The frame sweep moves from `scan-v1` to `scan-v2`. There is one latitude → note table, 11 beats, 2 notes per beat, rain classes for loudness, and silence for dry beats.

## Context

The team lead asked that the sound "add an understanding value to those who listen to it, not just make a sound of the inferred data". `rain-v1` used a square-root curve over 0–1.5 mm/hr for everything:
- Philippine area means reached only notes 3–9 of 16, and the seasonal climatology reached 2–3, so the visual-feed melody was mostly one note.
- Nothing told the listener whether a month was unusual. The monsoon cycle repeated 25 times with no reference.

The frame sweep could play about 220 notes in 4.5 s, and it mapped latitude to pitch differently from the rain-band voice and the cursor.

Options weighed and the lead's choices:
- Baseline: **2001–2022** was chosen over the full 2000–2024 record. It matches the averaging years of NASA SVS 5478, so both workspaces share one "normal".
- Curve: **linear** was chosen over square root. "One step ≈ 0.05 mm/hr" can be explained to a listener.
- Narration: an **opt-in** toggle, not on by default.
- A per-type range (area vs cell) follows the code review of 14 Nov 2026, item 5.

## Consequences

- A cell and an area mean with the same value now sound at different pitches. The event inspector, the caption and the mapping guide state the range for each type.
- Calendar months with fewer than 5 valid baseline years have no normal. The synthetic demo and short imports therefore play the amount only.
- Categories and the bell are listening aids computed from the measurements. They must never be presented as new measurements, or attributed to causes such as ENSO, without a cited source.
- Any further change to these rules bumps `MAPPING.version` / `SCAN.version` and updates `docs/mapping-guide.md`.
