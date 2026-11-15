---
name: screencast-slows-web-audio
description: "Recording the app with Chrome's screencast slows its Web Audio clock to ~0.42× real time, so app audio and video must be captured in separate passes"
type: reference
date: 2026-11-16
---

On the team's Ryzen 5 laptop, with the real app playing, Chrome DevTools screencast frames (`Page.startScreencast`, any quality, headless or headed) slow the `AudioContext` clock to about 0.42× real time. Without the screencast it holds about 0.98×. A screenshot loop is slower still, and MediaRecorder never starts in headless Chrome.

**Why:** a naïve capture records about half the audio, and the scan line and the playhead desynchronise from the sound.

**How to apply:** use `demo-video/capture/capture.mjs`. It makes two passes on one schedule kept on the app's audio clock (an audio pass and a video pass), taps the sound with an AudioWorklet rather than a ScriptProcessor, which drops buffers when the main thread is busy, and drives `performance.now`, rAF and `setTimeout` from the audio clock during the video pass.
