export interface KV {
  get(k: string): string | null;
  set(k: string, v: string): void;
  remove(k: string): void;
  keys(): string[];
}

// Reads and writes may throw (private mode, quota); callers decide what a failure means.
export function localKV(): KV {
  return {
    get: (k) => localStorage.getItem(k),
    set: (k, v) => localStorage.setItem(k, v),
    remove: (k) => localStorage.removeItem(k),
    keys: () => {
      const out: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k !== null) out.push(k);
      }
      return out;
    },
  };
}

export function memoryKV(init: Record<string, string> = {}): KV {
  const m = new Map<string, string>(Object.entries(init));
  return {
    get: (k) => (m.has(k) ? (m.get(k) as string) : null),
    set: (k, v) => { m.set(k, v); },
    remove: (k) => { m.delete(k); },
    keys: () => [...m.keys()],
  };
}

// Ask the browser not to evict our storage; failure is fine.
export function requestPersistence(): void {
  try {
    const p = navigator.storage?.persist?.();
    if (p && typeof p.catch === 'function') p.catch(() => undefined);
  } catch {
    /* ignore */
  }
}
