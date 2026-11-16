---
status: accepted
date: 2026-11-17
---

## Decision

Preset briefings remain automatic, but users can skip them with the same right-aligned Skip briefing button as Advanced. Escape continues to pause in Preset.

## Context

The user annotated the local preview and asked for Advanced's skip button in the Preset modal. During planning, the user chose to keep Escape's existing pause behavior. This replaces the earlier no-skip requirement recorded in the briefing memory note; no numbered decision previously covered it.

## Consequences

- Both Numerical and Visual feed allow skipping active or paused briefings.
- A skip uses the existing completion path: acknowledge the current briefing signature and continue pending playback once.
- A manual replay closes without starting playback. New sound configurations still require a new briefing, and Preset has no permanent off switch.
- The briefing script, sound mapping, and Advanced's opt-out remain unchanged.
