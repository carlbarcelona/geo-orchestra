---
name: hooks-before-preset-return
description: "A component that renders differently in Preset and Advanced must call all its hooks before any early return, or the mode switch crashes the app"
type: feedback
date: 2026-11-15
---

Never write `if (preset) return <PresetThing />;` above `useState`/`useMemo`/`useStore` calls. Split the component into a small chooser plus one component per mode, so each one calls its hooks the same way every render.

**Why:** on 2026-11-15 the lead reported that switching Preset → Advanced froze the whole interface. `NasaDataPanel` (Visual feed) returned early in Preset before two `useState` calls. React threw "Rendered more hooks than during the previous render", and with no error boundary the whole app unmounted to an empty `#root`. It looked like a freeze. The Numerical tab was unaffected, so the bug only showed after opening the Visual feed.

**How to apply:** when adding a Preset variant of a panel, make it a separate component (see `NasaDataPanel` → `PresetNasaPanel` / `AdvancedNasaPanel`). `tests/mode-switch.test.ts` guards that chooser. `src/ui/shell/ErrorBoundary.tsx` now keeps the header and mode switch alive if a panel ever fails again.
