/**
 * Installs an in-memory `localStorage` for the test that calls it (undo with `vi.unstubAllGlobals()`). The tests do not
 * rely on the environment's own: Node 25+ ships a `localStorage` global that is not usable without a file.
 */
export function stubStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  const storage: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
  vi.stubGlobal('localStorage', storage);
  return storage;
}
