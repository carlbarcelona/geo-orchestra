import { useState } from 'react';
import { brailleBars, braillePointer } from '../../a11y/braille';
import { useStore } from '../../state/store';

interface Props {
  title: string;
  values: (number | null)[];
  index?: number;          // current position, shown as a pointer line
  summary: string;         // plain-text equivalent (always present)
  cells?: number;
  range?: [number, number];
}

/**
 * A chart written in Unicode braille dots (2 bars × 4 heights per cell). Users of refreshable braille
 * displays can read it by touch; everyone gets the text summary. Hidden from speech when braille charts are off.
 */
export function BrailleChart({ title, values, index, summary, cells = 40, range }: Props) {
  const on = useStore((s) => s.a11y.brailleCharts);
  const [copied, setCopied] = useState(false);
  const bars = brailleBars(values, cells, range);
  const ptr = index != null ? braillePointer(index, values.length, cells) : '';
  return (
    <figure style={{ margin: '0 0 10px' }}>
      <figcaption className="row" style={{ fontSize: 12.5 }}>
        <b>{title}</b>
        <span className="spacer" />
        {on && (
          <button className="btn small ghost" onClick={() => { void navigator.clipboard?.writeText(`${title}\n${bars}\n${ptr}`); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? 'Copied' : 'Copy braille'}
          </button>
        )}
      </figcaption>
      {on && (
        <pre className="braille" lang="und-Brai" style={{ margin: '4px 0', fontSize: 15, lineHeight: 1.25, overflowX: 'auto', overflowY: 'hidden', whiteSpace: 'pre', paddingBottom: 6, color: 'var(--text)', fontFamily: 'var(--mono)' }}>
          {bars}{ptr ? `\n${ptr}` : ''}
        </pre>
      )}
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>{summary}</p>
    </figure>
  );
}
