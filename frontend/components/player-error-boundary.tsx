"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  title?: string;
}

interface State {
  hasError: boolean;
}

export class PlayerErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Player crashed:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-surface-hi px-6 text-center">
          <p className="text-sm text-mist">
            {this.props.title || "The player hit an unexpected error."}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              window.location.reload();
            }}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500"
          >
            Reload player
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
