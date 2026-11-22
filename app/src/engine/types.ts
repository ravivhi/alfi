export type UnitId = string;
export type ItemId = string; // `${unitId}/${kind}`
export type StepTypeId = string;
export type AgeBand = '3-5' | '6-8';

// '$game': one game of gameRotation, rotated per unit. '$allGames': every game of gameRotation, the order rotated per
// unit (unit i starts with game i mod n). '$allGames' is for unit stations only.
export interface StationSpec { step: StepTypeId | '$game' | '$allGames'; params?: Record<string, unknown> }

export interface Curriculum {
  id: string;
  version: 1;
  bands: AgeBand[];
  itemKinds: string[];
  units: { id: UnitId }[];
  unitStations: Record<AgeBand, StationSpec[]>;
  gameRotation: StepTypeId[];
  checkpoint: { everyUnits: number; step: StepTypeId };
  itemSteps: Record<string, StepTypeId>;
  practice: Record<string, StationSpec[]>;
  // A parent-started sitting on a unit already met plays these on that unit ('$game': one rotating game).
  unitPractice?: StationSpec[];
}

export interface PathNode {
  id: string;
  type: 'unit' | 'checkpoint';
  unitId?: UnitId;
  stations?: { step: StepTypeId; params?: Record<string, unknown> }[];
  blockUnits?: UnitId[];
}

export interface AnswerEvent { item: ItemId; ok: boolean; kind: 'recall' | 'match'; chose?: UnitId; t: number }
// 'failed': a game ran out (its old timer / lives); the station is not done and the same step comes back. failLine is a
// content line id the result window shows and says; the engine treats it as opaque. resume is where a failed game's
// "try again" picks up (a game-defined point, e.g. the dino's level); the runner hands it back as StepContext.resume.
export interface StepResult { outcome: 'done' | 'failed' | 'aborted'; answers: AnswerEvent[]; slips: number; ms: number; failLine?: string; resume?: number }
