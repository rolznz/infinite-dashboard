import { Component, type ReactNode } from "react";

/** Keeps one broken component from blanking the whole page. */
export class ErrorBoundary extends Component<{ fallback?: ReactNode; children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[ui]", error);
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="p-4 text-sm text-destructive">Something went wrong here: {this.state.error.message}</div>
        )
      );
    }
    return this.props.children;
  }
}
