"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="text-center p-6">
            <p className="text-lg mb-2">⚠️</p>
            <p className="text-sm font-semibold text-[var(--surface-700)] mb-1">组件加载失败</p>
            <p className="text-xs text-[var(--surface-400)] mb-3">
              {this.state.error?.message || "未知错误"}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="rounded-lg bg-[var(--brand-600)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--brand-700)]"
            >
              重试
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
