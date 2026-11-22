import { describe, it, expect } from 'vitest';
import { addRoad, buildRoad, placeItems, roadFrame, createFrameBuf, SEG, PZ, LANES, ROAD_CURVES, ROAD_HILLS, CAR_BOTTOM_FRAC, HORIZON_FRAC } from '../../src/steps/race.ts';
import type { Segment } from '../../src/steps/race.ts';
import { createSpawner } from '../../src/steps/gameKit.ts';
import { profileFor } from '../../src/engine/profiles.ts';
import { createRng } from '../../src/util/rng.ts';

const W = 390, H = 600;

describe('race road model', () => {
  it('buildRoad: at least 2100 segments, curves only from the old set, hills only from the old set, a flat start and end', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const road = buildRoad(createRng(seed));
      expect(road.length).toBeGreaterThanOrEqual(2100);
      road.forEach((s, i) => {
        expect(s.i).toBe(i);
        expect(s.stripe).toBe(Math.floor(i / 3) % 2);
        if (i) expect(s.y1).toBe(road[i - 1].y2);
        expect(Math.abs(s.curve)).toBeLessThanOrEqual(3);
      });
      const pieces = new Map<number, Segment[]>();
      for (const s of road) pieces.set(s.piece, [...(pieces.get(s.piece) ?? []), s]);
      for (const segs of pieces.values()) {
        // the hold part of a piece runs at the piece's curve: the largest |curve| in the piece
        const peak = segs.reduce((m, s) => (Math.abs(s.curve) > Math.abs(m) ? s.curve : m), 0);
        expect(ROAD_CURVES).toContain(peak);
        const rise = (segs[segs.length - 1].y2 - segs[0].y1) / SEG;
        expect(ROAD_HILLS.some(h => Math.abs(h - rise) < 1e-9), `rise ${rise}`).toBe(true);
      }
      const first = pieces.get(0)!, last = pieces.get(Math.max(...pieces.keys()))!;
      expect(first).toHaveLength(50);
      expect(last).toHaveLength(180);
      for (const s of [...first, ...last]) { expect(s.curve).toBe(0); expect(s.y2).toBe(s.y1); }
      expect(road.length - last.length).toBeGreaterThanOrEqual(2100);
    }
  });

  it('roadFrame: at the car\'s depth the road\'s half width equals the stage width', () => {
    const road: Segment[] = [];
    addRoad(road, 0, 300, 0, 0, 0);
    for (const [w, h] of [[390, 600], [800, 400]]) {
      const f = roadFrame(road, 10 * SEG - PZ, 0, w, h);
      const q = f.quads.find(x => x.kind === 'road' && x.seg === 10)!;
      expect(q.w1).toBeCloseTo(w, 6);
      expect(q.y1).toBeCloseTo(h * (1 - CAR_BOTTOM_FRAC), 6); // the car's road point sits above the finger zone
      expect(q.x1).toBeCloseTo(w / 2, 6);
      // the rumble strip is 1.18 times the road
      expect(f.quads.find(x => x.kind === 'rumble' && x.seg === 10)!.w1).toBeCloseTo(1.18 * w, 6);
    }
  });

  it('roadFrame: an item at the car\'s depth stands on the car\'s line and the road continues to the stage bottom', () => {
    const road: Segment[] = [];
    addRoad(road, 0, 300, 0, 0, 0);
    road[10].items.push({ kind: 'cone', target: false, lane: 1, off: 0, seq: 0, dead: false });
    for (const [w, h] of [[390, 700], [800, 400]]) {
      const f = roadFrame(road, 10 * SEG - PZ, 0, w, h);
      expect(f.items.find(d => d.seg === 10)!.y).toBeCloseTo(h * (1 - CAR_BOTTOM_FRAC), 6);
      // no gap under the car: a road quad reaches the bottom edge (the grass quad is clipped there)
      const roads = f.quads.filter(x => x.kind === 'road');
      expect(Math.max(...roads.map(x => x.y1))).toBeGreaterThanOrEqual(h);
      // and runs up to the horizon
      expect(Math.min(...roads.map(x => x.y2))).toBeLessThan(h * HORIZON_FRAC + 0.03 * h);
    }
  });

  it('roadFrame: a reused frame buffer gives the same quads and items and reuses their objects', () => {
    const road: Segment[] = [];
    addRoad(road, 10, 200, 10, 2, 8);
    for (const lane of [0, 1, 2]) road[40 + lane * 7].items.push({ kind: 'cone', target: false, lane, off: LANES[lane], seq: lane, dead: false });
    const buf = createFrameBuf();
    const a = roadFrame(road, 100, 0.2, W, H, -1, buf);
    const fresh = roadFrame(road, 100, 0.2, W, H, -1);
    expect(a.quads).toEqual(fresh.quads);
    expect(a.items).toEqual(fresh.items);
    const q0 = a.quads[0], i0 = a.items[0];
    const b = roadFrame(road, 140, -0.3, W, H, -1, buf);
    expect(b.quads).toEqual(roadFrame(road, 140, -0.3, W, H).quads);
    expect(b.quads[0]).toBe(q0);
    expect(b.items[0]).toBe(i0);
  });

  it('roadFrame: on a curve the road and an item on it shift together (item x - road centre x = off * w)', () => {
    const road: Segment[] = [];
    addRoad(road, 0, 300, 0, 3, 0);
    for (const off of LANES) road[30].items.push({ kind: 'cone', target: false, lane: LANES.indexOf(off), off, seq: 0, dead: false });
    const f = roadFrame(road, 0, 0, W, H);
    const q = f.quads.find(x => x.kind === 'road' && x.seg === 30)!;
    expect(Math.abs(q.x1 - W / 2)).toBeGreaterThan(10); // the curve moved the road
    const drawn = f.items.filter(x => x.seg === 30);
    expect(drawn).toHaveLength(3);
    for (const d of drawn) {
      expect(d.visible).toBe(true);
      expect(d.x - q.x1).toBeCloseTo(d.item.off * q.w1, 6);
    }
    // steering right moves the road under the car to the left
    const g = roadFrame(road, 0, 0.62, W, H);
    expect(g.quads.find(x => x.kind === 'road' && x.seg === 30)!.x1).toBeLessThan(q.x1);
    expect(f.bgShift).toBe(3);
  });

  it('roadFrame: a segment behind a crest is not drawn and an item on it is hidden', () => {
    const road: Segment[] = [];
    addRoad(road, 0, 40, 0, 0, 0);
    addRoad(road, 10, 10, 10, 0, 14); // up to a crest at segment 69
    addRoad(road, 10, 10, 10, 0, -14); // and down behind it
    addRoad(road, 0, 100, 0, 0, 0);
    const near = { kind: 'cone' as const, target: false, lane: 1, off: 0, seq: 0, dead: false };
    const behind = { ...near, seq: 1 };
    road[20].items.push(near);
    road[95].items.push(behind);
    const f = roadFrame(road, 0, 0, W, H);
    expect(f.quads.some(q => q.seg === 20 && q.kind === 'road')).toBe(true);
    expect(f.quads.some(q => q.seg === 60 && q.kind === 'road')).toBe(true);
    expect(f.quads.some(q => q.seg === 95)).toBe(false);
    expect(f.items.find(d => d.item === near)!.visible).toBe(true);
    expect(f.items.find(d => d.item === behind)?.visible ?? false).toBe(false);
    // from the crest the valley shows again
    const top = roadFrame(road, 72 * SEG, 0, W, H);
    expect(top.quads.some(q => q.seg === 95 && q.kind === 'road')).toBe(true);
    expect(top.items.find(d => d.item === behind)!.visible).toBe(true);
  });

  it('placeItems: slots 13-20 segments apart (0.9 x the old 15-22) between 45 and length-220; never two targets in one slot; no two targets in a row (S1)', () => {
    const cfg = profileFor('3-5').race;
    let slotsAll = 0, cones = 0, seconds = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const rng = createRng(seed);
      const road = buildRoad(rng);
      placeItems(road, rng, cfg, createSpawner({ lanes: 3, rng }));
      const slots = road.filter(s => s.items.length);
      expect(slots[0].i).toBe(45);
      slots.forEach((s, k) => {
        expect(s.i).toBeLessThan(road.length - 220);
        if (k) { expect(s.i - slots[k - 1].i).toBeGreaterThanOrEqual(13); expect(s.i - slots[k - 1].i).toBeLessThanOrEqual(20); }
        expect(s.items.length).toBeLessThanOrEqual(2);
        expect(s.items.filter(it => it.target)).toHaveLength(s.items[0].target ? 1 : 0);
        s.items.forEach(it => { expect(it.off).toBe(LANES[it.lane]); if (it.target) expect(it.kind).toBe('letter'); });
        if (s.items.length === 2) {
          expect(s.items[1].kind).toBe('cone');
          expect(s.items[1].lane).not.toBe(s.items[0].lane);
          seconds++;
        }
        if (s.items[0].kind === 'cone') cones++;
      });
      slotsAll += slots.length;
      const letters = slots.map(s => s.items[0]).filter(it => it.kind === 'letter');
      letters.forEach((it, k) => { if (k && it.target) expect(letters[k - 1].target).toBe(false); });
      const tl = letters.filter(it => it.target).map(it => it.lane);
      tl.forEach((l, k) => { if (k) expect(l).not.toBe(tl[k - 1]); });
      // about half the letters are targets
      const share = letters.filter(it => it.target).length / letters.length;
      expect(share).toBeGreaterThan(0.35);
      expect(share).toBeLessThan(0.6);
      // every item has its own sequence number
      const seqs = slots.flatMap(s => s.items.map(it => it.seq));
      expect(new Set(seqs).size).toBe(seqs.length);
    }
    expect(cones / slotsAll).toBeGreaterThan(0.15);
    expect(cones / slotsAll).toBeLessThan(0.25);
    expect(seconds / slotsAll).toBeGreaterThan(0.25);
    expect(seconds / slotsAll).toBeLessThan(0.35);
  });

  it('the car stands at 33% of the stage height on 390x700 and 800x400 (owner 2026-11-21: higher)', () => {
    const road: Segment[] = [];
    addRoad(road, 0, 300, 0, 0, 0);
    expect(CAR_BOTTOM_FRAC).toBe(0.33);
    for (const [w, h] of [[390, 700], [800, 400]]) {
      const f = roadFrame(road, 10 * SEG - PZ, 0, w, h);
      const q = f.quads.find(x => x.kind === 'road' && x.seg === 10)!;
      expect(Math.abs((h - q.y1) / h - 0.33)).toBeLessThanOrEqual(0.02);
      // the visible road from the car to the horizon stays at least 30% of the stage
      const top = Math.min(...f.quads.filter(x => x.kind === 'road').map(x => x.y2));
      expect((q.y1 - top) / h).toBeGreaterThanOrEqual(0.3);
    }
  });

  it('forward speed is 0.9 of the old 3200 and items still arrive at the old rate per second', () => {
    for (const age of ['3-5', '6-8'] as const) {
      const cfg = profileFor(age).race;
      expect(cfg.maxSpeed).toBeCloseTo(0.9 * 3200, 6);
      let perSec = 0;
      const runs = 20;
      for (let seed = 1; seed <= runs; seed++) {
        const rng = createRng(seed);
        const road = buildRoad(rng);
        placeItems(road, rng, cfg, createSpawner({ lanes: 3, rng }));
        const slots = road.filter(s => s.items.length).length;
        perSec += slots / ((road.length - 265) * SEG / cfg.maxSpeed);
      }
      perSec /= runs;
      const oldRate = 3200 / (18.5 * SEG);
      expect(Math.abs(perSec / oldRate - 1)).toBeLessThan(0.05);
    }
  });
});
