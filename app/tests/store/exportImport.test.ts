import { describe, expect, it } from 'vitest';
import { freshSave, newChild } from '../../src/store/schema.ts';
import { applyImport, exportChild, parseImport } from '../../src/store/exportImport.ts';

const kid = newChild('Dana', 4, 'data:image/png;base64,AAA', '2026-01-02', 'c1');
const withKid = { ...freshSave(), children: [kid] };

describe('export / import', () => {
  it('export leaves the photo out unless asked', () => {
    expect(JSON.parse(exportChild(kid, false, '2026-03-04').text).child.photo).toBeNull();
    expect(JSON.parse(exportChild(kid, true, '2026-03-04').text).child.photo).toBe(kid.photo);
  });
  it('file name carries the name and day', () => expect(exportChild(kid, false, '2026-03-04').name).toBe('alfi-Dana-2026-03-04.json'));
  it('round trip', () => expect(parseImport(exportChild(kid, true, '2026-03-04').text)).toEqual({ ok: true, child: kid }));
  it('rejects a foreign or newer file and leaves data unchanged', () => {
    expect(parseImport('{"app":"x"}')).toMatchObject({ ok: false, reason: 'kind' });
    expect(parseImport(JSON.stringify({ app: 'alfi', kind: 'child-export', version: 2, child: kid }))).toMatchObject({ ok: false, reason: 'version' });
    expect(parseImport('nope')).toMatchObject({ ok: false, reason: 'json' });
    expect(parseImport(JSON.stringify({ app: 'alfi', kind: 'child-export', version: 1, child: { id: 1 } }))).toMatchObject({ ok: false, reason: 'shape' });
  });
  it('import replaces the same child id, else appends', () => {
    expect(applyImport(withKid, kid).replaced).toBe(true);
    expect(applyImport(withKid, kid).data.children.length).toBe(1);
    expect(applyImport(freshSave(), kid).data.children.length).toBe(1);
    expect(applyImport(freshSave(), kid).replaced).toBe(false);
  });
});
