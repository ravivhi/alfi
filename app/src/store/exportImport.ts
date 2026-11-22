import { isChildRecord } from './schema.ts';
import type { ChildRecord, SaveData } from './schema.ts';

export function exportChild(c: ChildRecord, includePhoto: boolean, today: string): { name: string; text: string } {
  const safe = c.name.replace(/[\\/:*?"<>|\s]+/g, '_') || 'child';
  const child: ChildRecord = { ...c, photo: includePhoto ? c.photo : null };
  return {
    name: 'alfi-' + safe + '-' + today + '.json',
    text: JSON.stringify({ app: 'alfi', kind: 'child-export', version: 1, exportedOn: today, child }),
  };
}

export type ImportResult = { ok: true; child: ChildRecord } | { ok: false; reason: 'json' | 'kind' | 'version' | 'shape' };

export function parseImport(text: string): ImportResult {
  let x: unknown;
  try {
    x = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'json' };
  }
  const o = x as { app?: unknown; kind?: unknown; version?: unknown; child?: unknown } | null;
  if (typeof o !== 'object' || o === null || o.app !== 'alfi' || o.kind !== 'child-export') return { ok: false, reason: 'kind' };
  if (o.version !== 1) return { ok: false, reason: 'version' };
  if (!isChildRecord(o.child)) return { ok: false, reason: 'shape' };
  return { ok: true, child: o.child };
}

export function applyImport(data: SaveData, child: ChildRecord): { data: SaveData; replaced: boolean } {
  const replaced = data.children.some((c) => c.id === child.id);
  const children = replaced ? data.children.map((c) => (c.id === child.id ? child : c)) : [...data.children, child];
  return { data: { ...data, children }, replaced };
}
