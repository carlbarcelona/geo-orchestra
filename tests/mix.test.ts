import { describe, expect, it, vi } from 'vitest';

vi.mock('tone', () => ({}));
vi.mock('../src/sound/engine', () => ({ engine: { start: async () => true, playStep: () => {}, silence: () => {}, setLevels: () => {} } }));

import { MODE_ELEMENTS, mixLevels } from '../src/state/actions';
import { DEFAULT_SOUND, type SoundSettings } from '../src/state/store';

const withMutes = (muted: Partial<SoundSettings['muted']>): SoundSettings => ({ ...DEFAULT_SOUND, muted: { ...DEFAULT_SOUND.muted, ...muted } });

describe('mixLevels', () => {
  it('passes slider levels through when nothing is muted', () => {
    expect(mixLevels(DEFAULT_SOUND)).toEqual(DEFAULT_SOUND.layers);
  });

  it('sends a muted element to zero and leaves the others alone', () => {
    const out = mixLevels(withMutes({ melody: true }));
    expect(out.melody).toBe(0);
    expect(out.texture).toBe(DEFAULT_SOUND.layers.texture);
    expect(out.markers).toBe(DEFAULT_SOUND.layers.markers);
    expect(out.image).toBe(DEFAULT_SOUND.layers.image);
  });

  it('silences everything when every element is muted', () => {
    const all = Object.fromEntries(Object.keys(DEFAULT_SOUND.layers).map((k) => [k, true])) as SoundSettings['muted'];
    const out = mixLevels(withMutes(all));
    expect(Object.values(out).every((v) => v === 0)).toBe(true);
  });

  it('keeps the slider value so unmuting restores it', () => {
    const s = withMutes({ texture: true });
    mixLevels(s);
    expect(s.layers.texture).toBe(DEFAULT_SOUND.layers.texture);
    expect(mixLevels({ ...s, muted: DEFAULT_SOUND.muted }).texture).toBe(DEFAULT_SOUND.layers.texture);
  });

  it('treats settings from older project files (no muted field) as unmuted', () => {
    const legacy = { ...DEFAULT_SOUND, muted: undefined } as unknown as SoundSettings;
    expect(mixLevels(legacy)).toEqual(DEFAULT_SOUND.layers);
  });
});

describe('MODE_ELEMENTS', () => {
  it('lets every mixer layer be muted', () => {
    expect(Object.keys(DEFAULT_SOUND.muted).sort()).toEqual(Object.keys(DEFAULT_SOUND.layers).sort());
  });
  it('lists melody only in Musical and rain texture only in Geophony', () => {
    expect(MODE_ELEMENTS.musical).toContain('melody');
    expect(MODE_ELEMENTS.musical).not.toContain('texture');
    expect(MODE_ELEMENTS.geophony).toContain('texture');
    expect(MODE_ELEMENTS.geophony).not.toContain('melody');
  });
});
