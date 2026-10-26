// In-memory stand-in for an MMKV instance, for tests.
export function createFakeMMKV() {
  const values = new Map<string, string>();
  const listeners = new Set<(key: string) => void>();
  const notify = (key: string) => {
    for (const listener of listeners) {
      listener(key);
    }
  };

  return {
    getString: (key: string) => values.get(key),
    set: (key: string, value: string) => {
      values.set(key, value);
      notify(key);
    },
    remove: (key: string) => {
      const removed = values.delete(key);
      if (removed) {
        notify(key);
      }
      return removed;
    },
    getAllKeys: () => [...values.keys()],
    clearAll: () => {
      const keys = [...values.keys()];
      values.clear();
      keys.forEach(notify);
    },
    trim: () => undefined,
    addOnValueChangedListener: (listener: (key: string) => void) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  };
}
