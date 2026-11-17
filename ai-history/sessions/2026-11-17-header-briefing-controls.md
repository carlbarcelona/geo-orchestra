---
date: 2026-11-17
model: GPT-6 (Codex)
commits: branch ui/header-briefing-controls
---

## Asked

Implement two browser annotations: add the repository link after Open in the header, and give Preset the same Skip briefing button as Advanced. The approved plan keeps Escape as pause in Preset, retains automatic briefings, and requires regression tests and browser checks.

## Done

- Added an accessible GitHub link with the existing toolbar style and external-link icon. Its URL is the supplied repository URL, its target is `_blank`, and its rel is `noopener noreferrer`. The mobile icon retains its accessible name and tooltip.
- Displayed the shared right-aligned Skip briefing control in both modes and removed the Preset guard in the action. The existing completion callback acknowledges only the current workspace/signature and continues pending playback once. Manual replay has no playback continuation.
- Updated the Preset helper text, screen-reader announcement, accessibility documentation and existing memory note. Decision 0004 records the replacement of the earlier no-skip requirement.
- Added nine regression cases. Before removing the Preset guard, eight of the new cases failed at the expected blocked-skip assertions; the Advanced case passed. After the change, `npm run check` passed all 147 tests across 11 suites, and `npm run build` succeeded. Vite emitted its chunk-size warning for the approximately 721 kB JavaScript bundle.
- In the integrated browser, checked Numerical and Visual feed Preset briefings; Escape paused, Tab reached Skip briefing, and skipping a paused briefing continued pending playback. Skipping a manually replayed Numerical briefing left playback stopped. Advanced still displayed Skip briefing and its opt-out, and Escape skipped its active manual replay.
- Checked dark and light themes, 1480 x 667 desktop and 390 x 844 mobile layouts. The toolbar and modal controls fit; the repository link attributes were verified and clicking it left the local app and loaded data intact. Saved screenshots outside the repository. Browser error logs were empty. Restored the normal viewport and dark Numerical Preset view, stopped playback, and left the local preview open.

## Tried and abandoned

- A read-only DOM evaluation of the repository link timed out once. Native accessibility inspection remained available; locator attribute reads verified the URL, target and rel without changing browser configuration.

## Still open

- The owner must gather this branch into main under the repository's deployment rules.
- No production deployment or external repository access/login validation was performed.
