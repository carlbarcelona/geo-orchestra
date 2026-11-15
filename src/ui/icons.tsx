import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 16): SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false,
});

export const Play = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none" /></svg>;
export const Pause = ({ size, ...p }: P) => <svg {...base(size)} {...p}><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /></svg>;
export const Prev = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M6 5v14" /><path d="M19 5 9 12l10 7z" fill="currentColor" /></svg>;
export const Next = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M18 5v14" /><path d="M5 5l10 7-10 7z" fill="currentColor" /></svg>;
export const Loop = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M17 2l3 3-3 3" /><path d="M4 11V9a4 4 0 0 1 4-4h12" /><path d="M7 22l-3-3 3-3" /><path d="M20 13v2a4 4 0 0 1-4 4H4" /></svg>;
export const Save = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 19h16" /></svg>;
export const Open = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>;
export const Access = ({ size, ...p }: P) => <svg {...base(size)} {...p}><circle cx="12" cy="4" r="2" /><path d="M5 8l7 1.5L19 8" /><path d="M12 9.5V14l-3 7M12 14l3 7" /></svg>;
export const Note = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg>;
export const Database = ({ size, ...p }: P) => <svg {...base(size)} {...p}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></svg>;
export const Layers = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></svg>;
export const Pin = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M12 22s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></svg>;
export const Grid = ({ size, ...p }: P) => <svg {...base(size)} {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></svg>;
export const Info = ({ size, ...p }: P) => <svg {...base(size)} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg>;
export const Warn = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17v.5" /></svg>;
export const Link = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>;
export const External = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>;
export const Search = ({ size, ...p }: P) => <svg {...base(size)} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
export const Volume = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></svg>;
export const VolumeOff = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 9v6h4l5 4V5L8 9z" /><path d="m16 9 6 6M22 9l-6 6" /></svg>;
export const Rain = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M7 15a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 17 15z" /><path d="M8 18l-1 2M12 18l-1 2M16 18l-1 2" /></svg>;
export const Wave = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 12h1M7 8v8M10 5v14M13 9v6M16 7v10M19 11v2" /></svg>;
export const Arrows = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4" /></svg>;
export const Image = ({ size, ...p }: P) => <svg {...base(size)} {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></svg>;
export const Video = ({ size, ...p }: P) => <svg {...base(size)} {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m10 9 5 3-5 3z" fill="currentColor" /></svg>;
export const Folder = Open;
export const File = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>;
export const Flask = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3" /></svg>;
export const Plus = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M12 5v14M5 12h14" /></svg>;
export const Check = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="m5 12 5 5L20 7" /></svg>;
export const X = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const Caret = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="m9 6 6 6-6 6" /></svg>;
export const Expand = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>;
export const Roi = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" /></svg>;
export const Chart = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
export const LineChart = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M3 3v18h18" /><path d="m7 15 4-5 4 3 5-7" /></svg>;
export const Filter = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M3 5h18l-7 8v6l-4 2v-8z" /></svg>;
export const Columns = ({ size, ...p }: P) => <svg {...base(size)} {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></svg>;
export const Trash = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>;

export const Sun = ({ size, ...p }: P) => <svg {...base(size)} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></svg>;
export const Moon = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>;

/** Line-drawn globe with an orbit and a sound wave crossing it. Uses currentColor so it follows the theme. */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="logo" fill="none" stroke="currentColor">
      <circle cx="20" cy="20" r="11" strokeWidth="1.4" />
      <path d="M9 20h22M20 9c-4 3.2-4 18.8 0 22M20 9c4 3.2 4 18.8 0 22" strokeWidth="0.9" strokeOpacity="0.55" />
      <ellipse cx="20" cy="20" rx="18.5" ry="6.5" transform="rotate(-22 20 20)" strokeWidth="1.2" strokeDasharray="2.2 2.2" />
      <path d="M6 21.5c2.2-3.6 4.2-3.6 6.2 0s4.2 3.6 6.2 0 4.2-3.6 6.2 0 4.2 3.6 6.2 0 2.7-2.4 3.7-1" strokeWidth="2" strokeLinecap="round" className="logo-wave" />
      <circle cx="35.2" cy="13.6" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
