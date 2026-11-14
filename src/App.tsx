import { useEffect, useMemo } from 'react';
import { monthLabel } from './data/dataset';
import { currentScanEvents, currentScanGrid, numericalEvents } from './state/actions';
import { FrameScore } from './ui/shared/FrameScore';
import { useStore } from './state/store';
import { DatasetPanel } from './ui/numerical/DatasetPanel';
import { ProjectPanel } from './ui/numerical/ProjectPanel';
import { SoundPanel } from './ui/numerical/SoundPanel';
import { MusicChart } from './ui/shared/MusicChart';
import { Dialogs, Header, LiveRegion, StatusBar, SubBar, useShortcuts } from './ui/shell/Shell';
import { VisualWorkspace } from './ui/visual/VisualWorkspace';
import { PresetSoundPanel, StartPanel } from './ui/preset/PresetPanels';

const MONTH_SPEEDS = [
  { value: 0.5, label: '0.5 month/s' }, { value: 1, label: '1 month/s' }, { value: 2, label: '2 months/s' },
  { value: 4, label: '4 months/s' }, { value: 12, label: '12 months/s' },
];

function NumericalWorkspace() {
  const ds = useStore((s) => s.dataset);
  const selection = useStore((s) => s.selection);
  const cursor = useStore((s) => s.cursor);
  const range = useStore((s) => s.range);
  const speed = useStore((s) => s.speed);
  const cache = useStore((s) => s.eventsCache);
  const events = useMemo(() => (ds && selection ? numericalEvents() : []), [ds, selection, cache]); // eslint-disable-line react-hooks/exhaustive-deps
  const labels = useMemo(() => ds?.months.map((t) => monthLabel(t)) ?? [], [ds]);
  const sound = useStore((s) => s.sound);
  const grid = useMemo(() => (ds?.grid ? currentScanGrid() : null), [ds, cursor]); // eslint-disable-line react-hooks/exhaustive-deps
  const scanEv = useMemo(() => (grid ? currentScanEvents() : []), [grid, sound.scale, sound.pitchLow, sound.pitchHigh]); // eslint-disable-line react-hooks/exhaustive-deps
  const preset = useStore((s) => s.uiMode === 'preset');
  return (
    <main id="main" className={`workspace numerical ${preset ? 'preset' : ''}`} aria-label="Numerical workspace">
      {preset ? <StartPanel /> : <ProjectPanel />}
      <DatasetPanel simple={preset} />
      {preset ? <PresetSoundPanel /> : <SoundPanel />}
      <MusicChart
        events={events} stepLabels={labels} axisTitle="Observation month (UTC)" cursor={cursor} range={range}
        speeds={MONTH_SPEEDS} speed={speed} visibleSteps={12} enabled={!!ds && !!selection && events.length > 0}
        emptyTitle={preset ? 'Press “Start listening” to hear the rainfall' : 'Load observations to generate notes'}
        score={preset ? undefined : {
          label: 'Map score', available: !!grid, events: scanEv,
          node: <FrameScore grid={grid} events={scanEv} tab="numerical" title={`Map score · ${ds ? monthLabel(ds.months[cursor]) : ''} · measured IMERG (0.5° cells)`} emptyText="Load the NASA sample to turn each month's map into a score" />,
        }}
        rightInfo={ds && <span className="muted hide-sm">Range: {monthLabel(ds.months[range[0]])} – {monthLabel(ds.months[range[1]])} · {range[1] - range[0] + 1} months ≈ {Math.round((range[1] - range[0] + 1) / speed)} s</span>}
      />
    </main>
  );
}

export function App() {
  const tab = useStore((s) => s.tab);
  const a11y = useStore((s) => s.a11y);
  useShortcuts();
  useEffect(() => {
    const r = document.documentElement;
    r.dataset.contrast = a11y.highContrast ? 'high' : 'normal';
    r.dataset.large = String(a11y.largeText);
    r.dataset.motion = a11y.reducedMotion ? 'reduced' : 'full';
  }, [a11y]);
  return (
    <div className="app">
      <a href="#main" className="skip-link">Skip to workspace</a>
      <Header />
      <SubBar />
      {tab === 'numerical' ? <NumericalWorkspace /> : <VisualWorkspace />}
      <StatusBar />
      <Dialogs />
      <LiveRegion />
    </div>
  );
}
