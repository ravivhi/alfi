import { describe, it, expect } from 'vitest';
import { validateCurriculum, expandPath, itemId, parseItem } from '../../src/engine/curriculum.ts';
import { profileFor, SLICE_STEPS } from '../../src/engine/profiles.ts';
import type { Curriculum } from '../../src/engine/types.ts';
import json from '../../content/curriculum-letters.json';

const c = json as unknown as Curriculum;

describe('curriculum', () => {
  it('letters curriculum is valid', () => expect(validateCurriculum(c, SLICE_STEPS)).toEqual([]));
  it('expands to 6 units and 2 checkpoints, cp after units 3 and 6', () => expect(expandPath(c, '3-5').map(n => n.id)).toEqual(['u:מ','u:ל','u:ב','cp1','u:ת','u:י','u:צ','cp2']));
  it('every unit has the 5 teaching stations (paint right after drive), then all 5 games, the game order rotated per unit', () => {
    const games = ['plane', 'race', 'mole', 'match', 'jump'];
    const units = expandPath(c, '3-5').filter(n => n.type === 'unit');
    units.forEach((n, i) => {
      expect(n.stations!.map(s => s.step)).toEqual(['meet', 'find', 'drive', 'paint', 'firstSound', ...games.slice(i % 5), ...games.slice(0, i % 5)]);
    });
    expect(units.map(n => n.stations![5].step)).toEqual(['plane', 'race', 'mole', 'match', 'jump', 'plane']);
  });
  it('every unit has paint right after drive', () => {
    for (const band of c.bands) {
      const units = expandPath(c, band).filter(n => n.type === 'unit');
      expect(units).toHaveLength(6);
      for (const n of units) {
        const steps = n.stations!.map(s => s.step);
        expect(steps[steps.indexOf('drive') + 1]).toBe('paint');
        expect(steps.filter(s => s === 'paint')).toHaveLength(1);
      }
    }
    expect(c.gameRotation).not.toContain('paint'); // a station with a window, not one of the rotated games
    expect(c.unitPractice!.map(s => s.step)).not.toContain('paint');
    expect(Object.values(c.practice).flat().map(s => s.step)).not.toContain('paint');
  });
  it('$game still resolves to one game by rotation', () => {
    const one: Curriculum = { ...c, unitStations: { '3-5': [{ step: 'meet' }, { step: '$game' }], '6-8': [{ step: 'meet' }, { step: '$game' }] } };
    expect(validateCurriculum(one, SLICE_STEPS)).toEqual([]);
    expect(expandPath(one, '3-5').filter(n => n.type === 'unit').map(n => n.stations!.map(s => s.step).join(','))).toEqual(['meet,plane', 'meet,race', 'meet,mole', 'meet,match', 'meet,jump', 'meet,plane']);
  });
  it('$allGames is allowed only in unit stations; the letter practice may use $game', () => {
    expect(validateCurriculum({ ...c, practice: { ...c.practice, name: [{ step: '$allGames' }] } }, SLICE_STEPS)).toContain('$allGames not allowed here');
    expect(validateCurriculum({ ...c, unitPractice: [{ step: '$allGames' }] }, SLICE_STEPS)).toContain('$allGames not allowed here');
    expect(c.unitPractice!.map(s => s.step)).toEqual(['find', 'soundPick', 'drive', '$game']);
  });
  it('checkpoint nodes carry their block', () => expect(expandPath(c, '3-5')[3].blockUnits).toEqual(['מ','ל','ב']));
  it('rejects unknown step ids', () => expect(validateCurriculum({ ...c, gameRotation: ['rocket'] }, SLICE_STEPS)).toContain('unknown step: rocket'));
  it('profiles hold the table values', () => { expect(profileFor('3-5').findChoices).toBe(3); const race = { targets: 10, timeSec: 60, maxSpeed: 2592, slotSegs: [12, 18], coneChance: 0.2, secondChance: 0.3, coneSlowSec: 1.6, wrongSlowSec: 0.9 }; expect(profileFor('3-5').race).toEqual({ ...race, steerPerSec: 2.2 }); expect(profileFor('6-8').race).toEqual({ ...race, steerPerSec: 3.7 }); expect(profileFor('3-5').timers).toBe(true); expect(profileFor('6-8').timers).toBe(true); expect(profileFor('6-8').unitsPerSitting).toBe(2); const jump = { lives: 5, speed: 140, airSpeed: 170, gravity: 1275, jumpVel: 646, levels: [{ targets: 5, wrong: 3, pits: 1, steps: 1, platforms: 0, rocks: 0 }, { targets: 5, wrong: 4, pits: 2, steps: 1, platforms: 1, rocks: 1 }, { targets: 6, wrong: 5, pits: 2, steps: 2, platforms: 2, rocks: 2 }] }; expect(profileFor('3-5').jump).toEqual(jump); expect(profileFor('6-8').jump).toEqual(jump); });
  it('item ids round-trip', () => { expect(parseItem(itemId('x', 'name'))).toEqual({ unit: 'x', kind: 'name' }); });
});
