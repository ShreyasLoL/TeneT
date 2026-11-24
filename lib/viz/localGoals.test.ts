import { describe, expect, it } from 'vitest';
import { evaluateLocalGoal, loadLocalGoals, removeLocalGoal, saveLocalGoal } from './localGoals';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => {
      map.delete(k);
    },
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

describe('localGoals', () => {
  it('persists and evaluates a local numeric target via projectPace', () => {
    const store = memoryStorage();
    saveLocalGoal({ trackableKey: 'mass', target: 70, direction: 'down' }, store);
    const loaded = loadLocalGoals(store);
    expect(loaded).toHaveLength(1);

    const entries = [
      { day: '2026-11-10', key: 'mass', version: 1, value: 75 },
      { day: '2026-11-15', key: 'mass', version: 1, value: 74 },
      { day: '2026-11-20', key: 'mass', version: 1, value: 73 },
    ];
    const res = evaluateLocalGoal(loaded[0], entries, [{ key: 'mass', label: 'Morning mass' }]);
    expect(res.label).toBe('Morning mass');
    expect(res.pace.status).toBe('on_track');
    expect(res.latest).toBe(73);

    removeLocalGoal('mass', store);
    expect(loadLocalGoals(store)).toEqual([]);
  });
});
