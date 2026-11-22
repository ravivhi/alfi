import type { AgeBand, Curriculum, ItemId, PathNode, StationSpec, StepTypeId, UnitId } from './types.ts';

export function itemId(unit: UnitId, kind: string): ItemId {
  return unit + '/' + kind;
}

export function parseItem(id: ItemId): { unit: UnitId; kind: string } {
  const i = id.lastIndexOf('/');
  return { unit: id.slice(0, i), kind: id.slice(i + 1) };
}

export function validateCurriculum(c: Curriculum, knownSteps: StepTypeId[]): string[] {
  const errs: string[] = [];
  const checkStep = (s: StepTypeId): void => {
    if (!knownSteps.includes(s)) errs.push('unknown step: ' + s);
  };
  const checkStations = (list: StationSpec[], allowGame: boolean, allowAllGames: boolean): void => {
    for (const st of list) {
      if (st.step === '$game') {
        if (!allowGame) errs.push('$game not allowed here');
      } else if (st.step === '$allGames') {
        if (!allowAllGames) errs.push('$allGames not allowed here');
      } else checkStep(st.step);
    }
  };
  const isGame = (s: StationSpec): boolean => s.step === '$game' || s.step === '$allGames';
  if (c.version !== 1) errs.push('unsupported version');
  if (!c.units.length) errs.push('no units');
  const ids = new Set<string>();
  for (const u of c.units) {
    if (ids.has(u.id)) errs.push('duplicate unit: ' + u.id);
    ids.add(u.id);
  }
  let needsGame = false;
  for (const band of c.bands) {
    const list = c.unitStations[band];
    if (!list || !list.length) { errs.push('no stations for band ' + band); continue; }
    if (list.some(isGame)) needsGame = true;
    checkStations(list, true, true);
  }
  for (const s of c.gameRotation) checkStep(s);
  if (!(c.checkpoint.everyUnits >= 1)) errs.push('checkpoint.everyUnits must be >= 1');
  checkStep(c.checkpoint.step);
  for (const [kind, step] of Object.entries(c.itemSteps)) {
    if (!c.itemKinds.includes(kind)) errs.push('itemSteps: unknown kind: ' + kind);
    checkStep(step);
  }
  for (const [kind, list] of Object.entries(c.practice)) {
    if (!c.itemKinds.includes(kind)) errs.push('practice: unknown kind: ' + kind);
    checkStations(list, false, false);
  }
  if (c.unitPractice) {
    if (c.unitPractice.some(isGame)) needsGame = true;
    checkStations(c.unitPractice, true, false);
  }
  if (needsGame && !c.gameRotation.length) errs.push('empty gameRotation');
  return errs;
}

export function expandPath(c: Curriculum, band: AgeBand): PathNode[] {
  const out: PathNode[] = [];
  const every = c.checkpoint.everyUnits;
  const games = c.gameRotation;
  c.units.forEach((u, i) => {
    const stations = c.unitStations[band].flatMap(s => {
      const extra = s.params ? { params: s.params } : {};
      // every game, unit i starting with game i mod n, so each unit opens with a different game
      if (s.step === '$allGames') return games.map((_, k) => ({ step: games[(i + k) % games.length], ...extra }));
      return [{ step: s.step === '$game' ? games[i % games.length] : s.step, ...extra }];
    });
    out.push({ id: 'u:' + u.id, type: 'unit', unitId: u.id, stations });
    if ((i + 1) % every === 0) {
      out.push({
        id: 'cp' + (i + 1) / every,
        type: 'checkpoint',
        stations: [{ step: c.checkpoint.step }],
        blockUnits: c.units.slice(i + 1 - every, i + 1).map(x => x.id),
      });
    }
  });
  return out;
}
