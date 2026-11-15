# Demo video (NASA Space Apps, 30 s)

**Watch it:** [`geoorchestra-demo.mp4`](geoorchestra-demo.mp4), the 29.97 s cut (a review copy, re-encoded to stay
under the repo's 15 MB file limit). Upload the full-quality render (`out/geoorchestra-demo.mp4`, made by the steps
below) for the Space Apps submission.

Real app footage and real app audio, edited in Remotion. Nothing is re-created: every frame and sound comes
from the production build.

```bash
cd demo-video && npm install
npx vite preview --port 4317 --strictPort      # from the repo root, after `npm run build`
node capture/capture.mjs audio                  # pass 1: app audio, real time (no screen capture)
node capture/capture.mjs video                  # pass 2: screencast frames (a Chromium window opens)
node capture/build.mjs                          # → public/clips/app.mp4, src/timeline.json
ffmpeg -i public/clips/app.mp4 -vn -ac 1 -ar 22050 public/clips/app.wav   # for the on-screen scope
node capture/boxes.mjs                          # → src/boxes.json (UI positions for highlights)
npx remotion render src/index.ts Demo out/raw.mp4 --codec=h264 --crf=16 --timeout=180000 --concurrency=4
ffmpeg -i out/raw.mp4 -t 29.9 -af "loudnorm=I=-14:TP=-1.5:LRA=11,afade=t=out:st=29.3:d=0.6" -c:v copy -c:a aac -b:a 320k out/geoorchestra-demo.mp4
```

Why two passes: on the capture laptop, Chrome's screencast starves the audio thread and the Web Audio clock
runs at ~0.42× real time. Both passes schedule every action on the app's audio clock, and the video pass
drives `performance.now`, `requestAnimationFrame` and `setTimeout` from that clock, so picture and sound share
one time axis. See `capture/capture.mjs`.

The final file must stay ≤ 30 s (Space Apps rule). Remotion is free for individuals and teams of up to 3;
check its licence if the team is larger.
