import { Component, type ErrorInfo, type ReactNode } from 'react';
import { controller } from '../../playback/controller';
import * as I from '../icons';

/**
 * Catches a render error inside a workspace so the header, mode switch and status bar stay usable. Without it a
 * single failing panel unmounts the whole app and the page looks frozen.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    controller.pause('interface error');
    console.error('[GeoOrchestra] a workspace panel failed to render', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main id="main" className="workspace" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="callout danger" role="alert" style={{ maxWidth: 560 }}>
          <I.Warn style={{ flexShrink: 0 }} />
          <div>
            <div className="ttl">This workspace failed to render</div>
            <div className="txt">Playback was paused. Your data and settings are unchanged. {this.state.error.message}</div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn small primary" onClick={() => this.setState({ error: null })}>Try again</button>
              <button className="btn small" onClick={() => window.location.reload()}>Reload the page</button>
            </div>
          </div>
        </div>
      </main>
    );
  }
}
