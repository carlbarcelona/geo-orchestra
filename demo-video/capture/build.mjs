// Joins the two capture passes into public/clips/app.mp4: the video-pass frames at a constant 30 fps on the
// schedule timeline, with the audio-pass soundtrack on the same time axis (both are app audio-clock time).
// Clip time 0 = schedule time START (see capture.mjs), so schedule second s is clip second s - START.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const RAW = 'capture/raw';
const START = -1; // keep one second before the first action
const v = JSON.parse(readFileSync(`${RAW}/video.json`, 'utf8'));
const a = JSON.parse(readFileSync(`${RAW}/audio.json`, 'utf8'));
const frames = v.frames.filter((f) => f.t >= START - 0.5).sort((x, y) => x.t - y.t);
const end = v.marks.end;
let list = 'ffconcat version 1.0\n';
for (let i = 0; i < frames.length; i++) {
  const f = frames[i];
  const t0 = Math.max(START, f.t), t1 = i + 1 < frames.length ? Math.max(START, frames[i + 1].t) : end;
  if (t1 <= t0 || t0 >= end) continue;
  list += `file 'frames/${f.file}'\nduration ${(Math.min(t1, end) - t0).toFixed(5)}\n`;
}
writeFileSync(`${RAW}/frames.ffconcat`, list);
mkdirSync('public/clips', { recursive: true });
const audioOffset = a.T0 - a.wavStart + START; // seconds into audio.wav that match clip time 0
console.log('audio offset', audioOffset.toFixed(3), 's; duration', (end - START).toFixed(2), 's');
execFileSync('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'concat', '-safe', '0', '-i', `${RAW}/frames.ffconcat`,
  '-ss', String(Math.max(0, audioOffset)), '-i', `${RAW}/audio.wav`,
  '-filter_complex', `[0:v]fps=30,format=yuv420p[v];[1:a]${audioOffset < 0 ? `adelay=${Math.round(-audioOffset * 1000)}:all=1,` : ''}apad[a]`,
  '-map', '[v]', '-map', '[a]', '-t', String(end - START),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart',
  'public/clips/app.mp4',
], { stdio: 'inherit' });
writeFileSync('src/timeline.json', JSON.stringify({ start: START, marks: v.marks }, null, 1));
console.log('public/clips/app.mp4 written');
