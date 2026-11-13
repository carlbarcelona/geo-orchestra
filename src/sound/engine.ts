import * as Tone from 'tone';
import type { SoundEvent } from '../contracts';

export type SoundMode = 'musical' | 'geophony';
export type InstrumentId = 'soft-piano' | 'strings' | 'synth-pad' | 'marimba';

export const INSTRUMENTS: { id: InstrumentId; label: string }[] = [
  { id: 'soft-piano', label: 'Soft piano' },
  { id: 'strings', label: 'Strings' },
  { id: 'synth-pad', label: 'Synth pad' },
  { id: 'marimba', label: 'Marimba' },
];

export interface LayerLevels { melody: number; texture: number; markers: number; image: number }

function gainToDb(g: number) { return g <= 0.0001 ? -Infinity : 20 * Math.log10(g); }

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sound engine. Owns instruments and mixer channels only — it never owns time. The playback
 * controller hands it events together with the audio-clock time at which they must sound.
 */
class SoundEngine {
  private built = false;
  private master!: Tone.Volume;
  private melodyCh!: Tone.Channel;
  private textureCh!: Tone.Channel;
  private markerCh!: Tone.Channel;
  private imageCh!: Tone.Channel;
  private scanPool: { panner: Tone.Panner; synth: Tone.Synth }[] = [];
  private scanNext = 0;
  private featureVoice!: Tone.Synth;
  private featureOn = false;
  private reverb!: Tone.Freeverb;
  private instrument!: Tone.PolySynth;
  private instrumentId: InstrumentId = 'soft-piano';
  private samplers: { panner: Tone.Panner; synth: Tone.Synth }[] = [];
  private rainNoise!: Tone.Noise;
  private rainFilter!: Tone.Filter;
  private rainGain!: Tone.Gain;
  private drops!: Tone.PolySynth;
  private dropFilter!: Tone.Filter;
  private markerSynth!: Tone.Synth;
  private gapSynth!: Tone.MembraneSynth;
  private levels: LayerLevels = { melody: 0.8, texture: 0.75, markers: 0.5, image: 0.7 };
  private masterGain = 0.8;
  available = true;
  lastError: string | null = null;

  get isReady() { return this.built && Tone.getContext().state === 'running'; }

  /** Must be called from a user gesture. */
  async start(): Promise<boolean> {
    try {
      await Tone.start();
      if (!this.built) this.build();
      this.available = Tone.getContext().state === 'running';
      return this.available;
    } catch (e) {
      this.available = false;
      this.lastError = (e as Error).message;
      return false;
    }
  }

  private build() {
    this.master = new Tone.Volume(gainToDb(this.masterGain)).toDestination();
    this.reverb = new Tone.Freeverb({ roomSize: 0.72, dampening: 3800, wet: 0.22 }).connect(this.master);
    this.melodyCh = new Tone.Channel({ volume: gainToDb(this.levels.melody) }).connect(this.reverb);
    this.textureCh = new Tone.Channel({ volume: gainToDb(this.levels.texture) }).connect(this.master);
    this.markerCh = new Tone.Channel({ volume: gainToDb(this.levels.markers) }).connect(this.master);
    this.imageCh = new Tone.Channel({ volume: gainToDb(this.levels.image) }).connect(this.reverb);
    // frame-scan voices: a pool of panned bell tones (west = left, east = right)
    for (let i = 0; i < 14; i++) {
      const panner = new Tone.Panner(0).connect(this.imageCh);
      const synth = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.004, decay: 0.22, sustain: 0.05, release: 0.25 } }).connect(panner);
      synth.volume.value = -9;
      this.scanPool.push({ panner, synth });
    }
    // feature voice: a gliding string tone that follows the rain-band latitude
    const fvFilter = new Tone.Filter({ type: 'lowpass', frequency: 1400, Q: 0.6 }).connect(this.imageCh);
    this.featureVoice = new Tone.Synth({ oscillator: { type: 'sawtooth' }, portamento: 0.12, envelope: { attack: 0.25, decay: 0.3, sustain: 0.7, release: 0.8 } }).connect(fvFilter);
    this.featureVoice.volume.value = -20;
    this.instrument = this.makeInstrument(this.instrumentId);
    for (let i = 0; i < 5; i++) {
      const panner = new Tone.Panner(0).connect(this.melodyCh);
      const synth = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.005, decay: 0.25, sustain: 0, release: 0.3 } }).connect(panner);
      synth.volume.value = -10;
      this.samplers.push({ panner, synth });
    }
    // Geophony: filtered pink noise bed + synthesized droplets
    this.rainGain = new Tone.Gain(0).connect(this.textureCh);
    this.rainFilter = new Tone.Filter({ type: 'lowpass', frequency: 1800, Q: 0.4 }).connect(this.rainGain);
    this.rainNoise = new Tone.Noise('pink').connect(this.rainFilter);
    this.dropFilter = new Tone.Filter({ type: 'highpass', frequency: 900 }).connect(this.textureCh);
    this.drops = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.045, sustain: 0, release: 0.02 } }).connect(this.dropFilter);
    this.drops.maxPolyphony = 48;
    this.drops.volume.value = -14;
    this.markerSynth = new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.05 } }).connect(this.markerCh);
    this.gapSynth = new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 2, envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.1 } }).connect(this.markerCh);
    this.gapSynth.volume.value = -8;
    this.built = true;
  }

  private makeInstrument(id: InstrumentId): Tone.PolySynth {
    let synth: Tone.PolySynth;
    switch (id) {
      case 'strings':
        synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsawtooth', count: 3, spread: 18 } as any, envelope: { attack: 0.18, decay: 0.3, sustain: 0.6, release: 1.2 } });
        synth.volume.value = -16;
        break;
      case 'synth-pad':
        synth = new Tone.PolySynth(Tone.FMSynth, { harmonicity: 2, modulationIndex: 3, envelope: { attack: 0.08, decay: 0.4, sustain: 0.4, release: 1.4 } } as any);
        synth.volume.value = -12;
        break;
      case 'marimba':
        synth = new Tone.PolySynth(Tone.FMSynth, { harmonicity: 3.01, modulationIndex: 10, envelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.4 }, modulationEnvelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 } } as any);
        synth.volume.value = -8;
        break;
      default:
        synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle8' } as any, envelope: { attack: 0.004, decay: 1.1, sustain: 0.12, release: 1.4 } });
        synth.volume.value = -7;
    }
    synth.maxPolyphony = 24;
    synth.connect(this.melodyCh);
    return synth;
  }

  setInstrument(id: InstrumentId) {
    this.instrumentId = id;
    if (!this.built) return;
    const old = this.instrument;
    this.instrument = this.makeInstrument(id);
    old.releaseAll();
    setTimeout(() => old.dispose(), 2000);
  }

  setMaster(g: number) { this.masterGain = g; if (this.built) this.master.volume.rampTo(gainToDb(g), 0.05); }
  setLevels(l: LayerLevels) {
    this.levels = l;
    if (!this.built) return;
    this.melodyCh.volume.rampTo(gainToDb(l.melody), 0.05);
    this.textureCh.volume.rampTo(gainToDb(l.texture), 0.05);
    this.markerCh.volume.rampTo(gainToDb(l.markers), 0.05);
    this.imageCh.volume.rampTo(gainToDb(l.image), 0.05);
  }

  /** Schedule one step's events at audio time `time`, lasting `stepSeconds`. */
  playStep(events: SoundEvent[], time: number, stepSeconds: number, mode: SoundMode) {
    if (!this.built) return;
    let textureSet = false;
    for (const ev of events) {
      const at = time + ev.offset * stepSeconds;
      const dur = Math.max(0.06, ev.duration * stepSeconds);
      if (ev.kind === 'scan' && ev.midi != null) {
        const slot = this.scanPool[this.scanNext++ % this.scanPool.length];
        slot.panner.pan.setValueAtTime(ev.pan ?? 0, at);
        slot.synth.triggerAttackRelease(Tone.Frequency(ev.midi + 12, 'midi').toFrequency(), Math.min(dur, 0.35), at, ev.velocity ?? 0.5);
        continue;
      }
      if (ev.kind === 'feature' && ev.midi != null) {
        const f = Tone.Frequency(ev.midi - 12, 'midi').toFrequency();
        if (!this.featureOn) { this.featureVoice.triggerAttack(f, at, ev.velocity ?? 0.4); this.featureOn = true; }
        else this.featureVoice.setNote(f, at);
        continue;
      }
      if (ev.kind === 'marker') {
        if (ev.marker === 'turn') { this.markerSynth.triggerAttackRelease('E6', 0.12, at, 0.6); this.markerSynth.triggerAttackRelease('B6', 0.12, at + 0.09, 0.5); }
        else if (ev.marker === 'missing') this.gapSynth.triggerAttackRelease('C2', 0.15, at, 0.5);
        else if (ev.marker === 'year' && mode === 'musical') this.markerSynth.triggerAttackRelease('C7', 0.03, at, 0.25);
        else if (ev.marker === 'zero') this.markerSynth.triggerAttackRelease('G6', 0.05, at, 0.5);
        continue;
      }
      if (mode === 'musical' && ev.kind === 'melody' && ev.midi != null) {
        this.instrument.triggerAttackRelease(Tone.Frequency(ev.midi, 'midi').toFrequency(), dur, at, ev.velocity ?? 0.6);
      } else if (mode === 'musical' && ev.kind === 'sample' && ev.midi != null) {
        const slot = this.samplers[Number(ev.id.split('#s')[1] ?? 0) % this.samplers.length];
        slot.panner.pan.setValueAtTime(ev.pan ?? 0, at);
        slot.synth.triggerAttackRelease(Tone.Frequency(ev.midi + 12, 'midi').toFrequency(), dur, at, ev.velocity ?? 0.4);
      } else if (mode === 'geophony' && ev.kind === 'texture' && ev.texture) {
        textureSet = true;
        this.scheduleRain(ev, at, stepSeconds);
      }
    }
    if (mode === 'geophony' && !textureSet) {
      // missing step: the rain bed fades out (silence is the honest sound of no measurement)
      this.ensureNoise();
      this.rainGain.gain.cancelScheduledValues(time);
      this.rainGain.gain.linearRampToValueAtTime(0, time + Math.min(0.25, stepSeconds * 0.5));
    }
  }

  private ensureNoise() { if (this.rainNoise.state !== 'started') this.rainNoise.start(); }

  private scheduleRain(ev: SoundEvent, at: number, stepSeconds: number) {
    const t = ev.texture!;
    this.ensureNoise();
    const ramp = Math.min(0.3, stepSeconds * 0.5);
    this.rainGain.gain.cancelScheduledValues(at);
    this.rainGain.gain.linearRampToValueAtTime(t.intensity * 0.55, at + ramp);
    this.rainFilter.frequency.cancelScheduledValues(at);
    this.rainFilter.frequency.linearRampToValueAtTime(600 + t.brightness * 5200, at + ramp);
    const count = Math.min(60, Math.round(t.dropsPerSecond * stepSeconds));
    const rnd = seeded(ev.stepIndex * 7919 + 17);
    for (let k = 0; k < count; k++) {
      const when = at + rnd() * stepSeconds * 0.98;
      const f = 1800 + rnd() * 3600;
      this.drops.triggerAttackRelease(f, 0.03, when, 0.15 + rnd() * 0.5 * t.intensity);
    }
  }

  /** Immediately silence everything scheduled or sounding (seek, pause, mode change). */
  silence() {
    if (!this.built) return;
    const now = Tone.now();
    this.instrument.releaseAll(now);
    this.drops.releaseAll(now);
    this.samplers.forEach((s) => s.synth.triggerRelease(now));
    this.scanPool.forEach((s) => s.synth.triggerRelease(now));
    if (this.featureOn) { this.featureVoice.triggerRelease(now); this.featureOn = false; }
    this.rainGain.gain.cancelScheduledValues(now);
    this.rainGain.gain.setValueAtTime(this.rainGain.gain.value, now);
    this.rainGain.gain.linearRampToValueAtTime(0, now + 0.15);
  }

  /** Play one sweep (frame scan) of `seconds` duration starting now; returns the audio start time. */
  async playSweep(events: SoundEvent[], seconds: number, mode: SoundMode): Promise<number | null> {
    if (!(await this.start())) return null;
    this.silence();
    const t0 = Tone.now() + 0.08;
    this.playStep(events, t0, seconds, mode);
    return t0;
  }

  /** A single short tone for the audio cursor. */
  async ping(ev: SoundEvent) {
    if (!(await this.start())) return;
    this.playStep([{ ...ev, offset: 0, duration: 1 }], Tone.now() + 0.01, 0.25, 'musical');
  }

  now() { return Tone.now(); }

  /** Audition legend examples (only used while the transport is paused). */
  async audition(events: SoundEvent[], mode: SoundMode) {
    if (!(await this.start())) return;
    this.silence();
    const t0 = Tone.now() + 0.05;
    this.playStep(events, t0, 1.2, mode);
    if (mode === 'geophony') {
      this.rainGain.gain.linearRampToValueAtTime(0, t0 + 1.6);
    }
  }
}

export const engine = new SoundEngine();
