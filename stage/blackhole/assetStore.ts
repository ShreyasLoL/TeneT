import type { BhAssetBundle } from './bootstrapAssets';

type Listener = (assets: BhAssetBundle | null) => void;

let currentAssets: BhAssetBundle | null = null;
const listeners = new Set<Listener>();

export function setBhAssets(assets: BhAssetBundle | null): void {
  currentAssets = assets;
  for (const fn of listeners) {
    fn(assets);
  }
}

export function getBhAssets(): BhAssetBundle | null {
  return currentAssets;
}

export function subscribeBhAssets(fn: Listener): () => void {
  listeners.add(fn);
  if (currentAssets) fn(currentAssets);
  return () => {
    listeners.delete(fn);
  };
}
