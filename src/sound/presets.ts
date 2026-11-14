/**
 * Listening presets for Preset mode: curated bundles of SOUND settings only. Applying one never changes the
 * dataset, selection, range or any measurement; it only changes how the same events are voiced.
 */
export type ListeningPresetId =
  | 'compare-normal' | 'rain-sounds' | 'simple-melody'          // numerical
  | 'follow-monsoon' | 'amount-only' | 'visual-rain-sounds';   // visual feed

export interface PresetSound {
  mode: 'musical' | 'geophony';
  instrument: 'soft-piano' | 'strings' | 'synth-pad' | 'marimba';
  reference: boolean;
  harmony: boolean;
  cues: boolean;
  variation: boolean;
  spatialPhrases: boolean;
}
export interface PresetImage { featureVoice: boolean; sweepEveryFrame: boolean }

export interface ListeningPreset {
  id: ListeningPresetId;
  workspace: 'numerical' | 'visual';
  label: string;
  description: string;
  sound: PresetSound;
  image?: PresetImage;
}

export const LISTENING_PRESETS: ListeningPreset[] = [
  {
    id: 'compare-normal', workspace: 'numerical', label: 'Compare with normal',
    description: 'A soft hum plays a normal month; the piano plays this month. Above the hum = wetter, below = drier. A bell marks unusual months.',
    sound: { mode: 'musical', instrument: 'soft-piano', reference: true, harmony: true, cues: true, variation: false, spatialPhrases: false },
  },
  {
    id: 'rain-sounds', workspace: 'numerical', label: 'Rain sounds',
    description: 'Hear the rain itself: more drops = more rain. Distant thunder = much wetter than normal; a dry wind = much drier.',
    sound: { mode: 'geophony', instrument: 'soft-piano', reference: true, harmony: false, cues: true, variation: false, spatialPhrases: false },
  },
  {
    id: 'simple-melody', workspace: 'numerical', label: 'Simple melody',
    description: 'Only the amount: a higher note means more rain. No comparison sounds.',
    sound: { mode: 'musical', instrument: 'soft-piano', reference: false, harmony: false, cues: false, variation: false, spatialPhrases: false },
  },
  {
    id: 'follow-monsoon', workspace: 'visual', label: 'Follow the monsoon',
    description: 'A string glide follows the rain band north and south (higher = farther north). The piano plays Philippine rain against the yearly average.',
    sound: { mode: 'musical', instrument: 'soft-piano', reference: true, harmony: true, cues: true, variation: false, spatialPhrases: false },
    image: { featureVoice: true, sweepEveryFrame: false },
  },
  {
    id: 'amount-only', workspace: 'visual', label: 'Rain amount only',
    description: 'Only the Philippine rain amount, compared with the yearly average. No rain-band voice.',
    sound: { mode: 'musical', instrument: 'soft-piano', reference: true, harmony: true, cues: true, variation: false, spatialPhrases: false },
    image: { featureVoice: false, sweepEveryFrame: false },
  },
  {
    id: 'visual-rain-sounds', workspace: 'visual', label: 'Rain sounds',
    description: 'The seasonal rain as a rain soundscape, with the rain-band voice.',
    sound: { mode: 'geophony', instrument: 'soft-piano', reference: true, harmony: false, cues: true, variation: false, spatialPhrases: false },
    image: { featureVoice: true, sweepEveryFrame: false },
  },
];

export const DEFAULT_PRESET: Record<'numerical' | 'visual', ListeningPresetId> = { numerical: 'compare-normal', visual: 'follow-monsoon' };

export function getPreset(id: string | undefined | null): ListeningPreset | undefined {
  return LISTENING_PRESETS.find((p) => p.id === id);
}

/** True when the current sound settings still equal the preset (so Preset mode can show "custom" otherwise). */
export function matchesPreset(p: ListeningPreset, sound: Partial<PresetSound>, image?: Partial<PresetImage>): boolean {
  const s = p.sound;
  const keys = Object.keys(s) as (keyof PresetSound)[];
  if (keys.some((k) => sound[k] !== s[k])) return false;
  if (p.image && image) return p.image.featureVoice === image.featureVoice && p.image.sweepEveryFrame === image.sweepEveryFrame;
  return true;
}
