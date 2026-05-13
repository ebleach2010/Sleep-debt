'use client';
import { Component, type ReactNode } from 'react';

interface State {
  err: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { err: null };
  static getDerivedStateFromError(err: Error): State {
    return { err };
  }
  componentDidCatch(err: Error) {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.error('[ErrorBoundary]', err);
    }
  }
  render() {
    if (this.state.err) {
      return (
        <main className="max-w-2xl mx-auto px-4 py-8 text-sm">
          <h1 className="text-xl font-semibold mb-3">Something went wrong</h1>
          <pre className="bg-panel border border-bad/40 rounded-xl p-3 whitespace-pre-wrap break-words text-bad">
            {this.state.err.name}: {this.state.err.message}
            {'\n\n'}
            {this.state.err.stack?.split('\n').slice(0, 6).join('\n')}
          </pre>
          <button
            className="mt-3 rounded-xl px-4 py-2 bg-panel2 border border-edge"
            onClick={() => this.setState({ err: null })}
          >
            Try again
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
