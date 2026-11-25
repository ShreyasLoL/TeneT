'use client';

import { Component, type ReactNode } from 'react';
import { useTenetStore } from '@/lib/store';

type Props = {
  children: ReactNode;
};

type State = {
  failed: boolean;
};

/**
 * Isolates WebGL / Three.js / R3F errors so review routes fall back cleanly
 * to `StaticOrbit` and `/log` data entry is never interrupted.
 */
export class StageErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch() {
    useTenetStore.getState().setQuality({ webgl: 'none', level: 4 });
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}
