// Vitest setup file
// Provide browser globals for Zustand stores that reference window/document

// Mock requestAnimationFrame / cancelAnimationFrame (jsdom doesn't provide them)
let rafId = 0;
const rafCallbacks = new Map<number, FrameRequestCallback>();

globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
  const id = ++rafId;
  rafCallbacks.set(id, cb);
  // Execute on next microtask to simulate async but still controllable
  Promise.resolve().then(() => {
    const callback = rafCallbacks.get(id);
    if (callback) {
      rafCallbacks.delete(id);
      callback(performance.now());
    }
  });
  return id;
};

globalThis.cancelAnimationFrame = (id: number): void => {
  rafCallbacks.delete(id);
};

// Helper to flush all pending rAF callbacks synchronously (for tests)
(globalThis as Record<string, unknown>).__flushRAF = (): void => {
  const pending = Array.from(rafCallbacks.entries());
  rafCallbacks.clear();
  for (const [, cb] of pending) {
    cb(performance.now());
  }
};

// Mock localStorage
if (!globalThis.localStorage) {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      get length() { return storage.size; },
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
    },
    writable: true,
  });
}
