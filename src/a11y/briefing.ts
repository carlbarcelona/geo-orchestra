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
  const step = numerical ? 'month' : 'day';
  const normalName = numerical ? 'a normal month' : 'the yearly average';
  const out: BriefSegment[] = [];

  out.push({
    id: 'intro', title: 'Before we start',
    text: numerical
      ? 'Welcome. You are about to hear twenty-five years of rain over the Philippines, measured by NASA satellites, one month at a time. Here is what each sound means.'
      : 'Welcome. You are about to watch and hear an average year of rain, made by NASA from satellite data, one day at a time. Here is what each sound means.',
  });

  if (o.mode === 'musical' && on('melody')) {
    out.push({
      id: 'amount-melody', title: 'Rain amount · piano',
      text: `The piano plays the amount of rain. Here is a ${step} with little rain, then one with a lot of rain. A higher note means more rain, and a louder note means heavier rain.`,
      example: { kind: 'legend', items: ['low', 'high'] },
    });
  }
  if (o.mode === 'geophony' && on('texture')) {
    out.push({
      id: 'amount-texture', title: 'Rain amount · rain sound',
      text: `The sound of rain plays the amount. Here is a light ${step}, then a wet one. More drops and a louder shower mean more rain.`,
      example: { kind: 'legend', items: ['low', 'high'] },
    });
  }

  if (o.reference && on('context')) {
    out.push({
      id: 'normal', title: 'Normal · soft hum',
      text: numerical
        ? `The soft hum is ${normalName}: the ${NORMAL.baseline[0]} to ${NORMAL.baseline[1]} average for the same calendar month. ${o.mode === 'musical' ? 'When the piano is above the hum, the month is wetter than normal. Below the hum, it is drier.' : 'Listen to the rain against it: louder than the hum is wetter than normal, quieter is drier.'}`
        : `The soft hum is ${normalName}. ${o.mode === 'musical' ? 'When the piano is above the hum, it is a wetter time of year. Below the hum, a drier one.' : 'Rain louder than the hum is a wetter time of year, quieter is drier.'}`,
      example: { kind: 'legend', items: ['near-normal'] },
    });
  }
  if (o.mode === 'musical' && o.harmony && on('context')) {
    out.push({
      id: 'chord', title: 'Compared with normal · chord',
      text: 'A chord tells you how it compares. A bright chord means wetter than normal. A dark chord means drier.',
      example: { kind: 'legend', items: ['wetter', 'drier'] },
    });
  }
  if (o.cues && on('context')) {
    out.push({
      id: 'bell', title: 'Unusual · bell',
      text: `A bell marks an unusual ${step}, far from normal.`,
      example: { kind: 'legend', items: ['unusual'] },
    });
    if (o.mode === 'geophony') {
      out.push({
        id: 'thunder-wind', title: 'Much wetter or drier · thunder and wind',
        text: 'Distant thunder means much wetter than normal. A dry wind means much drier.',
        example: { kind: 'legend', items: ['much-wetter', 'much-drier'] },
      });
    }
  }

  if (numerical && on('markers')) {
    out.push({
      id: 'missing', title: 'Missing · thud',
      text: 'A muted thud means a measurement is missing. It is never treated as zero rain.',
      example: { kind: 'legend', items: ['missing'] },
    });
  }

  if (on('time')) {
    out.push({
      id: 'time', title: 'Time · knock',
      text: `A knock marks a new ${numerical ? 'year' : 'month'}. A double knock is a checkpoint that you set by pressing C.`,
      example: { kind: 'cue', items: ['period', 'checkpoint'] },
    });
  }

  if (!numerical && o.imageEnabled && on('image')) {
    if (o.featureVoice) {
      out.push({
        id: 'glide', title: 'Rain band · string glide',
        text: 'The string glide follows the main rain band near the Philippines. A higher glide means the band is farther north.',
        example: o.frameData ? { kind: 'glide' } : undefined,
      });
    }
    if (o.roi) {
      out.push({
        id: 'roi', title: 'Your region · ROI voice',
        text: 'A soft bell plays the rain inside the region you cropped. A higher bell means more rain there, and silence means it is dry.',
        example: o.frameData ? { kind: 'roi' } : undefined,
      });
    }
    out.push({
      id: 'sweep', title: 'The map · sweep',
      text: 'Press S to sweep the map from west to east. A higher note is farther north, a louder note is heavier rain, and silence is dry. A held pad is a rain system the line is crossing.',
    });
  }

  out.push({
    id: 'close', title: 'Remember',
    text: numerical
      ? 'These sounds are designed from NASA satellite estimates. They are not recordings. Enjoy listening.'
      : 'These sounds are designed from NASA images and a reconstructed average, not a particular year, and not recordings. Enjoy listening.',
  });
  return out;
}

/** Identifies what a briefing covers: a new signature (other sounds) means the listener is briefed again. */
export function briefingSignature(workspace: string, mode: string, script: BriefSegment[]): string {
  return `${workspace}|${mode}|${script.map((s) => s.id).join(',')}`;
}

/**
 * Whether playback must be preceded by a briefing. Preset: always, until this exact briefing was heard in this
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
