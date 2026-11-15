import { loadFont as loadCondensed } from '@remotion/google-fonts/BarlowCondensed';
import { loadFont as loadBarlow } from '@remotion/google-fonts/Barlow';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import { useAudioData } from '@remotion/media-utils';
import { AbsoluteFill, Easing, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import boxes from './boxes.json';
import timeline from './timeline.json';

const { fontFamily: CONDENSED } = loadCondensed('normal', { weights: ['500', '600', '700'], subsets: ['latin'] });
const { fontFamily: BARLOW } = loadBarlow('normal', { weights: ['400', '500'], subsets: ['latin'] });
const { fontFamily: MONO } = loadMono('normal', { weights: ['400', '500'], subsets: ['latin'] });

export const FPS = 30;
export const DEMO_FRAMES = 900; // 30 s

// The app's own palette (src/styles.css, dark theme)
const C = { bg: '#060d14', panel: 'rgba(6, 13, 20, 0.92)', line: '#29445c', text: '#e6eef5', dim: '#a9bccb', amber: '#f5b942', teal: '#5eead4', violet: '#c4b5fd' };

type Rect = readonly [number, number, number, number]; // x, y, w, h in capture pixels (1920×1080)
const B = boxes as unknown as Record<string, Rect>;

/** One shot = a stretch of the capture (schedule seconds) shown with a camera move and overlays. */
interface Shot {
  id: string; from: number; to: number;           // schedule seconds in the capture
  frames: number;                                  // length in the edit
  camera: [Rect, Rect];                            // focus rect at start → end
}
const FULL: Rect = [0, 0, 1920, 1080];
const SHOTS: Shot[] = [
  { id: 'musical', from: 0.3, to: 9.8, frames: 285, camera: [FULL, [120, 260, 1680, 820]] },
  { id: 'geophony', from: 11.0, to: 16.4, frames: 162, camera: [[560, 120, 1360, 905], [600, 140, 1320, 880]] },
  { id: 'isolate', from: 20.4, to: 25.0, frames: 138, camera: [[1010, 400, 900, 620], [1040, 410, 870, 600]] },
  { id: 'sweep', from: 34.0, to: 44.5, frames: 315, camera: [[455, 128, 990, 520], [470, 135, 960, 505]] },
];
const clipSec = (s: number) => s - timeline.start; // schedule seconds → seconds into app.mp4

function cameraStyle(rect: Rect): React.CSSProperties {
  const [x, y, w, h] = rect;
  const s = Math.min(1920 / w, 1080 / h);
  const cx = x + w / 2, cy = y + h / 2;
  const tx = Math.min(0, Math.max(1920 - 1920 * s, 960 - cx * s));
  const ty = Math.min(0, Math.max(1080 - 1080 * s, 540 - cy * s));
  return { transform: `translate(${tx}px, ${ty}px) scale(${s})`, transformOrigin: '0 0' };
}
const lerpRect = (a: Rect, b: Rect, t: number): Rect => [0, 1, 2, 3].map((i) => a[i] + (b[i] - a[i]) * t) as unknown as Rect;
/** Map a capture-space rect through a camera rect into output pixels. */
function project(r: Rect, cam: Rect): Rect {
  const [x, y, w, h] = cam;
  const s = Math.min(1920 / w, 1080 / h);
  const cx = x + w / 2, cy = y + h / 2;
  const tx = Math.min(0, Math.max(1920 - 1920 * s, 960 - cx * s));
  const ty = Math.min(0, Math.max(1080 - 1080 * s, 540 - cy * s));
  return [tx + r[0] * s, ty + r[1] * s, r[2] * s, r[3] * s];
}

const ease = Easing.bezier(0.45, 0, 0.2, 1);

function ShotView({ shot, children }: { shot: Shot; children?: (cam: Rect, f: number) => React.ReactNode }) {
  const f = useCurrentFrame();
  const camT = shot.id === 'musical'
    ? interpolate(f, [70, 120], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease })
    : interpolate(f, [0, shot.frames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const cam = lerpRect(shot.camera[0], shot.camera[1], camT);
  const fade = 5;
  const vol = (fr: number) => interpolate(fr, [0, fade, shot.frames - fade, shot.frames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: C.bg, overflow: 'hidden' }}>
      <AbsoluteFill style={cameraStyle(cam)}>
        <OffthreadVideo src={staticFile('clips/app.mp4')} startFrom={Math.round(clipSec(shot.from) * FPS)} volume={vol} style={{ width: 1920, height: 1080 }} />
      </AbsoluteFill>
      {children?.(cam, f)}
    </AbsoluteFill>
  );
}

/** Viewfinder corners around a UI element (the app's own highlight language). */
function Finder({ rect, cam, label, appear }: { rect: Rect; cam: Rect; label?: string; appear: number }) {
  const f = useCurrentFrame();
  const t = interpolate(f, [appear, appear + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  if (t <= 0) return null;
  const pad = 8;
  const [x, y, w, h] = project(rect, cam);
  const X = x - pad, Y = y - pad, W = w + pad * 2, H = h + pad * 2;
  const k = 18 * t;
  const corner = (cx: number, cy: number, dx: number, dy: number) => <path d={`M${cx + dx * k},${cy} L${cx},${cy} L${cx},${cy + dy * k}`} />;
  return (
    <>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <rect x={X} y={Y} width={W} height={H} fill="none" stroke={C.amber} strokeOpacity={0.35 * t} strokeWidth={1} />
        <g stroke={C.amber} strokeWidth={3} fill="none">
          {corner(X, Y, 1, 1)}{corner(X + W, Y, -1, 1)}{corner(X, Y + H, 1, -1)}{corner(X + W, Y + H, -1, -1)}
        </g>
      </svg>
      {label && (
        <div style={{ position: 'absolute', left: X, top: Y + H + 10, opacity: t, fontFamily: MONO, fontSize: 20, letterSpacing: 1, color: C.bg, background: C.amber, padding: '3px 8px' }}>{label}</div>
      )}
    </>
  );
}

/** Lower third: kicker, headline, one explanatory line. */
function Caption({ kicker, title, line, note, appear = 6, out, top }: { kicker: string; title: string; line: string; note?: string; appear?: number; out: number; top?: boolean }) {
  const f = useCurrentFrame();
  const t = interpolate(f, [appear, appear + 12, out - 8, out], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  return (
    <div style={{ position: 'absolute', left: 72, ...(top ? { top: 64 } : { bottom: 72 }), width: 1060, opacity: t, transform: `translateY(${(1 - t) * (top ? -16 : 16)}px)` }}>
      <div style={{ background: C.panel, borderLeft: `4px solid ${C.amber}`, padding: '22px 30px 24px' }}>
        <div style={{ fontFamily: MONO, fontSize: 21, letterSpacing: 3, color: C.amber, textTransform: 'uppercase' }}>{kicker}</div>
        <div style={{ fontFamily: CONDENSED, fontWeight: 600, fontSize: 64, lineHeight: 1.02, color: C.text, marginTop: 8 }}>{title}</div>
        <div style={{ fontFamily: BARLOW, fontSize: 29, lineHeight: 1.3, color: C.dim, marginTop: 10 }}>{line}</div>
      </div>
      {note && <div style={{ fontFamily: MONO, fontSize: 17, color: C.dim, background: C.panel, padding: '6px 30px', marginTop: 4, display: 'inline-block' }}>{note}</div>}
    </div>
  );
}

/** "Live app audio": an oscilloscope of the real soundtrack and what is sounding. */
function Scope({ shot, voices, color = C.amber, top }: { shot: Shot; voices: string; color?: string; top?: boolean }) {
  const f = useCurrentFrame();
  const audio = useAudioData(staticFile('clips/app.wav'));
  const t = interpolate(f, [4, 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  let path = '';
  let level = 0;
  if (audio) {
    const wave = audio.channelWaveforms[0];
    const sr = audio.sampleRate;
    const centre = Math.round((clipSec(shot.from) + f / FPS) * sr);
    const span = Math.round(sr * 0.06), n = 180;
    const pts: string[] = [];
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const v = wave[centre - span / 2 + Math.round((i / (n - 1)) * span)] ?? 0;
      peak = Math.max(peak, Math.abs(v));
      pts.push(`${(i / (n - 1)) * 380},${36 - Math.max(-1, Math.min(1, v * 5)) * 30}`);
    }
    level = peak;
    path = `M${pts.join(' L')}`;
  }
  return (
    <div style={{ position: 'absolute', right: 72, ...(top ? { top: 64 } : { bottom: 72 }), width: 420, opacity: t, background: C.panel, border: `1px solid ${C.line}`, padding: '14px 20px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: MONO, fontSize: 17, letterSpacing: 2, color: C.dim }}>
        <span style={{ width: 9, height: 9, borderRadius: 9, background: level > 0.004 ? color : C.line }} />
        LIVE APP AUDIO
      </div>
      <svg width={380} height={72} style={{ display: 'block', marginTop: 8 }}>
        <line x1={0} x2={380} y1={36} y2={36} stroke={C.line} strokeWidth={1} />
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      </svg>
      <div style={{ fontFamily: CONDENSED, fontWeight: 500, fontSize: 27, color: C.text, marginTop: 6 }}>{voices}</div>
    </div>
  );
}

function TitleCard({ frames }: { frames: number }) {
  const f = useCurrentFrame();
  const bg = interpolate(f, [0, 8, frames - 14, frames], [0.85, 0.72, 0.72, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const t = interpolate(f, [4, 16, frames - 12, frames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  return (
    <AbsoluteFill style={{ background: `rgba(6, 13, 20, ${bg})`, justifyContent: 'center', paddingLeft: 140 }}>
      <div style={{ opacity: t, transform: `translateY(${(1 - t) * 20}px)` }}>
        <div style={{ fontFamily: MONO, fontSize: 24, letterSpacing: 4, color: C.amber }}>NASA SPACE APPS 2026 · THE EARTH INFORMATION JUKEBOX</div>
        <div style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 168, lineHeight: 1, color: C.text, marginTop: 18 }}>GeoOrchestra</div>
        <div style={{ fontFamily: BARLOW, fontSize: 44, color: C.dim, marginTop: 14 }}>NASA rainfall you can hear — and check, note by note.</div>
      </div>
    </AbsoluteFill>
  );
}

function EndCard({ appear, frames }: { appear: number; frames: number }) {
  const f = useCurrentFrame();
  const t = interpolate(f, [appear, appear + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  if (t <= 0) return null;
  void frames;
  return (
    <AbsoluteFill style={{ background: `rgba(6, 13, 20, ${0.9 * t})`, justifyContent: 'center', paddingLeft: 140 }}>
      <div style={{ opacity: t }}>
        <div style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 120, color: C.text, lineHeight: 1 }}>GeoOrchestra</div>
        <div style={{ fontFamily: BARLOW, fontSize: 40, color: C.dim, marginTop: 12 }}>Every sound carries its date, place, value and mapping.</div>
        <div style={{ fontFamily: MONO, fontSize: 40, color: C.amber, marginTop: 34 }}>spacebigan.vercel.app</div>
        <div style={{ fontFamily: MONO, fontSize: 19, color: C.dim, marginTop: 34, lineHeight: 1.6 }}>
          DATA · NASA GPM IMERG Final Monthly V07B (Jun 2000 – Dec 2024) · NASA SVS 5478 precipitation climatology<br />
          Sounds are designed mappings of satellite estimates, not recordings.
        </div>
      </div>
    </AbsoluteFill>
  );
}

export const Demo: React.FC = () => {
  let at = 0;
  const seq = SHOTS.map((s) => { const from = at; at += s.frames; return { s, from }; });
  const [mus, geo, iso, sweep] = seq;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Sequence from={mus.from} durationInFrames={mus.s.frames}>
        <ShotView shot={mus.s}>{(cam) => (<>
          <Sequence from={75}><Finder rect={[150, 661, 840, 31]} cam={cam} appear={40} label="NOW HEARING · PLAIN-LANGUAGE CAPTION" /></Sequence>
          <Sequence from={75}><Caption kicker="01 · Musical" title="295 months of NASA rainfall, one note each" line="Pitch follows the rain. A soft hum plays the 2001–2022 normal: above it is wetter, below is drier." out={210} top /></Sequence>
          <Sequence from={75}><Scope shot={{ ...mus.s, from: mus.s.from + 75 / FPS }} voices="piano · normal hum · wetter/drier chord" top /></Sequence>
        </>)}</ShotView>
        <Sequence durationInFrames={75}><TitleCard frames={75} /></Sequence>
      </Sequence>

      <Sequence from={geo.from} durationInFrames={geo.s.frames}>
        <ShotView shot={geo.s}>{(cam) => (<>
          <Finder rect={B.geophonyTab} cam={cam} appear={4} label="GEOPHONY" />
          <Caption kicker="02 · Geophony" title="The same numbers, heard as rain" line="Rainfall sets how dense, loud and bright the rain is. Only the voice changes, never the data." out={geo.s.frames} />
          <Scope shot={geo.s} voices="rain bed · droplets" color={C.teal} />
        </>)}</ShotView>
      </Sequence>

      <Sequence from={iso.from} durationInFrames={iso.s.frames}>
        <ShotView shot={iso.s}>{(cam) => (<>
          <Finder rect={B.melodyChip} cam={cam} appear={2} label="MELODY MUTED" />
          <Caption kicker="03 · Isolate" title="Mute any layer to hear one idea" line="Melody off: what is left is the normal hum and the wetter/drier chords." out={iso.s.frames} />
          <Scope shot={iso.s} voices="hum · chords (melody muted)" />
        </>)}</ShotView>
      </Sequence>

      <Sequence from={sweep.from} durationInFrames={sweep.s.frames}>
        <ShotView shot={sweep.s}>{() => (<>
          <Caption kicker="04 · The whole NASA frame" title="A scan line reads the map, west to east" line="Pitch = latitude. Each heavy-rain system holds a tone while the line crosses it, and lights up." note="NASA SVS 5478 climatology · values decoded from NASA's colorbar (approximate)" out={252} />
          <Sequence durationInFrames={252}><Scope shot={sweep.s} voices="bells by latitude · held pads per system" color={C.teal} /></Sequence>
          <EndCard appear={252} frames={sweep.s.frames} />
        </>)}</ShotView>
      </Sequence>
    </AbsoluteFill>
  );
};
