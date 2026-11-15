/**
 * Optional spoken narration (opt-in: Accessibility → "Speak summaries"). Uses the browser's speech engine when it
 * exists; does nothing otherwise. Each new sentence cancels the previous one so narration never falls behind the music.
 */
export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function speak(text: string) {
  if (!speechAvailable() || !text) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.lang = 'en-US';
    window.speechSynthesis.speak(u);
  } catch { /* speech engine unavailable */ }
}

export function stopSpeaking() {
  if (!speechAvailable()) return;
  try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
}

/** Shorter spoken form of a caption: drop the "you hear …" clause and unit abbreviations a voice reads badly. */
export function spokenForm(caption: string): string {
  return caption
    .split(' · ')
    .filter((p) => !p.startsWith('you hear'))
    .join('. ')
    .replace(/mm\/hr/g, 'millimetres per hour')
    .replace(/mm\/day/g, 'millimetres per day')
    .replace(/\+(\d)/g, 'plus $1')
    .replace(/(^|[\s(])-(\d)/g, '$1minus $2')
    .replace(/ SD/g, ' standard deviations');
}
