---
date: 2026-11-16
model: claude-opus-5-5
commits: branch demo/video-and-deck, merged into main by jeflecias
---

## Asked

For the NASA Space Apps "Project Demonstration" submission:
- a demo video of 3–5 features, 30 s or less, with overlays and highlights, grounded in the project, putting the sound first (Remotion or Hyperframes);
- then a slide deck of 7 slides or fewer.

Both should avoid a generic "AI" look.

## Done

- **`demo-video/` (Remotion):** 4 features in 29.97 s, made from real app footage and real app audio.
  1. The musical record against the 2001–2022 normal.
  2. Geophony.
  3. Muting a layer.
  4. The whole-frame NASA sweep with rain systems.

  There are lower-thirds in the app's own look (Barlow Condensed, mono kickers, amber), viewfinder highlights, and a "live app audio" oscilloscope drawn from the real soundtrack. Honesty labels are on screen. Loudness is about −17 LUFS. Output: `demo-video/out/geoorchestra-demo.mp4` (not committed).
- **Capture method** (`capture/capture.mjs`): two passes on the app's audio clock, an AudioWorklet tap, and audio-clock timers in the video pass. Memory note `screencast-slows-web-audio`.
- **Deck:** 7 slides in a Claude Slides artifact (private; exports to .pptx or PDF), built from screenshots of the capture. Numbers checked against `docs/verification.md`: 295/295 months, 5/5 spot checks, r = 0.97, bias −0.30, 366 days with Feb 29, 138 tests. The layout was previewed and every slide fits.
- `.vercelignore` now excludes `demo-video/`.

## Tried and abandoned

- **Watching the four reference videos** was not possible (titles only; see memory note `youtube-pages-give-titles-only`).
- **MediaRecorder in headless Chrome:** never starts.
- **A ScriptProcessor tap:** lost half its buffers.
- **A single-pass capture:** the audio clock ran at 0.42× under the screencast.
- **Real output at −60 dB, lower JPEG quality, a screenshot loop:** none of them kept real time.
- **A ROI "isolate" shot:** the enlarged frame looked washed-out, so it was left out.

## Still open

- Nobody has listened to the final cut on speakers.
- The video must be uploaded somewhere public (YouTube or Drive) by a team member; the repo is private.
- The deck has placeholders: `[video link]`, `[team name and members]`.
