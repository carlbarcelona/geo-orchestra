/**
 * The session briefing: a short spoken "commentator" introduction played before the music starts. For each sound
 * that will actually play, it says what the sound stands for, plays an example of it, and says what "higher",
 * "louder" or "more" means. Pure and tested; the player (briefingPlayer.ts) and the modal only perform it.
 *
 * Built from the live sound settings, so it never describes a sound that is off or muted.
 */
import { NORMAL } from '../sound/context';

/** Legend examples (the same events the Audio legend plays; see LegendKind in state/actions.ts). */
export type BriefLegend = 'low' | 'middle' | 'high' | 'zero' | 'missing' | 'near-normal' | 'wetter' | 'much-wetter' | 'drier' | 'much-drier' | 'unusual';
export type BriefExample =
  | { kind: 'legend'; items: BriefLegend[] }
  | { kind: 'cue'; items: ('period' | 'checkpoint')[] }
  | { kind: 'glide' }
  | { kind: 'roi' };

export interface BriefSegment {
  id: string;
  /** short heading shown above the sentence, e.g. "Rain amount" */
  title: string;
  /** what the commentator reads (and the modal highlights word by word) */
  text: string;
  example?: BriefExample;
}

type Layer = 'melody' | 'texture' | 'markers' | 'image' | 'context' | 'time';
export interface BriefingInput {
  workspace: 'numerical' | 'visual';
  mode: 'musical' | 'geophony';
  reference: boolean;
  harmony: boolean;
  cues: boolean;
  muted: Partial<Record<Layer, boolean>>;
  /** visual feed: image features on, and the rain-band voice on */
  imageEnabled?: boolean;
  featureVoice?: boolean;
  /** visual feed: a region of interest is set, so the ROI voice plays */
  roi?: boolean;
  /** visual feed: frame data decoded (the glide example needs it) */
  frameData?: boolean;
}

export function briefingScript(o: BriefingInput): BriefSegment[] {
  const on = (k: Layer) => !o.muted[k];
  const numerical = o.workspace === 'numerical';
  const out: BriefSegment[] = [];

  out.push({
    id: 'intro', title: 'Before we start',
    text: numerical
      ? 'Monthly rainfall over the Philippines.'
      : 'NASA images of an average rainfall year.',
  });

  if (o.mode === 'musical' && on('melody')) {
    out.push({
      id: 'amount-melody', title: 'Rain amount · piano',
      text: 'Higher, louder notes mean more rain.',
      example: { kind: 'legend', items: ['low', 'high'] },
    });
  }
  if (o.mode === 'geophony' && on('texture')) {
    out.push({
      id: 'amount-texture', title: 'Rain amount · rain sound',
      text: 'More drops and louder rain mean more rainfall.',
      example: { kind: 'legend', items: ['low', 'high'] },
    });
  }

  if (o.reference && on('context')) {
    out.push({
      id: 'normal', title: numerical ? `Normal · soft hum (${NORMAL.baseline[0]}–${NORMAL.baseline[1]})` : 'Normal · soft hum',
      text: numerical
        ? `The hum is normal for this month; ${o.mode === 'musical' ? 'above is wetter, below drier.' : 'louder rain means wetter, quieter means drier.'}`
        : `The hum is the yearly average; ${o.mode === 'musical' ? 'above is wetter, below drier.' : 'louder rain means wetter, quieter means drier.'}`,
      example: { kind: 'legend', items: ['near-normal'] },
    });
  }
  if (o.mode === 'musical' && o.harmony && on('context')) {
    out.push({
      id: 'chord', title: 'Compared with normal · chord',
      text: 'Bright chords mean wetter; dark chords, drier.',
      example: { kind: 'legend', items: ['wetter', 'drier'] },
    });
  }
  if (o.cues && on('context')) {
    out.push({
      id: 'bell', title: 'Unusual · bell',
      text: 'A bell marks unusual rainfall.',
      example: { kind: 'legend', items: ['unusual'] },
    });
    if (o.mode === 'geophony') {
      out.push({
        id: 'thunder-wind', title: 'Much wetter or drier · thunder and wind',
        text: 'Thunder means much wetter; dry wind, much drier.',
        example: { kind: 'legend', items: ['much-wetter', 'much-drier'] },
      });
    }
  }

  if (numerical && on('markers')) {
    out.push({
      id: 'missing', title: 'Missing · thud',
      text: 'A thud means missing data, never zero rain.',
      example: { kind: 'legend', items: ['missing'] },
    });
  }

  if (on('time')) {
    out.push({
      id: 'time', title: 'Time · knock (C sets a checkpoint)',
      text: `One knock marks a ${numerical ? 'year' : 'month'}; two, your checkpoint.`,
      example: { kind: 'cue', items: ['period', 'checkpoint'] },
    });
  }

  if (!numerical && o.imageEnabled && on('image')) {
    if (o.featureVoice) {
      out.push({
        id: 'glide', title: 'Rain band · string glide',
        text: 'A higher glide means the rain band is farther north.',
        example: o.frameData ? { kind: 'glide' } : undefined,
      });
    }
    if (o.roi) {
      out.push({
        id: 'roi', title: 'Your region · ROI voice',
        text: 'Higher plucked notes mean more regional rain; silence means dry.',
        example: o.frameData ? { kind: 'roi' } : undefined,
      });
    }
    out.push({
      id: 'sweep', title: 'The map · sweep (S)',
      text: 'Sweep west–east: higher means north, louder means heavier rain, silence means dry. Held pads mark rain systems.',
    });
  }

  out.push({
    id: 'close', title: 'Remember',
    text: numerical
      ? 'These are NASA satellite estimates, not recordings.'
      : 'These are reconstructed seasonal averages, not a historical year or recordings.',
  });
  return out;
}

/** Identifies what a briefing covers: a new signature (other sounds) means the listener is briefed again. */
export function briefingSignature(workspace: string, mode: string, script: BriefSegment[]): string {
  return `${workspace}|${mode}|${script.map((s) => s.id).join(',')}`;
}

/**
 * Whether playback must be preceded by a briefing. Preset: always, until this exact briefing was heard or skipped in this
 * page session. Advanced: the same, unless the listener turned briefings off.
 */
export function needsBriefing(o: { uiMode: 'preset' | 'advanced'; briefAdvanced: boolean; heard: string | undefined; signature: string }): boolean {
  if (!o.signature || o.heard === o.signature) return false;
  return o.uiMode === 'preset' || o.briefAdvanced;
}

export interface WordToken { word: string; start: number; end: number }
/** Split a sentence into words with their character offsets (what speech boundary events report). */
export function tokenize(text: string): WordToken[] {
  const out: WordToken[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}
/** Index of the word at (or just before) a character offset. */
export function wordAt(tokens: WordToken[], charIndex: number): number {
  let i = 0;
  while (i + 1 < tokens.length && tokens[i + 1].start <= charIndex) i++;
  return tokens.length ? i : -1;
}
/** Approximate reading time of a word in ms at speech rate 1 (fallback when the voice gives no word events). */
export function wordMs(word: string): number {
  const letters = word.replace(/[^\p{L}\p{N}]/gu, '').length;
  const pause = /[.,;:!?]$/.test(word) ? 220 : 0;
  return 150 + letters * 48 + pause;
}
