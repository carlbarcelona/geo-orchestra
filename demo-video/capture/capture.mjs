// Records the real GeoOrchestra app for the demo video, in two passes over one deterministic script:
//
//   node capture/capture.mjs audio   → capture/raw/audio.wav   (no screencast: the audio clock keeps real time)
//   node capture/capture.mjs video   → capture/raw/frames/*.jpg (screencast: frames re-timed to the audio clock)
//
// Every action is scheduled on the app's own audio clock (seconds after T0), so both passes press the same
// buttons at the same audio time. In the video pass the screencast starves Chrome's audio thread (the clock
// runs at ~0.45×), so the page's performance.now() and requestAnimationFrame are driven by the audio clock
// too: everything the app animates stays in step with what it plays. The sound itself is never altered.
import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const MODE = process.argv[2];
if (!['audio', 'video'].includes(MODE)) throw new Error('usage: capture.mjs audio|video');
const exe = `${process.env.LOCALAPPDATA}/ms-playwright/chromium-1243/chrome-win64/chrome.exe`;
const URL = process.env.APP_URL ?? 'http://localhost:4317/';
const RAW = 'capture/raw';
mkdirSync(RAW, { recursive: true });
if (MODE === 'video') { rmSync(`${RAW}/frames`, { recursive: true, force: true }); mkdirSync(`${RAW}/frames`); }

const browser = await chromium.launch({ executablePath: exe, headless: false, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--window-position=0,0'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

await page.addInitScript((mode) => {
  localStorage.setItem('geoorchestra:uiMode', 'advanced');
  localStorage.setItem('geoorchestra:theme', 'dark');
  const tap = (window.__tap = { ctx: null, blocks: [], clock: [] });
  const connect = AudioNode.prototype.connect;
  // --- the tap: an AudioWorklet copies everything sent to the speakers, with its audio frame number ---
  const code = `class Tap extends AudioWorkletProcessor {
    constructor() { super(); this.on = false; this.parts = []; this.n = 0; this.start = 0; this.port.onmessage = (e) => { this.on = e.data; if (!e.data) this.flush(); }; }
    flush() { if (!this.n) return; const out = new Float32Array(this.n * 2); let o = 0; for (const p of this.parts) { out.set(p, o); o += p.length; } this.port.postMessage({ frame: this.start, pcm: out }, [out.buffer]); this.parts = []; this.n = 0; }
    process(inputs) {
      if (!this.on) return true;
      const i = inputs[0];
      if (!i || !i.length) { this.flush(); return true; }
      const L = i[0], R = i[1] || i[0];
      if (this.n && this.start + this.n !== currentFrame) this.flush();
      if (!this.n) this.start = currentFrame;
      const o = new Float32Array(L.length * 2);
      for (let k = 0; k < L.length; k++) { o[2 * k] = L[k]; o[2 * k + 1] = R[k]; }
      this.parts.push(o); this.n += L.length;
      if (this.n >= 4096) this.flush();
      return true;
    }
  }
  registerProcessor('tap', Tap);`;
  const ensure = (c) => {
    if (c.__tapBus) return c.__tapBus;
    const bus = c.createGain();
    c.__tapBus = bus;
    if (mode === 'audio') {
      c.__tapReady = c.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))).then(() => {
        const node = new AudioWorkletNode(c, 'tap', { outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' });
        const mute = c.createGain(); mute.gain.value = 0;
        connect.call(bus, node); connect.call(node, mute); connect.call(mute, c.destination);
        node.port.onmessage = (e) => tap.blocks.push(e.data);
        c.__tapNode = node;
      });
    }
    if (!tap.ctx) tap.ctx = c;
    return bus;
  };
  const Orig = window.AudioContext;
  window.AudioContext = class extends Orig { constructor(...a) { super(...a); ensure(this); } };
  AudioNode.prototype.connect = function (target, ...rest) {
    const r = connect.call(this, target, ...rest);
    if (target instanceof AudioDestinationNode) connect.call(this, ensure(this.context));
    return r;
  };
  // --- one clock: performance.now() and rAF follow the audio clock once it runs -------------------------
  const realNow = performance.now.bind(performance);
  let anchor = null; // [realNow, audioTime] when the audio clock started running
  const now = () => {
    const c = tap.ctx;
    if (!c || c.state !== 'running') return anchor ? anchor[0] : realNow();
    if (!anchor) anchor = [realNow(), c.currentTime];
    return anchor[0] + (c.currentTime - anchor[1]) * 1000;
  };
  performance.now = now;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf(() => cb(now()));
  // setTimeout counts down in the same (audio) time, so e.g. the sweep line is cleared when the sweep ends
  const realST = window.setTimeout.bind(window), realCT = window.clearTimeout.bind(window);
  const live = new Map(); let nextId = 1;
  window.setTimeout = (cb, d = 0, ...args) => {
    if (typeof cb !== 'function') return realST(cb, d, ...args);
    const id = nextId++, target = now() + (+d || 0);
    const tick = () => {
      if (!live.has(id)) return;
      const left = target - now();
      if (left <= 0) { live.delete(id); cb(...args); } else live.set(id, realST(tick, Math.max(2, Math.min(25, left / 2))));
    };
    live.set(id, realST(tick, Math.min(+d || 0, 4)));
    return 1e7 + id;
  };
  window.clearTimeout = (h) => { if (h > 1e7) { const r = live.get(h - 1e7); live.delete(h - 1e7); if (r) realCT(r); } else realCT(h); };
  // sample (wall epoch ms, audio s) pairs so screencast frames can be re-timed to the audio clock
  setInterval(() => { const c = tap.ctx; if (c && c.state === 'running') tap.clock.push([Date.now(), c.currentTime]); }, 20);
}, MODE);

const cdp = await ctx.newCDPSession(page);
const frames = [];
if (MODE === 'video') {
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const file = `f${String(frames.length).padStart(6, '0')}.jpg`;
    frames.push({ file, wall: metadata.timestamp * 1000 });
    writeFileSync(`${RAW}/frames/${file}`, Buffer.from(data, 'base64'));
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
}

const audioNow = () => page.evaluate(() => window.__tap.ctx.currentTime);
let T0 = null;
const marks = {};
/** Wait until the audio clock reaches T0 + s (seconds of audio time). */
const at = async (s, name) => {
  while ((await audioNow()) < T0 + s) await page.waitForTimeout(15);
  if (name) { marks[name] = s; console.log(`${s.toFixed(1).padStart(5)}  ${name}`); }
};
const btn = (name, exact = false) => page.getByRole('button', { name, exact }).first();
const ctl = (name) => page.getByRole('tab', { name, exact: true }).or(page.getByRole('button', { name, exact: true })).first();

await page.goto(URL);
await page.waitForTimeout(1200);
// start the app's audio context and the tap before anything plays
await page.evaluate(async () => { const t = window.__tap; if (!t.ctx) new AudioContext(); await t.ctx.resume(); await t.ctx.__tapReady; });
if (MODE === 'audio') await page.evaluate(() => window.__tap.ctx.__tapNode.port.postMessage(true));
if (MODE === 'video') await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });

// setup (not timed): data loaded, graph view, 2 months/s
await btn('NASA sample').click();
await page.getByText('295 months').first().waitFor({ timeout: 30000 });
await ctl('Graph').click();
await page.locator('select[aria-label="Playback speed"]').first().selectOption({ label: '2 months/s' });
await page.waitForTimeout(800);
T0 = await audioNow();

// --- the schedule (audio seconds after T0) -------------------------------------------------------------
await at(0.5, 'musical');           // 1 · real IMERG months as music, against the 2001–2022 normal
await btn('Play (Space)').click();
const skip = page.getByRole('button', { name: /^Skip/ }).first();
if (await skip.isVisible({ timeout: 2500 }).catch(() => false)) await skip.click();
await at(11, 'geophony');            // 2 · same measurements as a rain soundscape
await ctl('Geophony').click();
await at(18, 'musical2');
await ctl('Musical').click();
await at(20.5, 'muteMelody');        // 3 · isolate a layer: hum + wetter/drier chords only
await page.locator('.mute-chip', { hasText: 'Melody' }).first().click();
await at(25, 'unmuteMelody');
await page.locator('.mute-chip', { hasText: 'Melody' }).first().click();
await at(27.5, 'pause');
await page.keyboard.press('Space');
await at(28, 'visual');              // 4 · NASA SVS frames
await ctl('Visual feed').click();
await btn('Import visual feed').click();
await btn('Connect climatology').waitFor({ timeout: 30000 });
await btn('Connect climatology').click();
await btn('Disconnect').waitFor({ timeout: 30000 });
await page.getByRole('tab', { name: 'Frame score' }).or(btn('Frame score', true)).first().click().catch(() => {});
await at(34, 'sweep');               //   whole-frame sweep, rain systems light up
await ctl('Sweep frame').click();
await at(46, 'roi');                 // 5 · ROI: isolate the Maritime Continent and sweep only that
await ctl('ROI').click();
await ctl('Maritime Continent').click();
const iso = page.getByLabel('Isolate (zoom the map to it)');
if (await iso.isVisible().catch(() => false)) await iso.check();
await at(49, 'roiSweep');
await page.keyboard.press('s');
await at(59, 'end');

// --- collect ------------------------------------------------------------------------------------------
if (MODE === 'video') await cdp.send('Page.stopScreencast');
const clock = await page.evaluate(() => window.__tap.clock);
if (MODE === 'audio') {
  const a = await page.evaluate(async () => {
    const t = window.__tap;
    t.ctx.__tapNode.port.postMessage(false);
    await new Promise((r) => setTimeout(r, 300));
    const first = t.blocks[0].frame, last = t.blocks.at(-1);
    const n = last.frame + last.pcm.length / 2 - first;
    const pcm = new Int16Array(n * 2);
    for (const b of t.blocks) { const o = (b.frame - first) * 2; for (let i = 0; i < b.pcm.length; i++) pcm[o + i] = Math.max(-1, Math.min(1, b.pcm[i])) * 32767; }
    const buf = new Uint8Array(pcm.buffer);
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { b64: btoa(s), firstFrame: first, sampleRate: t.ctx.sampleRate };
  });
  const pcm = Buffer.from(a.b64, 'base64');
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12);
  hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(a.sampleRate, 24);
  hdr.writeUInt32LE(a.sampleRate * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
  writeFileSync(`${RAW}/audio.wav`, Buffer.concat([hdr, pcm]));
  // audio.wav sample 0 is audio time firstFrame/sampleRate; schedule time 0 is T0
  writeFileSync(`${RAW}/audio.json`, JSON.stringify({ T0, wavStart: a.firstFrame / a.sampleRate, sampleRate: a.sampleRate, marks, rate: rate(clock) }, null, 1));
  console.log(`audio ${(pcm.length / 4 / a.sampleRate).toFixed(1)} s, clock rate ${rate(clock)}`);
} else {
  // re-time every frame to the audio clock (linear interpolation between clock samples)
  let j = 0;
  for (const f of frames) {
    while (j < clock.length - 2 && clock[j + 1][0] < f.wall) j++;
    const [w0, a0] = clock[j], [w1, a1] = clock[j + 1];
    f.t = +(a0 + ((f.wall - w0) / (w1 - w0)) * (a1 - a0) - T0).toFixed(4);
  }
  writeFileSync(`${RAW}/video.json`, JSON.stringify({ T0, marks, rate: rate(clock), frames }, null, 1));
  console.log(`frames ${frames.length}, clock rate ${rate(clock)}`);
}
function rate(c) { return +((c.at(-1)[1] - c[0][1]) / ((c.at(-1)[0] - c[0][0]) / 1000)).toFixed(3); }
await browser.close();
