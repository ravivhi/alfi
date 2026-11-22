// @vitest-environment happy-dom
// Dino jumper (old app's dino): the pure level builder, then play with fake timers and a fake rAF. The bot reads the
// course from the DOM and hops by the exported constants; tests that need a particular course pick the seed whose
// first hazard is the one they need.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { StepContext, StepModule } from '../../src/steps/contract.ts';
import type { StepResult } from '../../src/engine/types.ts';
import { jumpStep, JUMP, buildLevel, moveAhead, groundAt, PIT_MIN_W, PIT_MAX_W, JUMP_THEMES, themeForLevel, LAVA_TOP } from '../../src/steps/jump.ts';
import { contrastRatio } from '../../src/util/contrast.ts';
import type { Level } from '../../src/steps/jump.ts';
import { REGISTRY } from '../../src/steps/registry.ts';
import { profileFor, SLICE_STEPS } from '../../src/engine/profiles.ts';
import type { PlannedStep } from '../../src/engine/planner.ts';
import { CONTENT } from '../../src/content/index.ts';
import { line } from '../../src/audio/lines.ts';
import { createRng } from '../../src/util/rng.ts';
import { expectSameLook } from './faceCheck.ts';
import type { FaceSeen } from './faceCheck.ts';
import type { AudioApi } from '../../src/audio/audio.ts';
import { createDinoBot, dinoAt, readCourse } from './jumpBot.ts';
import type { Thing } from './jumpBot.ts';

const T = 'ב';
const NAME = (u: string) => CONTENT.alphabet[u].name;
const FRAME = 16;
const GY = JUMP.groundY;
const CFG = profileFor('3-5').jump;
const LEVELS = CFG.levels;

let said: string[];
let instructions: string[];
let stage: HTMLElement;
let sfx: string[];

function makeCtx(seed = 3, signal?: AbortSignal, resume?: number): StepContext {
  const audio = {
    ready: Promise.resolve(),
    say: (t: string) => { said.push(t); return Promise.resolve(); },
    stop() { /* not used */ },
    setVoiceVolume() { /* not used */ },
    status: () => 'live' as const,
    onStatusChange: () => () => undefined,
  };
  return {
    step: { kind: 'station', step: 'jump', unitId: T, items: [T + '/name'] } as PlannedStep,
    profile: profileFor('3-5'),
    content: CONTENT,
    rng: createRng(seed),
    stage,
    signal: signal ?? new AbortController().signal,
    audio: audio as unknown as AudioApi,
    sfx: { play: (n: string) => { sfx.push(n); }, setVolume() { /* not used */ } } as unknown as StepContext['sfx'],
    taught: ['מ', 'ל'],
    confusions: () => [],
    setInstruction: (text) => { instructions.push(text); said.push(text); return Promise.resolve(); },
    progress: () => undefined,
    ...(resume !== undefined ? { resume } : {}),
  };
}

function start(m: StepModule, ctx: StepContext): { result: () => StepResult | null; p: Promise<StepResult> } {
  let r: StepResult | null = null;
  const p = m.run(ctx);
  void p.then(x => { r = x; });
  return { result: () => r, p };
}

function freshStage(): void {
  document.body.replaceChildren();
  stage = document.createElement('div');
  document.body.appendChild(stage);
  said = []; instructions = []; sfx = [];
}

const all = (sel: string) => Array.from(stage.querySelectorAll(sel)) as HTMLElement[];
const one = (sel: string) => stage.querySelector(sel) as HTMLElement;
const num = (el: HTMLElement, k: string) => Number(el.dataset[k]);
const count = (n: string) => sfx.filter(x => x === n).length;
const hearts = () => all('[data-heart][data-full]').length;
const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

const dino = () => dinoAt(stage);
const tap = () => one('[data-step="jump"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));

/** The course as drawn (letters, rocks, pits, step-ups), sorted by x. */
const course = () => readCourse(stage, T);
const firstHazard = (c: Thing[]) => c.find(t => t.kind !== 'target')!;

/** The first seed (from `from`) whose freshly built course passes pred. */
async function findSeed(pred: (c: Thing[]) => boolean, resume?: number, from = 1): Promise<number> {
  for (let seed = from; seed < from + 300; seed++) {
    freshStage();
    const ac = new AbortController();
    start(jumpStep, makeCtx(seed, ac.signal, resume));
    const ok = pred(course());
    ac.abort();
    await advance(1);
    if (ok) return seed;
  }
  throw new Error('no seed');
}

beforeEach(() => {
  freshStage();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date', 'performance'] });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('jump: the level builder (old LV and build)', () => {
  const kinds = (lv: Level) => {
    const n = (k: string) => lv.kinds.filter(x => x === k).length;
    return { targets: n('target') + n('platform'), wrong: n('wrong'), pits: n('pit'), steps: n('step'), platforms: n('platform'), rocks: n('rock') };
  };

  it('buildLevel follows the old table for each level (targets, wrong letters, pits, step-ups, platforms, rocks)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      LEVELS.forEach((cfg, i) => {
        const lv = buildLevel(cfg, createRng(seed * 7 + i));
        expect(kinds(lv)).toEqual(cfg);
        expect(lv.items.filter(it => it.target)).toHaveLength(cfg.targets);
        expect(lv.items.filter(it => !it.target)).toHaveLength(cfg.wrong);
        expect(lv.pits).toHaveLength(cfg.pits);
        expect(lv.steps).toHaveLength(cfg.steps);
        expect(lv.plats).toHaveLength(cfg.platforms);
        expect(lv.rocks).toHaveLength(cfg.rocks);
        // old geometry: ground from -600, the first element at 520, the door 640 past the last, the ground 900 past it
        expect(lv.ground[0].x0).toBe(-600);
        expect(Math.min(...lv.items.map(it => it.x))).toBe(520);
        expect(lv.ground[lv.ground.length - 1].x1).toBe(lv.door.x + 900);
        expect(lv.door.open).toBe(false);
        for (const it of lv.items) {
          const hgt = GY - it.y;
          if (!it.target) expect(hgt).toBe(40);
          else if (it.onPlatform) expect(hgt).toBe(160);
          else expect([48, 130]).toContain(hgt);
        }
        lv.rocks.forEach(r => expect([r.w, r.h, r.y]).toEqual([46, 40, GY]));
        lv.plats.forEach(p => {
          expect([p.w, p.y]).toEqual([124, GY - 118]);
          expect(lv.items.some(it => it.onPlatform && it.x === p.x + 62 && it.y === GY - 160)).toBe(true);
        });
      });
    }
  });

  it('pits are 80-96 wide (owner 2026-11-22: the wide ones narrower, never narrower than the narrow ones) and step-ups 60 high', () => {
    const widths: number[] = [];
    for (let seed = 1; seed <= 60; seed++) {
      for (const cfg of LEVELS) {
        const lv = buildLevel(cfg, createRng(seed));
        for (const p of lv.pits) {
          widths.push(p.x1 - p.x0);
          expect(p.x1 - p.x0).toBeGreaterThanOrEqual(PIT_MIN_W);
          expect(p.x1 - p.x0).toBeLessThanOrEqual(PIT_MAX_W);
        }
        for (const s of lv.steps) {
          expect(s.x1 - s.x0).toBeGreaterThanOrEqual(260);
          expect(s.x1 - s.x0).toBeLessThanOrEqual(320);
          const g = lv.ground.find(q => q.x0 === s.x0)!;
          expect(GY - g.y).toBe(60);
        }
        // the ground is at GY everywhere else, with a gap only at the pits
        lv.ground.filter(q => !lv.steps.some(s => s.x0 === q.x0)).forEach(q => expect(q.y).toBe(GY));
        expect(lv.ground.length).toBe(1 + lv.pits.length + 2 * lv.steps.length);
      }
    }
    // the old draw was 80-105; its widest third (97-105) is now the narrowest pit, so no pit is wider than 96
    expect(PIT_MIN_W).toBe(80);
    expect(PIT_MAX_W).toBe(96);
    expect(Math.max(...widths)).toBeLessThanOrEqual(96);
    expect(Math.min(...widths)).toBe(80);
    // about a third of the old draws were 97-105 and are 80 now: well over a quarter of the pits are 80 wide
    expect(widths.filter(w => w === 80).length / widths.length).toBeGreaterThan(0.25);
  });

  it('every pit of every level is cleared by a simulated hop, with margin (owner 2026-11-22: narrower wide pits)', () => {
    // the game's step: 1/60 s, airSpeed forward, gravity down from jumpVel up; the hop lands when it is back at ground
    const hop = (takeoff: number): number => {
      let x = takeoff, y = 0, vy = -CFG.jumpVel;
      for (let n = 0; n < 600; n++) {
        const d = 1 / 60;
        x += CFG.airSpeed * d;
        vy += CFG.gravity * d;
        y += vy * d;
        if (y >= 0 && vy > 0) return x;
      }
      return x;
    };
    for (let seed = 1; seed <= 100; seed++) {
      LEVELS.forEach((cfg, i) => {
        const lv = buildLevel(cfg, createRng(seed * 13 + i));
        for (const p of lv.pits) {
          // a late take-off right at the edge and an early one 40 units before it both land on the far ground,
          // the dino's whole foot (16 units, as the game's look-ahead) beyond the pit
          for (const t of [p.x0 - 2, p.x0 - 40]) {
            const land = hop(t);
            expect(land, `seed ${seed} level ${i + 1} pit ${p.x0}-${p.x1} from ${t}`).toBeGreaterThan(p.x1 + 16);
            expect(groundAt(lv, land)).toBe(GY);
          }
        }
      });
    }
  });

  it('the first element is a target, no two targets are adjacent and no three targets in a row share a height', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const cfg of LEVELS) {
        const lv = buildLevel(cfg, createRng(seed));
        expect(lv.kinds[0]).toBe('target');
        const isT = (k: string) => k === 'target' || k === 'platform';
        lv.kinds.forEach((k, i) => { if (i && isT(k)) expect(isT(lv.kinds[i - 1]), `${seed} ${lv.kinds.join(',')}`).toBe(false); });
        const hs = lv.items.filter(it => it.target).sort((a, b) => a.x - b.x).map(it => GY - it.y);
        for (let i = 2; i < hs.length; i++) expect(hs[i] === hs[i - 1] && hs[i] === hs[i - 2], `${seed} ${hs.join(',')}`).toBe(false);
      }
    }
  });

  it('a missed target moves ahead, 200 apart, heights alternating', () => {
    const lv = buildLevel(LEVELS[2], createRng(5));
    const door0 = lv.door.x;
    const ts = lv.items.filter(it => it.target).sort((a, b) => a.x - b.x);
    const hero = ts[0].x + 71;
    moveAhead(lv, ts[0], hero);
    moveAhead(lv, ts[1], hero);
    moveAhead(lv, ts[2], hero);
    expect(ts.slice(0, 3).map(t => t.x)).toEqual([door0 - 110, door0 - 310, door0 - 510]);
    expect(ts.slice(0, 3).map(t => GY - t.y)).toEqual([48, 130, 48]);
    expect(ts.slice(0, 3).every(t => t.moved && !t.onPlatform)).toBe(true);
    expect(lv.door.x).toBe(door0);
    // near the door there is no room behind it: 260 ahead of the dino, and the door and the ground move on
    const near = lv.door.x - 200;
    moveAhead(lv, ts[3], near);
    expect(ts[3].x).toBe(near + 260);
    expect(GY - ts[3].y).toBe(130);
    expect(lv.door.x).toBe(near + 400);
    expect(lv.ground[lv.ground.length - 1].x1).toBe(lv.door.x + 900);
  });
});

describe('jump: wiring', () => {
  it('is registered, part of the slice, with the old values for both bands', () => {
    expect(REGISTRY.jump).toBe(jumpStep);
    expect(SLICE_STEPS).toContain('jump');
    expect(profileFor('3-5').allowedSteps).toContain('jump');
    expect(profileFor('6-8').jump).toEqual(profileFor('3-5').jump);
    expect(CFG).toMatchObject({ lives: 5, speed: 140, airSpeed: 170 });
  });

  it('the hop is 15% lower with the same air time and reach (owner 2026-11-21), and still clears every feature of the 3 levels', () => {
    const OLD = { v: 760, g: 1500 };
    const apex = (v: number, g: number): number => v * v / (2 * g);
    const air = (v: number, g: number): number => 2 * v / g;
    expect(Math.abs(apex(CFG.jumpVel, CFG.gravity) / apex(OLD.v, OLD.g) - 0.85)).toBeLessThan(0.02);
    expect(air(CFG.jumpVel, CFG.gravity)).toBeCloseTo(air(OLD.v, OLD.g), 6);
    expect(CFG.airSpeed * air(CFG.jumpVel, CFG.gravity)).toBeCloseTo(CFG.airSpeed * air(OLD.v, OLD.g), 6);
    // a simulated hop (the step the game uses) reaches the apex and lands after the same time
    let up = 0, vy = CFG.jumpVel, top = 0;
    for (let n = 0; n < 300; n++) { vy -= CFG.gravity / 60; up += vy / 60; top = Math.max(top, up); if (up <= 0) break; }
    expect(Math.abs(top / apex(OLD.v, OLD.g) - 0.85)).toBeLessThan(0.03);
    // the tallest step-up / rock / platform of each level, with a margin of 10% of the new apex
    const newApex = apex(CFG.jumpVel, CFG.gravity);
    for (const [i, lv] of LEVELS.entries()) {
      const tallest = Math.max(lv.steps ? JUMP.stepUp : 0, lv.rocks ? JUMP.rockH : 0, lv.platforms ? JUMP.platTop : 0);
      expect(newApex - tallest, `level ${i + 1}`).toBeGreaterThanOrEqual(0.1 * newApex);
    }
  });
});

describe('jump: themes (owner 2026-11-22: "add two more background and terrain types. desertish, and snowish")', () => {
  it('three themes, volcano valley, desert and snow; the level picks one, so every game reaches all three', () => {
    expect(JUMP_THEMES.map(t => t.id)).toEqual(['volcano', 'desert', 'snow']);
    expect(LEVELS.map((_, i) => themeForLevel(i).id)).toEqual(['volcano', 'desert', 'snow']);
    expect(themeForLevel(3).id).toBe('volcano');
    // each theme has its own sky, ground and scenery
    for (const k of ['sky', 'far', 'hills', 'plants'] as const) expect(new Set(JUMP_THEMES.map(t => t[k])).size).toBe(3);
    expect(new Set(JUMP_THEMES.map(t => t.ground.top)).size).toBe(3);
    for (const t of JUMP_THEMES) {
      for (const k of ['far', 'hills', 'plants'] as const) expect(t[k]).toMatch(/^url\("data:image\/svg\+xml,/);
      // the lava pit stays readable: its bright top against the pit walls (the theme's soil)
      expect(contrastRatio(t.ground.soil, LAVA_TOP), t.id).toBeGreaterThanOrEqual(3);
    }
    // desert: sand and cacti; snow: snow ground, a white crest on the ground and pines and a snowman
    const desert = JUMP_THEMES[1], snow = JUMP_THEMES[2];
    expect(decodeURIComponent(desert.plants)).toContain('data-cactus');
    expect(decodeURIComponent(snow.plants)).toContain('data-pine');
    expect(decodeURIComponent(snow.plants)).toContain('data-snowman');
    expect(snow.ground.top).toBe('#FFFFFF');
  });

  it('each level is drawn in its theme without errors: sky, scenery, ground and platforms', async () => {
    for (const lv of [0, 1, 2]) {
      freshStage();
      const errors = vi.spyOn(console, 'error');
      const ac = new AbortController();
      start(jumpStep, makeCtx(5, ac.signal, lv));
      const bot = createDinoBot(stage, T);
      for (let i = 0; i < 120; i++) { bot.tick(); await advance(FRAME); }
      const th = themeForLevel(lv);
      const arena = one('[data-step="jump"]');
      expect(arena.dataset.theme).toBe(th.id);
      expect(arena.style.background.replace(/\s/g, '')).toBe(th.sky.replace(/\s/g, ''));
      const scenery = all('[data-scenery]');
      expect(scenery.map(e => e.dataset.scenery)).toEqual(['far', 'hills', 'plants']);
      scenery.forEach(e => { expect(e.style.backgroundImage).toContain('data:image/svg+xml'); expect(e.style.backgroundRepeat).toBe('repeat-x'); });
      // the theme's own pictures (the encoded SVG inside url("..."))
      (['far', 'hills', 'plants'] as const).forEach((k, i) => expect(scenery[i].style.backgroundImage).toContain(th[k].slice(th[k].indexOf('data:'), -2)));
      for (const g of all('[data-ground]')) { expect(g.innerHTML).toContain(th.ground.soil); expect(g.innerHTML).toContain(th.ground.top); }
      for (const p of all('[data-plat]')) expect(p.innerHTML).toContain(th.plat.body);
      expect(errors).not.toHaveBeenCalled();
      ac.abort();
      await advance(1);
      errors.mockRestore();
    }
  });
});

describe('jump: faces', () => {
  /** Every sign face of every level for many seeds (built, not played): one shared run. */
  function faceStats(seeds = 40): { target: FaceSeen[]; other: FaceSeen[] } {
    const target: FaceSeen[] = [], other: FaceSeen[] = [];
    for (let seed = 1; seed <= seeds; seed++) {
      for (let lv = 0; lv < LEVELS.length; lv++) {
        freshStage();
        const ac = new AbortController();
        start(jumpStep, makeCtx(seed, ac.signal, lv));
        for (const s of all('[data-sign]')) {
          const f = s.querySelector('.pick-face') as HTMLElement;
          (f.textContent === T ? target : other).push({ target: f.textContent === T, bg: f.dataset.bg!, scale: Number(f.dataset.scale) });
        }
        ac.abort();
      }
    }
    return { target, other };
  }

  it('jump: targets are drawn like the other letters (colour and scale frequencies, chi-square, >= 300 target faces); every face is a plain pick-face', async () => {
    expectSameLook(faceStats());
    freshStage();
    start(jumpStep, makeCtx(4));
    await advance(FRAME);
    const faces = all('[data-sign] .pick-face');
    expect(new Set(faces.map(f => f.className))).toEqual(new Set(['pick-face']));
    // the ring is the same for every letter (the old #0D2A5C)
    faces.forEach(f => expect(f.getAttribute('style')).toContain('#0D2A5C'));
  });
});

describe('jump: play', () => {
  it('a step-up stops a dino that does not hop and a hop climbs it', async () => {
    const seed = await findSeed(c => firstHazard(c).kind === 'step');
    freshStage();
    start(jumpStep, makeCtx(seed));
    await advance(FRAME);
    const st = firstHazard(course());
    let still = 0, lastX = NaN;
    for (let i = 0; i < 3000 && still < 60; i++) {
      await advance(FRAME);
      const x = dino().x;
      still = Math.abs(x - lastX) < 1e-6 && x > 300 ? still + 1 : 0;
      lastX = x;
    }
    expect(still).toBe(60);
    expect(dino().x).toBeGreaterThan(st.x - 16 - 4);
    expect(dino().x).toBeLessThanOrEqual(st.x - 16 + 0.01);
    expect(dino().y).toBe(GY);
    expect(hearts()).toBe(5);
    tap();
    await advance(1500);
    expect(dino().y).toBe(GY - 60);
    expect(dino().x).toBeGreaterThan(st.x);
    expect(count('jump')).toBe(1);
  });

  it('a fall into a pit costs a life and a slip, no answer, and restarts 2 s back on the trail', async () => {
    const seed = await findSeed(c => firstHazard(c).kind === 'pit');
    freshStage();
    const run = start(jumpStep, makeCtx(seed));
    const pit = firstHazard(course());
    const hist: { t: number; x: number }[] = [];
    let t = 0, lossT = -1;
    for (let i = 0; i < 4000 && count('ouch') === 0; i++) {
      await advance(FRAME);
      hist.push({ t, x: dino().x });
      t += FRAME / 1000;
      if (count('ouch')) lossT = t - FRAME / 1000;
    }
    expect(count('ouch')).toBe(1);
    expect(hearts()).toBe(4);
    expect(dino().x).toBeGreaterThan(pit.x - 20);
    expect(one('[data-dino]').hasAttribute('data-ouch')).toBe(true);
    // the blink lasts 1 s, then the dino stands on the trail point at least 2 s before the fall
    await advance(1000 + FRAME);
    expect(one('[data-dino]').hasAttribute('data-ouch')).toBe(false);
    const back = dino();
    const xAt = (s: number) => hist.reduce((b, p) => (Math.abs(p.t - s) < Math.abs(b.t - s) ? p : b)).x;
    expect(back.y).toBe(GY);
    expect(back.x).toBeLessThanOrEqual(xAt(lossT - 2) + 0.5);
    expect(back.x).toBeGreaterThanOrEqual(xAt(lossT - 2.15) - 0.5);
    // it waits 1 s before running on
    await advance(800);
    expect(dino().x).toBe(back.x);
    // a child who never hops falls again and again: every fall a slip, never an answer
    for (let i = 0; i < 2000 && !run.result(); i++) await advance(50);
    const r = run.result()!;
    expect(r).toMatchObject({ outcome: 'failed', answers: [], slips: 5 });
    expect(count('ouch')).toBe(5);
  });

  it('a rock costs a life', async () => {
    const seed = await findSeed(c => firstHazard(c).kind === 'rock', 1);
    freshStage();
    const ac = new AbortController();
    start(jumpStep, makeCtx(seed, ac.signal, 1));
    const rock = firstHazard(course());
    for (let i = 0; i < 4000 && count('ouch') === 0; i++) await advance(FRAME);
    expect(count('ouch')).toBe(1);
    expect(hearts()).toBe(4);
    expect(Math.abs(dino().x - rock.x)).toBeLessThan(JUMP.rockW / 2 + 12);
    ac.abort();
  });

  it('a wrong letter costs a life and a slip, not an answer, and comes back after 1.2 s', async () => {
    const seed = await findSeed(c => firstHazard(c).kind === 'wrong');
    freshStage();
    const run = start(jumpStep, makeCtx(seed));
    const wrong = firstHazard(course());
    const sign = () => all('[data-sign]').find(s => s.dataset.seq === wrong.seq)!;
    for (let i = 0; i < 4000 && count('ouch') === 0; i++) await advance(FRAME);
    expect(count('ouch')).toBe(1);
    expect(hearts()).toBe(4);
    expect(sign().hasAttribute('data-dead')).toBe(true);
    await advance(1100);
    expect(sign().hasAttribute('data-dead')).toBe(true);
    await advance(200);
    expect(sign().hasAttribute('data-dead')).toBe(false);
    expect(sign().textContent).not.toBe(T);
    for (let i = 0; i < 2000 && !run.result(); i++) await advance(50);
    expect(run.result()).toMatchObject({ outcome: 'failed', answers: [], slips: 5 });
  });

  it('five losses resolve failed with failLine jump.noLives and keep the answers before it', async () => {
    const seed = await findSeed(c => c[0].kind === 'target' && ['pit', 'wrong'].includes(firstHazard(c).kind));
    freshStage();
    const run = start(jumpStep, makeCtx(seed));
    const first = course()[0];
    const bot = createDinoBot(stage, T);
    for (let i = 0; i < 6000 && !run.result(); i++) {
      // the bot hops only for the first target, then lets the dino run into the first hazard
      if (count('good') === 0) bot.tick(t => t.seq === first.seq);
      await advance(FRAME);
    }
    const r = run.result()!;
    expect(r.outcome).toBe('failed');
    expect(r.failLine).toBe('jump.noLives');
    expect(r.answers).toHaveLength(1);
    expect(r.answers[0]).toMatchObject({ item: T + '/name', ok: true, kind: 'recall' });
    expect(r.slips).toBe(5);
    expect(r.resume).toBe(0);
    expect(hearts()).toBe(0);
    expect(line(CONTENT, 'jump.noLives')).toBe('אוי! נגמרו הלבבות');
  });

  it('try again resumes at the level where the hearts ran out: ctx.resume starts that level with 5 new hearts, and a fail there reports it', async () => {
    const seed = await findSeed(c => ['pit', 'wrong', 'rock'].includes(firstHazard(c).kind), 1);
    freshStage();
    const run = start(jumpStep, makeCtx(seed, undefined, 1));
    expect(one('[data-step="jump"]').dataset.level).toBe('1');
    expect(all('[data-level-dot][data-on]').map(d => d.dataset.levelDot)).toEqual(['0']);
    expect(hearts()).toBe(5);
    const c = course();
    expect(c.filter(t => t.kind === 'target')).toHaveLength(LEVELS[1].targets);
    expect(c.filter(t => t.kind === 'wrong')).toHaveLength(LEVELS[1].wrong);
    expect(all('[data-plat]')).toHaveLength(LEVELS[1].platforms);
    expect(all('[data-slot]')).toHaveLength(LEVELS[1].targets);
    for (let i = 0; i < 3000 && !run.result(); i++) await advance(50);
    expect(run.result()).toMatchObject({ outcome: 'failed', failLine: 'jump.noLives', resume: 1, slips: 5 });
  });

  it("collecting the level's targets opens the door; reaching it shows the level card; its button builds level 2", async () => {
    const run = start(jumpStep, makeCtx(2));
    await advance(FRAME);
    expect(instructions[0]).toBe(line(CONTENT, 'jump.ask', { name: NAME(T) }));
    const bot = createDinoBot(stage, T);
    let openedAt = -1;
    for (let i = 0; i < 8000 && !one('[data-level-card]'); i++) {
      bot.tick();
      await advance(FRAME);
      if (openedAt < 0 && one('[data-door]').dataset.open === '1') {
        openedAt = i;
        expect(count('good')).toBe(LEVELS[0].targets);
        expect(count('door')).toBe(0);
        await advance(500);
        expect(count('door')).toBe(1);
        expect(said).toContain(line(CONTENT, 'jump.door'));
      }
      if (openedAt < 0) expect(one('[data-door]').dataset.open).toBe('0');
    }
    expect(run.result()).toBeNull();
    expect(openedAt).toBeGreaterThan(0);
    expect(hearts()).toBe(5);
    const card = one('[data-level-card]');
    expect(card).not.toBeNull();
    expect(count('fanfare')).toBe(1);
    expect(said).toContain(line(CONTENT, 'jump.level'));
    expect(all('[data-confetti]')).toHaveLength(1);
    expect(dino().x).toBeGreaterThanOrEqual(num(one('[data-door]'), 'x') - 12);
    // one big green button, the dino on the map moves from the done dot to the next
    const buttons = Array.from(card.querySelectorAll('button')) as HTMLElement[];
    expect(buttons).toHaveLength(1);
    expect(parseInt(buttons[0].style.minHeight, 10)).toBeGreaterThanOrEqual(96);
    expect(buttons[0].querySelector('svg')).not.toBeNull();
    const who = card.querySelector('[data-map-dino]') as HTMLElement;
    expect(who.dataset.at).toBe('0');
    await advance(350);
    expect(who.dataset.at).toBe('1');
    // taps on the card are not hops
    const hops = count('jump');
    tap();
    await advance(200);
    expect(count('jump')).toBe(hops);
    const asks = instructions.length;
    buttons[0].click();
    buttons[0].click();
    await advance(FRAME);
    expect(one('[data-level-card]')).toBeNull();
    expect(one('[data-step="jump"]').dataset.level).toBe('1');
    expect(one('[data-step="jump"]').dataset.theme).toBe('desert');
    expect(one('[data-scenery="plants"]').style.backgroundImage).toContain('data-cactus');
    expect(one('[data-ground]').innerHTML).toContain(themeForLevel(1).ground.soil);
    expect(instructions.length).toBe(asks + 1);
    expect(instructions[instructions.length - 1]).toBe(line(CONTENT, 'jump.ask', { name: NAME(T) }));
    const c = course();
    expect(c.filter(t => t.kind === 'target')).toHaveLength(LEVELS[1].targets);
    expect(c.filter(t => t.kind === 'wrong')).toHaveLength(LEVELS[1].wrong);
    expect(c.filter(t => t.kind === 'pit')).toHaveLength(LEVELS[1].pits);
    expect(c.filter(t => t.kind === 'step')).toHaveLength(LEVELS[1].steps);
    expect(c.filter(t => t.kind === 'rock')).toHaveLength(LEVELS[1].rocks);
    expect(all('[data-plat]')).toHaveLength(LEVELS[1].platforms);
    expect(one('[data-door]').dataset.open).toBe('0');
    expect(all('[data-slot]')).toHaveLength(LEVELS[1].targets);
    expect(all('[data-slot][data-full]')).toHaveLength(0);
    expect(all('[data-level-dot][data-on]')).toHaveLength(1);
    expect(hearts()).toBe(5);
  });

  it('three levels end done, every caught target a recall answer when the bot tapped', async () => {
    const run = start(jumpStep, makeCtx(6));
    const bot = createDinoBot(stage, T);
    for (let i = 0; i < 20000 && !run.result(); i++) {
      bot.tick();
      const b = one('[data-level-next]');
      if (b) b.click();
      await advance(FRAME);
      if (i % 200 === 0) {
        // no sample: every text node holding the target sits in a pick face
        const walker = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if ((n.textContent ?? '').includes(T)) expect((n.parentElement as HTMLElement).closest('.pick-face')).not.toBeNull();
        }
      }
    }
    const r = run.result()!;
    const total = LEVELS.reduce((s, l) => s + l.targets, 0);
    expect(r.outcome).toBe('done');
    expect(r.slips).toBe(0);
    expect(count('good')).toBe(total);
    expect(r.answers).toHaveLength(total);
    r.answers.forEach(a => expect(a).toMatchObject({ item: T + '/name', ok: true, kind: 'recall' }));
    expect(said.filter(s => s === NAME(T))).toHaveLength(total);
    expect(count('fanfare')).toBe(LEVELS.length - 1);
    expect(count('door')).toBe(LEVELS.length);
    expect(count('combo')).toBeGreaterThan(0);
    expect(instructions.filter(s => s === line(CONTENT, 'jump.ask', { name: NAME(T) }))).toHaveLength(LEVELS.length);
  }, 60000);

  it('a passive catch records no answer', async () => {
    const seed = await findSeed(c => c[0].kind === 'target' && GY - c[0].y! === 48 && ['pit', 'wrong'].includes(firstHazard(c).kind));
    freshStage();
    const run = start(jumpStep, makeCtx(seed));
    for (let i = 0; i < 3000 && !run.result(); i++) await advance(50);
    expect(count('good')).toBeGreaterThanOrEqual(1);
    expect(count('jump')).toBe(0);
    expect(said).toContain(NAME(T));
    expect(all('[data-slot][data-full]').length).toBeGreaterThanOrEqual(1);
    expect(run.result()).toMatchObject({ outcome: 'failed', answers: [] });
  });

  it('a tap anywhere hops once; the arena has no button outside the level card', async () => {
    start(jumpStep, makeCtx(5));
    await advance(1000);
    const arena = one('[data-step="jump"]');
    expect(arena.querySelectorAll('button, [data-move]')).toHaveLength(0);
    const ground = dino().y;
    // a tap on a child of the stage (not the arena itself) counts: the event bubbles up
    one('[data-dino]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    tap(); // a second tap in the same instant
    await advance(300);
    expect(dino().y).toBeLessThan(ground - 40);
    tap(); // a third tap in the air
    await advance(1400);
    expect(dino().y).toBe(ground);
    expect(count('jump')).toBe(1);
    // the keyboard hops too
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    await advance(100);
    expect(count('jump')).toBe(2);
  });

  it('the world fills the arena: k = min(H/420, W/300), the ground at the arena bottom', async () => {
    const world = (): { k: number; offY: number } => {
      const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\) scale\(([\d.]+)\)/.exec(one('[data-world]').style.transform)!;
      return { offY: Number(m[2]), k: Number(m[3]) };
    };
    // a portrait phone (the fallback 390 x 600): the width keeps 300 units in view
    start(jumpStep, makeCtx(5));
    await advance(FRAME * 2);
    let w = world();
    expect(w.k).toBeCloseTo(Math.min(600 / 420, 390 / 300), 3);
    expect(w.offY).toBeCloseTo(600 - 420 * w.k, 1);
    // every ground piece reaches the world's bottom (420), which is the arena's bottom edge; so does the lava
    for (const g of all('[data-ground]')) expect(num(g, 'y') - 6 + parseFloat(g.style.height)).toBeGreaterThanOrEqual(JUMP.viewH);
    expect(one('[data-lava]').style.bottom).toBe('0px');
    const arena = one('[data-step="jump"]');
    expect(arena.getAttribute('style')).toContain('inset:0');
    expect(arena.getAttribute('style')).toContain('#FF8A65');
    // landscape: the height sets the scale and the world sits on the bottom edge
    freshStage();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 800, height: 400, top: 0, left: 0, right: 800, bottom: 400, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    start(jumpStep, makeCtx(5));
    await advance(FRAME * 2);
    w = world();
    expect(w.k).toBeCloseTo(400 / 420, 3);
    expect(w.offY).toBeCloseTo(0, 1);
  });

  it('abort resolves aborted, records nothing and leaves no timer or frame', async () => {
    const ac = new AbortController();
    const run = start(jumpStep, makeCtx(3, ac.signal));
    await advance(6000);
    ac.abort();
    expect(await run.p).toMatchObject({ outcome: 'aborted', answers: [], slips: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('abort during a loss (restart pending) leaves no timer or frame', async () => {
    const seed = await findSeed(c => firstHazard(c).kind === 'wrong');
    freshStage();
    const ac = new AbortController();
    const run = start(jumpStep, makeCtx(seed, ac.signal));
    for (let i = 0; i < 4000 && count('ouch') === 0; i++) await advance(FRAME);
    expect(count('ouch')).toBe(1);
    expect(one('[data-dino]').hasAttribute('data-ouch')).toBe(true);
    ac.abort();
    expect(await run.p).toMatchObject({ outcome: 'aborted', answers: [], slips: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });
});
