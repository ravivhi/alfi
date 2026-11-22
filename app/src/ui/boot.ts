import type { KV } from '../store/kv.ts';
import type { NativeBackup } from '../platform/native.ts';
import { exitApp, isApp } from '../platform/native.ts';
import type { AudioDeps } from '../audio/audio.ts';
import { createAppState } from './app.ts';
import type { AppState } from './app.ts';
import { createRouter } from './router.ts';
import type { Router } from './router.ts';
import { mountSetup } from './screens/setup.ts';
import { mountChildren } from './screens/children.ts';
import { mountGate } from './gate.ts';
import { showLeaveDialog } from './leaveDialog.ts';
import { createRng } from '../util/rng.ts';
import { line } from '../audio/lines.ts';
import { CONTENT } from '../content/index.ts';
import { h } from '../util/dom.ts';
import { dayKey } from '../util/day.ts';
import type { ChildRecord } from '../store/schema.ts';
import { mountMap } from './screens/map.ts';
import { mountParent } from './screens/parent.ts';
import type { MapStatus } from './screens/map.ts';
import { CURRICULUM, createRunner, endPending, plannerInputFor } from './runner.ts';
import type { Clock } from './runner.ts';
import { REGISTRY } from '../steps/registry.ts';
import type { StepModule } from '../steps/contract.ts';
import { expandPath } from '../engine/curriculum.ts';
import { sittingStatus, upcomingStep } from '../engine/planner.ts';
import { active as breakActive, breakNow, skip as skipBreak, toChild } from './breakClock.ts';

export interface BootOpts {
  root: HTMLElement;
  kv: KV;
  native: NativeBackup | null;
  now: number;
  audioDeps?: Partial<AudioDeps>;
  /** Defaults to the device clock and local date. */
  clock?: Clock;
  /** Defaults to REGISTRY; unknown steps run the placeholder. */
  registry?: Record<string, StepModule>;
}

export function bootApp(o: BootOpts): { router: Router; app: AppState } {
  const app = createAppState(o.kv, o.native, o.now, o.audioDeps);
  let userActivated = false;
  o.root.addEventListener('pointerdown', () => { userActivated = true; }, true);
  let adding = false; // setup opened from the picker instead of first run

  const say = (id: string) => { void app.audio.say(line(CONTENT, id)); };

  const clock: Clock = o.clock ?? { now: () => Date.now(), today: () => dayKey(new Date()) };
  let gateBack: () => void = () => showChildren(); // where back on the gate goes

  const currentChild = () => app.save.children.find(x => x.id === app.childId);

  // speak: the run came back without playing a step, so the map speaks its status line
  const showMap = (speak?: MapStatus) => router.show('map', root => {
    const c = currentChild();
    if (!c) { root.appendChild(h('div', { 'data-screen': 'map' })); return () => undefined; }
    const input = plannerInputFor(c, clock.today(), 0);
    const now = clock.now();
    const b = breakNow(c, app.save.settings, now); // this child's break
    return mountMap(root, {
      breakUntil: breakActive(b, now) ? b.breakUntil : null,
      breakTotalMs: app.save.settings.breakLengthMin * 60_000,
      now: () => clock.now(),
      child: c,
      path: expandPath(CURRICULUM, input.band),
      status: sittingStatus(input),
      pendingEnd: endPending(input),
      upcoming: upcomingStep(input),
      audio: app.audio,
      content: CONTENT,
      onStart: () => { void runner.start(c.id); },
      onParent: () => openParentGate(showMap),
      speakStatus: speak !== undefined,
      audioAllowed: () => userActivated,
    });
  });

  // back / close on the gate and the parent page return to the screen that opened them (the map, or the picker)
  let parentBack: () => void = () => showMap();
  const openParentGate = (from: () => void) => {
    parentBack = from;
    gateBack = from;
    router.show('gate', r => { mountGate(r, { rng: createRng(Date.now()), onPass: showParent, onFail: from }); return () => undefined; });
  };

  const showParent = () => router.show('parent', root => {
    if (!app.childId) { parentBack(); return () => undefined; }
    return mountParent(root, {
      app,
      childId: app.childId,
      content: CONTENT,
      today: clock.today(),
      ready: app.audio.ready,
      onClose: () => parentBack(),
      onAddChild: () => showSetup(true),
      onChildGone: () => entry(),
      onImported: id => { app.childId = id; app.save.settings.lastChildId = id; app.persist(); showParent(); },
      // the break of the child whose page this is
      breakActive: () => {
        const c = currentChild();
        return !!c && breakActive(breakNow(c, app.save.settings, clock.now()), clock.now());
      },
      onSkipBreak: () => {
        const c = currentChild();
        if (!c) return;
        toChild(c, skipBreak(breakNow(c, app.save.settings, clock.now())));
        app.persist();
      },
      // the parent page closes and the sitting on that letter runs now; its end screen (or back) leads to the map
      onStartLetter: unit => {
        const c = currentChild();
        if (c) void runner.startLetter(c.id, unit);
      },
    });
  });

  const showChildren = () => router.show('children', root => {
    const off = mountChildren(root, {
      children: app.save.children,
      onPick: id => { app.childId = id; app.save.settings.lastChildId = id; app.persist(); showMap(); },
      onAddChild: () => {
        gateBack = () => showChildren();
        router.show('gate', r => { mountGate(r, { rng: createRng(Date.now()), onPass: () => showSetup(true), onFail: showChildren }); return () => undefined; });
      },
      speak: () => say('children.who'),
      audioAllowed: () => userActivated,
    });
    // leaving the picker stops children.who so it never overlaps the map speech
    return () => { off(); app.audio.stop(); };
  });

  const showSetup = (add: boolean) => {
    adding = add;
    router.show('setup', root => {
      let off: (() => void) | undefined;
      mountSetup(root, {
        onDone: finishSetup,
        voiceStatus: () => app.audio.status(),
        ready: app.audio.ready,
        onStatusChange: cb => { off = app.audio.onStatusChange(cb); },
      });
      return () => off?.();
    });
  };

  const finishSetup = (child: ChildRecord) => {
    app.save.children.push(child);
    if (adding) { adding = false; app.persist(); showChildren(); return; }
    app.childId = child.id;
    app.save.settings.lastChildId = child.id;
    app.persist();
    showMap();
  };

  const entry = () => {
    const n = app.save.children.length;
    if (n === 0) showSetup(false);
    else if (n === 1) { app.childId = app.save.children[0].id; showMap(); }
    else showChildren();
  };

  const askLeave = () => {
    router.openDialog(showLeaveDialog(o.root, {
      ask: line(CONTENT, 'leave.ask'),
      speak: t => { void app.audio.say(t); },
      // staying: the question stops at once
      onNo: () => { app.audio.stop(); router.closeDialog(); },
      onYes: () => {
        router.closeDialog();
        if (isApp()) exitApp();
        else if (app.save.children.length === 0) showSetup(false);
        else showChildren();
      },
    }));
  };

  const router: Router = createRouter(o.root, {
    // the "add child" setup goes back to the picker it came from; first-run setup asks before leaving
    setup: () => { if (adding) { adding = false; showChildren(); } else askLeave(); },
    children: askLeave,
    map: askLeave,
    station: () => showMap(),
    end: () => showMap(),
    // back during a break: the map, where the next station shows the countdown until the break ends
    break: () => showMap(),
    gate: () => gateBack(),
    parent: () => parentBack(),
  });
  const runner = createRunner({ app, registry: o.registry ?? REGISTRY, router, clock, showMap });
  entry();
  return { router, app };
}
