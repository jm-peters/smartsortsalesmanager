import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-4 border border-amber-500/30">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-black text-slate-100">SmartSort Encountered an Issue</h1>
          <p className="text-xs text-slate-400 mt-2 max-w-xs leading-relaxed">
            Your duka data is safe offline in your phone storage. Tap below to reload the app.
          </p>
          {this.state.error?.message && (
            <div className="mt-3 px-3 py-1.5 bg-slate-800 rounded-lg text-[11px] font-mono text-slate-400 max-w-xs overflow-hidden text-ellipsis whitespace-nowrap border border-slate-700">
              {String(this.state.error.message)}
            </div>
          )}
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-5 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center gap-2 shadow-lg transition active:scale-95"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reload SmartSort</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
