import { useEffect, useMemo, useRef } from 'react';
import { tokenize } from '../../a11y/briefing';
import { pauseBriefing, replayBriefing, replayBriefingSegment, resumeBriefing, skipBriefing } from '../../state/actions';
import { set, useStore } from '../../state/store';
import * as I from '../icons';

/**
 * The session briefing as a modal: the sentence the commentator is reading, with each word highlighted as it is
 * spoken, and a note while its sound example plays. It closes by itself when the briefing ends.
 * Both modes can pause, replay or skip. Advanced also has a switch to turn briefings off.
 */
export function BriefingModal() {
  const b = useStore((s) => s.briefing);
  const preset = useStore((s) => s.uiMode === 'preset');
  const briefAdvanced = useStore((s) => s.a11y.briefAdvanced);
  const ref = useRef<HTMLDivElement>(null);
  const open = !!b;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !useStore.getState().briefing?.paused) { e.preventDefault(); if (useStore.getState().uiMode === 'preset') pauseBriefing(); else skipBriefing(); }
      // keep Space / arrows / L / S / C from reaching the playback shortcuts while the briefing is open
      if ([' ', 'ArrowLeft', 'ArrowRight', 'l', 'L', 's', 'S', 'c', 'C', 'Home', 'End'].includes(e.key)) e.stopPropagation(); // the default action (e.g. Space on a focused button) still happens
    };
    const onHide = () => { if (document.hidden) pauseBriefing(); };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('visibilitychange', onHide);
    return () => { window.removeEventListener('keydown', onKey, true); document.removeEventListener('visibilitychange', onHide); prev?.focus?.(); };
  }, [open]);

  const seg = b?.script[b.segment];
  const tokens = useMemo(() => (seg ? tokenize(seg.text) : []), [seg]);
  if (!b || !seg) return null;
  const n = b.script.length;
  const example = b.phase === 'example';

  return (
    <div className="dialog-backdrop brief-backdrop">
      <div className="dialog brief" role="dialog" aria-modal="true" aria-labelledby="brief-title" ref={ref}>
        <div className="panel-head">
          <h2 id="brief-title"><I.Note size={18} /> Before you listen</h2>
          <span className="spacer" />
          <span className="chip mono" aria-label={`Part ${b.segment + 1} of ${n}`}>{b.segment + 1} / {n}</span>
        </div>
        <div className="panel-body">
          <div className="brief-steps" aria-hidden="true">
            {b.script.map((s, i) => <span key={s.id} className={i < b.segment ? 'done' : i === b.segment ? 'on' : ''} />)}
          </div>
          <h3 className="brief-title">{seg.title}</h3>
          <p className="brief-text" aria-live="off">
            {tokens.map((t, i) => (
              <span key={i} className={`brief-word ${i < b.word ? 'read' : i === b.word ? 'on' : ''}`}>{t.word} </span>
            ))}
          </p>
          <div className={`brief-example ${example ? 'on' : ''}`} role="status">
            {example ? <><I.Wave size={16} /> Listen: this is the sound</> : seg.example ? <span className="muted">An example plays after this sentence</span> : <span className="muted">&nbsp;</span>}
          </div>
          {/* the whole script, for screen readers and anyone who prefers to read ahead */}
          <details className="brief-all">
            <summary>Read the whole briefing</summary>
            <ol>{b.script.map((s) => <li key={s.id}><b>{s.title}.</b> {s.text}</li>)}</ol>
          </details>
          <div className="row brief-controls">
            {b.paused
              ? <button className="btn primary" onClick={resumeBriefing}><I.Play size={14} /> Resume</button>
              : <button className="btn" onClick={pauseBriefing}><I.Pause size={14} /> Pause</button>}
            <button className="btn" onClick={replayBriefingSegment}>Replay this part</button>
            <span className="spacer" />
            <button className="btn ghost" onClick={skipBriefing}>Skip briefing</button>
          </div>
          {preset
            ? <p className="muted brief-note">Listen to learn what each sound means, or skip the briefing.</p>
            : (
              <label className="row brief-note">
                <input type="checkbox" checked={briefAdvanced} onChange={(e) => set({ a11y: { ...useStore.getState().a11y, briefAdvanced: e.target.checked } })} />
                Brief me before playback in Advanced mode
              </label>
            )}
        </div>
      </div>
    </div>
  );
}

/** "Replay briefing": hear the briefing again at any time (does not start playback). */
export function BriefingButton() {
  const busy = useStore((s) => !!s.briefing);
  return (
    <button className="btn" style={{ width: '100%', marginTop: 6 }} onClick={replayBriefing} disabled={busy} title="Hear what each sound means again">
      <I.Note size={14} /> Replay briefing
    </button>
  );
}
