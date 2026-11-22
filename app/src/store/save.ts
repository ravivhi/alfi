import type { KV } from './kv.ts';
import type { NativeBackup } from '../platform/native.ts';
import { freshSave, isSaveData, withSettingDefaults } from './schema.ts';
import type { SaveData } from './schema.ts';

export const KEYS = { primary: 'alfi.app.save', prev: 'alfi.app.save.prev', badPrefix: 'alfi.app.save.bad.' };
const KEEP_BAD = 3;

export type ParsedEnvelope = { ok: true; seq: number; data: SaveData } | { ok: false; reason: 'empty' | 'json' | 'checksum' | 'schema' };

// FNV-1a 32-bit over UTF-16 code units, lower-case hex.
export function checksum(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function makeEnvelope(data: SaveData, seq: number, now: number): string {
  return JSON.stringify({ v: 1, seq, savedAt: now, sum: checksum(JSON.stringify(data)), data });
}

export function parseEnvelope(raw: string | null): ParsedEnvelope {
  if (raw === null || raw === '') return { ok: false, reason: 'empty' };
  let env: unknown;
  try {
    env = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'json' };
  }
  if (typeof env !== 'object' || env === null) return { ok: false, reason: 'json' };
  const e = env as { v?: unknown; seq?: unknown; sum?: unknown; data?: unknown };
  if (e.v !== 1 || typeof e.seq !== 'number' || !Number.isFinite(e.seq) || typeof e.sum !== 'string' || e.data === undefined) return { ok: false, reason: 'schema' };
  if (checksum(JSON.stringify(e.data)) !== e.sum) return { ok: false, reason: 'checksum' };
  if (!isSaveData(e.data)) return { ok: false, reason: 'schema' };
  return { ok: true, seq: e.seq, data: withSettingDefaults(e.data) };
}

function badKeys(kv: KV): string[] {
  const num = (k: string) => Number(k.slice(KEYS.badPrefix.length));
  return kv.keys().filter((k) => k.startsWith(KEYS.badPrefix)).sort((a, b) => num(a) - num(b));
}

// Copy a bad save aside and keep only the newest KEEP_BAD copies. Throws when the copy cannot be written.
function quarantine(kv: KV, raw: string, now: number): string {
  const key = KEYS.badPrefix + now;
  kv.set(key, raw);
  const all = badKeys(kv);
  for (const old of all.slice(0, Math.max(0, all.length - KEEP_BAD))) {
    if (old !== key) kv.remove(old);
  }
  return key;
}

function safeGet(kv: KV, k: string): string | null {
  try {
    return kv.get(k);
  } catch {
    return null;
  }
}

export interface LoadResult { data: SaveData; seq: number; source: 'primary' | 'prev' | 'native' | 'fresh'; quarantined: string[] }

export function loadSave(kv: KV, native: NativeBackup | null, now: number): LoadResult {
  const rawPrimary = safeGet(kv, KEYS.primary);
  const primary = parseEnvelope(rawPrimary);
  const quarantined: string[] = [];
  if (!primary.ok && rawPrimary !== null && rawPrimary !== '') {
    try {
      quarantined.push(quarantine(kv, rawPrimary, now));
      kv.remove(KEYS.primary); // the copy is safe; do not quarantine the same bytes again on save
    } catch {
      /* copy failed: leave the primary where it is */
    }
  }
  let nativeRaw: string | null = null;
  try {
    nativeRaw = native ? native.read() : null;
  } catch {
    nativeRaw = null;
  }
  const candidates: { source: 'primary' | 'prev' | 'native'; env: ParsedEnvelope }[] = [
    { source: 'primary', env: primary },
    { source: 'prev', env: parseEnvelope(safeGet(kv, KEYS.prev)) },
    { source: 'native', env: parseEnvelope(nativeRaw) },
  ];
  let best: LoadResult | null = null;
  for (const c of candidates) {
    if (c.env.ok && (best === null || c.env.seq > best.seq)) best = { data: c.env.data, seq: c.env.seq, source: c.source, quarantined };
  }
  return best ?? { data: freshSave(), seq: 0, source: 'fresh', quarantined };
}

// Writes web storage only. The native backup file is written by scheduleNativeBackup (debounced, and flushed when the
// page hides), never here as well: one save, one file write.
export function saveNow(kv: KV, data: SaveData, seq: number, now: number): { ok: boolean; seq: number } {
  const next = seq + 1;
  const raw = makeEnvelope(data, next, now);
  // A save that would not load back (e.g. NaN becomes null) must never replace a good primary.
  if (!parseEnvelope(raw).ok) return { ok: false, seq };
  try {
    const cur = kv.get(KEYS.primary);
    if (cur !== null && cur !== '') {
      if (parseEnvelope(cur).ok) kv.set(KEYS.prev, cur);
      else quarantine(kv, cur, now);
    }
    kv.set(KEYS.primary, raw);
  } catch {
    return { ok: false, seq };
  }
  return { ok: true, seq: next };
}

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: { native: NativeBackup; getRaw: () => string } | null = null;
let listening = false;

function flush(): void {
  if (timer !== null) { clearTimeout(timer); timer = null; }
  const p = pending;
  pending = null;
  if (!p) return;
  try {
    p.native.write(p.getRaw());
  } catch {
    /* best effort */
  }
}

export function scheduleNativeBackup(native: NativeBackup | null, getRaw: () => string, delayMs = 2000): void {
  if (!native) return;
  pending = { native, getRaw };
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(flush, delayMs);
  if (!listening && typeof document !== 'undefined') {
    listening = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }
}
