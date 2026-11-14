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

export interface LayerLevels { melody: number; texture: number; markers: number; image: number; context: number; time: number }

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
  private contextCh!: Tone.Channel;
  private refVoice!: Tone.Synth;
  private refOn = false;
  private harmony!: Tone.PolySynth;
  private bell!: Tone.FMSynth;
  private thunderEnv!: Tone.AmplitudeEnvelope;
  private thunderNoise!: Tone.Noise;
  private windEnv!: Tone.AmplitudeEnvelope;
  private windFilter!: Tone.Filter;
  private windNoise!: Tone.Noise;
  private timeCh!: Tone.Channel;
  private cueWood!: Tone.MembraneSynth;
  private cueDrum!: Tone.MembraneSynth;
  private cueBell!: Tone.FMSynth;
  private cueClick!: Tone.NoiseSynth;
  private cueChime!: Tone.PolySynth;
  private scanPool: { panner: Tone.Panner; synth: Tone.Synth }[] = [];
  private scanNext = 0;
  private featureVoice!: Tone.Synth;
  /** rain-system voices (scan-v3): one pad per zone, panned by the system's position */
  private systemVoices: { tropical: Tone.PolySynth; extratropical: Tone.PolySynth; panner: Tone.Panner }[] = [];
  private systemNext = 0;
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
  private levels: LayerLevels = { melody: 0.8, texture: 0.75, markers: 0.5, image: 0.7, context: 0.55, time: 0.6 };
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
    this.contextCh = new Tone.Channel({ volume: gainToDb(this.levels.context) }).connect(this.reverb);
    // the normal "hum": a soft sustained sine that glides to each step's reference pitch
    this.refVoice = new Tone.Synth({ oscillator: { type: 'sine' }, portamento: 0.15, envelope: { attack: 0.35, decay: 0.2, sustain: 0.85, release: 0.6 } }).connect(this.contextCh);
    this.refVoice.volume.value = -13;
    // wetter/drier harmony: a quiet pad under the melody
    this.harmony = new Tone.PolySynth(Tone.AMSynth, { harmonicity: 1.5, envelope: { attack: 0.18, decay: 0.3, sustain: 0.6, release: 0.9 } } as any).connect(this.contextCh);
    this.harmony.maxPolyphony = 16;
    this.harmony.volume.value = -19;
    // unusual-month bell
    this.bell = new Tone.FMSynth({ harmonicity: 3.5, modulationIndex: 8, envelope: { attack: 0.001, decay: 0.9, sustain: 0, release: 0.6 }, modulationEnvelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.3 } } as any).connect(this.contextCh);
    this.bell.volume.value = -10;
    // frame-scan voices: a pool of panned bell tones (west = left, east = right)
    for (let i = 0; i < 14; i++) {
      const panner = new Tone.Panner(0).connect(this.imageCh);
      const synth = new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.004, decay: 0.22, sustain: 0.05, release: 0.25 } }).connect(panner);
      synth.volume.value = -8;
      this.scanPool.push({ panner, synth });
    }
    // feature voice: a gliding string tone that follows the rain-band latitude
    const fvFilter = new Tone.Filter({ type: 'lowpass', frequency: 1400, Q: 0.6 }).connect(this.imageCh);
    this.featureVoice = new Tone.Synth({ oscillator: { type: 'sawtooth' }, portamento: 0.12, envelope: { attack: 0.25, decay: 0.3, sustain: 0.7, release: 0.8 } }).connect(fvFilter);
    this.featureVoice.volume.value = -20;
    for (let i = 0; i < 6; i++) {
      const panner = new Tone.Panner(0).connect(this.imageCh);
      const tropical = new Tone.PolySynth(Tone.AMSynth, { harmonicity: 2, envelope: { attack: 0.18, decay: 0.2, sustain: 0.8, release: 0.6 } } as any).connect(panner);
      tropical.volume.value = -17;
      const extratropical = new Tone.PolySynth(Tone.FMSynth, { harmonicity: 1, modulationIndex: 2.5, oscillator: { type: 'sine' }, envelope: { attack: 0.22, decay: 0.3, sustain: 0.7, release: 0.7 } } as any).connect(panner);
      extratropical.volume.value = -19;
      this.systemVoices.push({ tropical, extratropical, panner });
    }
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
    // geophony cues: distant thunder (much wetter than normal) and dry wind (much drier)
    this.thunderEnv = new Tone.AmplitudeEnvelope({ attack: 0.35, decay: 1.4, sustain: 0, release: 0.6 }).connect(this.textureCh);
    const thunderFilter = new Tone.Filter({ type: 'lowpass', frequency: 180, Q: 0.7 }).connect(this.thunderEnv);
    this.thunderNoise = new Tone.Noise('brown').connect(thunderFilter);
    this.thunderNoise.volume.value = 4;
    this.windEnv = new Tone.AmplitudeEnvelope({ attack: 0.5, decay: 0.5, sustain: 0.5, release: 0.7 }).connect(this.textureCh);
    this.windFilter = new Tone.Filter({ type: 'bandpass', frequency: 500, Q: 1.8 }).connect(this.windEnv);
    this.windNoise = new Tone.Noise('white').connect(this.windFilter);
    this.windNoise.volume.value = -10;
    // time cues (cue-v1): dry percussive voices on their own layer, heard in both modes
    this.timeCh = new Tone.Channel({ volume: gainToDb(this.levels.time) }).connect(this.master);
    this.cueWood = new Tone.MembraneSynth({ pitchDecay: 0.008, octaves: 1.5, envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.03 } }).connect(this.timeCh);
    this.cueWood.volume.value = -6;
    this.cueDrum = new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 4, envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 } }).connect(this.timeCh);
    this.cueDrum.volume.value = -4;
    this.cueBell = new Tone.FMSynth({ harmonicity: 5.1, modulationIndex: 12, envelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.3 }, modulationEnvelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 } } as any).connect(this.timeCh);
    this.cueBell.volume.value = -14;
    this.cueClick = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.02, sustain: 0, release: 0.01 } }).connect(this.timeCh);
    this.cueClick.volume.value = -12;
    this.cueChime = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.002, decay: 0.35, sustain: 0, release: 0.2 } }).connect(this.timeCh);
    this.cueChime.volume.value = -12;
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
    this.contextCh.volume.rampTo(gainToDb(l.context ?? 0.55), 0.05);
    this.timeCh.volume.rampTo(gainToDb(l.time ?? 0.6), 0.05);
  }

  /** One time cue at audio time `at`. A strong accent is louder and doubled 90 ms later. */
  private playCue(cue: NonNullable<SoundEvent['timeCue']>, at: number) {
    const vel = cue.accent === 'strong' ? 1 : cue.accent === 'medium' ? 0.75 : 0.5;
    const hit = (t: number, v: number) => {
      switch (cue.sound) {
        case 'drum': this.cueDrum.triggerAttackRelease('C2', 0.15, t, v); break;
        case 'bell': this.cueBell.triggerAttackRelease('E6', 0.2, t, v); break;
        case 'click': this.cueClick.triggerAttackRelease(0.02, t, v); break;
        case 'chime': this.cueChime.triggerAttackRelease(['G5', 'C6'], 0.15, t, v); break;
        default: this.cueWood.triggerAttackRelease('G5', 0.05, t, v);
      }
    };
    hit(at, vel);
    if (cue.accent === 'strong') hit(at + 0.09, vel * 0.85);
  }

  /** Preview one cue now (legend / settings), without touching playback. */
  async auditionCue(cue: NonNullable<SoundEvent['timeCue']>) {
    if (!(await this.start())) return;
    this.playCue(cue, Tone.now() + 0.03);
  }

  /** Schedule one step's events at audio time `time`, lasting `stepSeconds`. */
  playStep(events: SoundEvent[], time: number, stepSeconds: number, mode: SoundMode) {
    if (!this.built) return;
    let textureSet = false;
    let refSeen = false;
    for (const ev of events) {
      const at = time + ev.offset * stepSeconds;
      const dur = Math.max(0.06, ev.duration * stepSeconds);
      if (ev.kind === 'reference' && ev.midi != null) {
        refSeen = true;
        const f = Tone.Frequency(ev.midi, 'midi').toFrequency();
        if (!this.refOn) { this.refVoice.triggerAttack(f, at, ev.velocity ?? 0.3); this.refOn = true; }
        else this.refVoice.setNote(f, at);
        continue;
      }
      if (ev.kind === 'chord' && ev.chord) {
        if (mode === 'musical') this.harmony.triggerAttackRelease(ev.chord.map((m) => Tone.Frequency(m, 'midi').toFrequency()), dur, at, ev.velocity ?? 0.3);
        continue;
      }
      if (ev.kind === 'system' && ev.midi != null && ev.system) {
        const v = this.systemVoices[this.systemNext++ % this.systemVoices.length];
        v.panner.pan.setValueAtTime(ev.pan ?? 0, at);
        const synth = ev.system.zone === 'tropical' ? v.tropical : v.extratropical;
        synth.triggerAttackRelease(Tone.Frequency(ev.midi, 'midi').toFrequency(), Math.max(0.15, ev.duration * stepSeconds), at, ev.velocity ?? 0.5);
        continue;
      }
      if (ev.kind === 'scan' && ev.midi != null) {
        const slot = this.scanPool[this.scanNext++ % this.scanPool.length];
        slot.panner.pan.setValueAtTime(ev.pan ?? 0, at);
        slot.synth.triggerAttackRelease(Tone.Frequency(ev.midi, 'midi').toFrequency(), Math.min(dur, 0.35), at, ev.velocity ?? 0.5);
        continue;
      }
      if (ev.kind === 'feature' && ev.midi != null) {
        const f = Tone.Frequency(ev.midi, 'midi').toFrequency();
        if (!this.featureOn) { this.featureVoice.triggerAttack(f, at, ev.velocity ?? 0.4); this.featureOn = true; }
        else this.featureVoice.setNote(f, at);
        continue;
      }
      if (ev.kind === 'marker') {
        if (ev.marker === 'turn') { this.markerSynth.triggerAttackRelease('E6', 0.12, at, 0.6); this.markerSynth.triggerAttackRelease('B6', 0.12, at + 0.09, 0.5); }
        else if (ev.marker === 'missing') this.gapSynth.triggerAttackRelease('C2', 0.15, at, 0.5);
        else if ((ev.marker === 'time' || ev.marker === 'checkpoint') && ev.timeCue) this.playCue(ev.timeCue, at);
        // 'year' markers stay in the event list (marker lane) but are heard through the time-cue layer
        else if (ev.marker === 'zero') this.markerSynth.triggerAttackRelease('G6', 0.05, at, 0.5);
        else if (ev.marker === 'extreme') { this.bell.triggerAttackRelease('A5', 0.3, at, 0.55); this.bell.triggerAttackRelease('E6', 0.3, at + 0.14, 0.45); }
        else if (ev.marker === 'region') this.markerSynth.triggerAttackRelease('C7', 0.02, at, 0.18);
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
    if (this.refOn && !refSeen) { this.refVoice.triggerRelease(time); this.refOn = false; }
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
    if (ev.cue === 'thunder') {
      if (this.thunderNoise.state !== 'started') this.thunderNoise.start();
      this.thunderEnv.triggerAttackRelease(Math.min(1.2, stepSeconds * 0.6), at + stepSeconds * 0.1, 0.9);
    } else if (ev.cue === 'wind') {
      if (this.windNoise.state !== 'started') this.windNoise.start();
      const d = Math.min(1.4, stepSeconds * 0.8);
      this.windFilter.frequency.cancelScheduledValues(at);
      this.windFilter.frequency.setValueAtTime(380, at);
      this.windFilter.frequency.linearRampToValueAtTime(1500, at + d);
      this.windEnv.triggerAttackRelease(d, at, 0.8);
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
    this.systemVoices.forEach((v) => { v.tropical.releaseAll(now); v.extratropical.releaseAll(now); });
    if (this.featureOn) { this.featureVoice.triggerRelease(now); this.featureOn = false; }
    if (this.refOn) { this.refVoice.triggerRelease(now); this.refOn = false; }
    this.harmony.releaseAll(now);
    this.thunderEnv.triggerRelease(now);
    this.windEnv.triggerRelease(now);
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
    if (this.refOn) { this.refVoice.triggerRelease(t0 + 1.3); this.refOn = false; }
  }
}

export const engine = new SoundEngine();
