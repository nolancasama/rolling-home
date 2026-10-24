#!/usr/bin/env node
// Rolling Home behavioural acceptance harness.
// Follows ~/.claude/workers/harness/PROTOCOL.md: sections, --list-sections, --only, classified results and an
// acceptance-manifest/1 manifest in .tmp/acceptance/<full|section>/manifest.json.
//
//   node acceptance/run.mjs                 full run (all sections, each from its own fresh game)
//   node acceptance/run.mjs --only cargo    one section
//   node acceptance/run.mjs --list-sections
//   options: --headed, --url http://host:port/ (use an already-running server)

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.tmp', 'acceptance');
const SECTIONS = ['startup', 'explore', 'interior', 'shopping', 'cargo', 'driving', 'delivery', 'camping', 'living', 'furnishing', 'saveload', 'integration'];

const argv = process.argv.slice(2);
if (argv.includes('--list-sections')) {
  console.log(SECTIONS.join('\n'));
  process.exit(0);
}
let only = null;
const oi = argv.indexOf('--only');
if (oi >= 0) {
  only = (argv[oi + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const bad = only.filter((s) => !SECTIONS.includes(s));
  if (!only.length || bad.length) {
    console.error(`Unknown section(s): ${bad.join(', ') || '(none given)'}\nValid sections:\n${SECTIONS.join('\n')}`);
    process.exit(2);
  }
}
const headed = argv.includes('--headed');
const ui = argv.indexOf('--url');
const externalUrl = ui >= 0 ? argv[ui + 1] : null;
const selected = only ?? SECTIONS;
const runName = only ? only.join('+') : 'full';
const runDir = path.join(OUT, runName);
fs.rmSync(runDir, { recursive: true, force: true });
fs.mkdirSync(runDir, { recursive: true });

const { chromium } = await import('playwright');

// ───────────────────────── result plumbing ─────────────────────────

const T0 = Date.now();
const startedAt = new Date().toISOString();
const trace = [];
const checks = [];
const failures = [];
const artifacts = [];

class Classified extends Error {
  constructor(result, info) {
    super(info.expected ?? result);
    this.result = result;
    this.info = info;
  }
}

function log(section, msg, data) {
  trace.push({ t: (Date.now() - T0) / 1000, section, msg, data });
  console.log(`[${section}] ${msg}${data !== undefined ? ' ' + JSON.stringify(data).slice(0, 220) : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, tol) => Math.abs(a - b) <= tol;

async function poll(fn, timeout = 15000, interval = 150) {
  const start = Date.now();
  let attempts = 0;
  let last = { ok: false, observed: null };
  for (;;) {
    attempts++;
    try {
      last = (await fn()) ?? { ok: false };
    } catch (e) {
      last = { ok: false, observed: `error: ${String(e?.message ?? e).slice(0, 300)}` };
    }
    if (last.ok) return { ...last, attempts, elapsed: Date.now() - start };
    if (Date.now() - start >= timeout) return { ...last, ok: false, attempts, elapsed: Date.now() - start };
    await sleep(interval);
  }
}

async function shot(ctx, name) {
  const file = path.join(runDir, `${ctx.section}-${name}.png`.replace(/[^a-z0-9.\-_]/gi, '_'));
  try {
    await ctx.page.screenshot({ path: file });
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    artifacts.push(rel);
    return rel;
  } catch {
    return null;
  }
}

/** PRECONDITION → ACTION → OUTCOME. Throws a Classified error to stop the section on failure. */
async function check(ctx, name, { pre, action, outcome, noPrecondition = false, preTimeout = 15000, outTimeout = 15000 }) {
  if (!pre && !noPrecondition) throw new Classified('HARNESS_ERROR', { check: name, step: 'definition', expected: 'a precondition', observed: 'none given' });
  log(ctx.section, `check: ${name}`);
  if (pre) {
    const r = await poll(pre, preTimeout);
    if (!r.ok) {
      const art = await shot(ctx, `${name}-precondition`);
      throw new Classified('HARNESS_PRECONDITION_FAILED', {
        check: name, step: `precondition (${r.attempts} attempts, ${r.elapsed} ms)`, expected: 'starting state established',
        observed: r.observed, artifacts: art ? [art] : [],
      });
    }
  }
  if (action) {
    try {
      await action();
    } catch (e) {
      const art = await shot(ctx, `${name}-action`);
      throw new Classified('HARNESS_PRECONDITION_FAILED', {
        check: name, step: 'action', expected: 'action performed', observed: String(e?.message ?? e).slice(0, 500), artifacts: art ? [art] : [],
      });
    }
  }
  const o = await poll(outcome, outTimeout);
  if (!o.ok) {
    const art = await shot(ctx, `${name}-outcome`);
    throw new Classified('PRODUCT_FAILURE', {
      check: name, step: `outcome (${o.attempts} attempts, ${o.elapsed} ms)`, expected: name, observed: o.observed, artifacts: art ? [art] : [],
    });
  }
  checks.push({ section: ctx.section, name, result: 'PASS', observed: o.observed ?? null });
  log(ctx.section, `PASS: ${name}`, o.observed);
}

// ───────────────────────── game helpers ─────────────────────────

const snap = (page) => page.evaluate(() => window.__rh.snapshot());
const rh = (page, fn, arg) => page.evaluate(fn, arg);
const mode = (page) => page.evaluate(() => window.__rh?.mode());
const current = (page) => page.evaluate(() => window.__rh.current());
const visible = (page, testid) => page.isVisible(`[data-testid=${testid}]`);

async function tap(page, code, ms = 90) {
  await page.keyboard.down(code);
  await sleep(ms);
  await page.keyboard.up(code);
}

async function startGame(ctx, opts = {}) {
  const { page, base } = ctx;
  await page.goto(base);
  await page.waitForSelector('[data-testid=main-menu]', { timeout: 120000 });
  await page.click('[data-testid=menu-new]');
  if (opts.vehicle && opts.vehicle !== 'van') await page.click(`[data-testid=pick-${opts.vehicle}]`);
  await page.click('[data-testid=ng-start]');
  await page.waitForFunction(() => window.__rh?.mode() === 'explore', null, { timeout: 60000 });
  await rh(page, () => window.__rh.setTraffic(false));
  await sleep(400);
}

/** Get into the driver's seat from outside, handling the pre-trip check. */
async function enterDriving(ctx) {
  const { page } = ctx;
  await rh(page, () => window.__rh.game.ui.closeAll());
  const d = await rh(page, () => window.__rh.driverDoor());
  await rh(page, (p) => window.__rh.teleport(p.x, p.z), d);
  await poll(async () => ({ ok: (await current(page)) === 'rv-drive' }), 5000);
  await tap(page, 'KeyE');
  await poll(async () => ({ ok: (await mode(page)) === 'drive' }), 5000);
  const pr = await poll(async () => ({ ok: (await rh(page, () => window.__rh.game.drive.ready)) || (await visible(page, 'pretrip-pack')) || (await visible(page, 'pretrip-go')) }), 5000);
  if (!pr.ok) return;
  if (await visible(page, 'pretrip-pack')) await page.click('[data-testid=pretrip-pack]');
  if (await visible(page, 'pretrip-go')) await page.click('[data-testid=pretrip-go]');
  await poll(async () => ({ ok: await rh(page, () => window.__rh.game.drive.ready) }), 5000);
}

async function exitDriving(ctx) {
  const { page } = ctx;
  await poll(async () => ({ ok: Math.abs((await snap(page)).vehicle.speed) < 0.4 }), 8000);
  await tap(page, 'KeyE');
  await poll(async () => ({ ok: (await mode(page)) === 'explore' }), 5000);
}

const PROC = {
  dump_tanks: ['gloves', 'hose_rv', 'hose_inlet', 'black', 'gray', 'stow'],
  fill_water: ['spigot', 'hose', 'inlet', 'open', 'stow'],
  connect_power: ['breaker_off', 'plug_pedestal', 'plug_rv', 'breaker_on'],
  connect_water: ['hose', 'inlet', 'open'],
  connect_sewer: ['gloves', 'hose_rv', 'hose_inlet', 'gray_open'],
};

async function doProcedure(page, id) {
  await page.waitForSelector('[data-testid=screen-procedure]', { timeout: 5000 });
  for (const step of PROC[id]) {
    await page.click(`[data-testid=step-${step}]`);
    await sleep(100);
  }
}

async function targetByLabel(page, re) {
  const list = await rh(page, () => window.__rh.targets());
  return list.find((t) => re.test(t.label)) ?? null;
}

// ───────────────────────── sections ─────────────────────────

const S = {};

S.startup = async (ctx) => {
  const { page, base, errors } = ctx;
  await check(ctx, 'main menu loads', {
    pre: async () => {
      const r = await fetch(base);
      return { ok: r.ok, observed: r.status };
    },
    action: async () => {
      await page.goto(base);
    },
    outcome: async () => ({ ok: await visible(page, 'main-menu'), observed: await rh(page, () => window.__rh?.screens()) }),
    outTimeout: 120000,
  });
  await check(ctx, 'new game spawns the player outside the camper', {
    pre: async () => ({ ok: await visible(page, 'menu-new') }),
    action: async () => {
      await page.click('[data-testid=menu-new]');
      await page.click('[data-testid=ng-start]');
    },
    outcome: async () => {
      const s = await snap(page);
      if (s.mode !== 'explore') return { ok: false, observed: { mode: s.mode } };
      const door = await rh(page, () => window.__rh.doorOutside());
      const d = Math.hypot(s.player.x - door.x, s.player.z - door.z);
      const inside = await rh(page, (p) => window.__rh.insideVehicle(p.x, p.z), s.player);
      return { ok: d < 6 && !inside, observed: { mode: s.mode, distToDoor: +d.toFixed(2), inside } };
    },
    outTimeout: 60000,
  });
  await check(ctx, 'HUD shows time, cash and the first objective', {
    pre: async () => ({ ok: (await mode(page)) === 'explore' }),
    outcome: async () => {
      const t = await visible(page, 'hud-time'), c = await visible(page, 'hud-cash'), o = await visible(page, 'hud-objective');
      const txt = o ? await page.textContent('[data-testid=hud-objective]') : '';
      return { ok: t && c && o && /Inspect/i.test(txt ?? ''), observed: { t, c, o, txt } };
    },
  });
  await check(ctx, 'no page errors during startup', {
    noPrecondition: true,
    outcome: async () => ({ ok: errors.length === 0, observed: errors.slice(0, 3) }),
  });
};

S.explore = async (ctx) => {
  const { page } = ctx;
  await startGame(ctx);
  // the player starts facing the van; turn the camera to the open lot before walking
  await rh(page, () => {
    const g = window.__rh.game;
    g.explore.camYaw = g.explore.yaw + Math.PI;
  });
  let p0;
  await check(ctx, 'the player walks with WASD', {
    pre: async () => {
      const s = await snap(page);
      p0 = s.player;
      return { ok: s.mode === 'explore', observed: s.mode };
    },
    action: async () => tap(page, 'KeyW', 1300),
    outcome: async () => {
      const s = await snap(page);
      const d = Math.hypot(s.player.x - p0.x, s.player.z - p0.z);
      return { ok: d > 1, observed: { moved: +d.toFixed(2) } };
    },
  });
  // Stand 3.5 m to the RV's side, facing it, and try to walk through it.
  await rh(page, () => {
    const g = window.__rh.game;
    const p = g.phys;
    const x = p.x + Math.cos(p.heading) * 3.5, z = p.z - Math.sin(p.heading) * 3.5;
    window.__rh.teleport(x, z);
    g.explore.camYaw = Math.atan2(-Math.cos(p.heading), Math.sin(p.heading));
  });
  const samples = [];
  await check(ctx, 'the RV blocks walking through it', {
    pre: async () => {
      const s = await snap(page);
      const inside = await rh(page, (p) => window.__rh.insideVehicle(p.x, p.z), s.player);
      return { ok: s.mode === 'explore' && !inside, observed: { inside } };
    },
    action: async () => {
      await page.keyboard.down('KeyW');
      for (let i = 0; i < 25; i++) {
        await sleep(100);
        samples.push((await snap(page)).player);
      }
      await page.keyboard.up('KeyW');
    },
    outcome: async () => {
      const inside = await rh(page, (pts) => pts.filter((p) => window.__rh.insideVehicle(p.x, p.z, 0.05)).length, samples);
      const g = await rh(page, () => ({ x: window.__rh.game.phys.x, z: window.__rh.game.phys.z }));
      const last = samples[samples.length - 1];
      const dist = Math.hypot(last.x - g.x, last.z - g.z);
      return { ok: inside === 0 && dist < 2.4, observed: { samplesInside: inside, endDistFromCenter: +dist.toFixed(2) } };
    },
  });
  await check(ctx, 'inspect the RV from outside', {
    pre: async () => {
      const t = await rh(page, () => window.__rh.targets().map((x) => x.id));
      return { ok: t.includes('rv-body'), observed: t };
    },
    action: async () => {
      await rh(page, () => window.__rh.act('rv-body', 'Inspect'));
    },
    outcome: async () => {
      const s = await snap(page);
      return { ok: s.objectives.includes('inspect') && s.screens.includes('info'), observed: { objectives: s.objectives, screens: s.screens } };
    },
  });
};

S.interior = async (ctx) => {
  const { page } = ctx;
  await startGame(ctx);
  const door = await rh(page, () => window.__rh.doorOutside());
  await rh(page, (d) => window.__rh.teleport(d.x, d.z), door);
  await check(ctx, 'enter the RV with E', {
    pre: async () => {
      const c = await current(page);
      return { ok: c === 'rv-door', observed: c };
    },
    action: async () => tap(page, 'KeyE'),
    outcome: async () => ({ ok: (await mode(page)) === 'interior', observed: await mode(page) }),
  });
  let galley, v0;
  await check(ctx, 'the sink moves fresh water into the gray tank', {
    pre: async () => {
      galley = await targetByLabel(page, /galley/i);
      v0 = (await snap(page)).vehicle;
      return { ok: !!galley && v0.fresh > 5, observed: { galley: galley?.label, fresh: v0.fresh } };
    },
    action: async () => {
      await rh(page, (id) => window.__rh.act(id, 'Wash up'), galley.id);
    },
    outcome: async () => {
      const v = (await snap(page)).vehicle;
      const df = v0.fresh - v.fresh, dg = v.gray - v0.gray;
      return { ok: near(df, 1.5, 0.05) && near(dg, 1.5, 0.05), observed: { freshUsed: +df.toFixed(3), grayAdded: +dg.toFixed(3) } };
    },
  });
  let toilet;
  await check(ctx, 'the toilet adds black water', {
    pre: async () => {
      toilet = await targetByLabel(page, /toilet/i);
      v0 = (await snap(page)).vehicle;
      return { ok: !!toilet, observed: toilet?.label };
    },
    action: async () => {
      await rh(page, (id) => window.__rh.act(id, 'toilet'), toilet.id);
    },
    outcome: async () => {
      const v = (await snap(page)).vehicle;
      const db = v.black - v0.black;
      return { ok: near(db, 1.4, 0.05), observed: { blackAdded: +db.toFixed(3) } };
    },
  });
  await check(ctx, 'needs are shown inside', {
    pre: async () => ({ ok: (await mode(page)) === 'interior' }),
    outcome: async () => ({ ok: await visible(page, 'hud-needs') }),
  });
  await rh(page, () => {
    const s = window.__rh.state();
    s.vehicles[0].gray = window.__rh.caps().gray;
  });
  await check(ctx, 'a full gray tank stops the sink', {
    pre: async () => {
      v0 = (await snap(page)).vehicle;
      return { ok: v0.gray >= v0.capacities.gray - 0.01, observed: { gray: v0.gray, cap: v0.capacities.gray } };
    },
    action: async () => {
      await rh(page, (id) => window.__rh.act(id, 'Wash up'), galley.id);
    },
    outcome: async () => {
      await sleep(1600);
      const v = (await snap(page)).vehicle;
      const toast = (await page.textContent('[data-testid=toasts]')) ?? '';
      return { ok: v.fresh === v0.fresh && v.gray === v0.gray && /gray tank is full/i.test(toast), observed: { fresh: v.fresh, gray: v.gray, toast: toast.slice(-120) } };
    },
  });
};

S.shopping = async (ctx) => {
  const { page } = ctx;
  await startGame(ctx);
  await rh(page, () => window.__rh.teleport(-980, 686.8, Math.PI));
  let s0;
  await check(ctx, 'buying groceries updates cash, weight and storage', {
    pre: async () => {
      s0 = await snap(page);
      const c = await current(page);
      return { ok: c === 'a:dj_grocery_door', observed: c };
    },
    action: async () => {
      await tap(page, 'KeyE');
      await page.click('[data-testid=shop-item-pasta_kit]');
      await page.click('[data-testid=buy-btn]');
    },
    outcome: async () => {
      const s = await snap(page);
      const dc = s0.cash - s.cash, dw = s.weight.total - s0.weight.total;
      return { ok: near(dc, 6, 0.01) && near(dw, 1.1, 0.02) && s.items === s0.items + 1 && s.objectives.includes('groceries'), observed: { cashSpent: dc, weightAdded: +dw.toFixed(3), items: s.items - s0.items } };
    },
  });
  await rh(page, () => window.__rh.game.ui.closeAll());
  await rh(page, () => window.__rh.teleport(-1030, 714.2, 0));
  await check(ctx, 'buying equipment adds its mass', {
    pre: async () => {
      s0 = await snap(page);
      const c = await current(page);
      return { ok: c === 'a:dj_rv_door', observed: c };
    },
    action: async () => {
      await tap(page, 'KeyE');
      await page.click('[data-testid=shop-item-cargo_straps]');
      await page.click('[data-testid=buy-btn]');
    },
    outcome: async () => {
      const s = await snap(page);
      const dc = s0.cash - s.cash, dw = s.weight.total - s0.weight.total;
      return { ok: near(dc, 25, 0.01) && near(dw, 2, 0.02), observed: { cashSpent: dc, weightAdded: +dw.toFixed(3) } };
    },
  });
  await rh(page, () => {
    window.__rh.state().cash = 3;
    window.__rh.game.ui.invalidate();
  });
  await page.click('[data-testid=shop-item-solar_200]');
  await check(ctx, 'cannot buy without enough money', {
    pre: async () => ({ ok: (await snap(page)).cash === 3 && (await visible(page, 'buy-btn')) }),
    action: async () => {
      // a real click on a disabled button does nothing; dispatch one anyway to prove it
      await page.$eval('[data-testid=buy-btn]', (el) => el.click());
    },
    outcome: async () => {
      const s = await snap(page);
      const disabled = await page.isDisabled('[data-testid=buy-btn]');
      const reason = (await page.textContent('[data-testid=buy-reason]')) ?? '';
      return { ok: disabled && s.cash === 3 && /not enough cash/i.test(reason), observed: { disabled, cash: s.cash, reason } };
    },
  });
};

S.cargo = async (ctx) => {
  const { page } = ctx;
  await startGame(ctx);
  await rh(page, () => window.__rh.teleport(-892.2, 794, Math.PI / 2));
  await check(ctx, 'accept the starter delivery', {
    pre: async () => {
      const c = await current(page);
      return { ok: c === 'a:dj_board', observed: c };
    },
    action: async () => {
      await tap(page, 'KeyE');
      await page.click('[data-testid=accept-starter]');
    },
    outcome: async () => {
      const s = await snap(page);
      return { ok: s.jobs.some((j) => j.id === 'starter' && j.status === 'accepted') && s.objectives.includes('accept'), observed: s.jobs };
    },
  });
  await rh(page, () => {
    window.__rh.game.ui.closeAll();
    window.__rh.teleportVehicle(-893, 826, Math.PI);
    window.__rh.teleport(-885.5, 808.5, 0);
  });
  await check(ctx, 'cargo over a compartment limit is refused with a warning', {
    pre: async () => {
      const at = await rh(page, () => window.__rh.vehicleAt('dj_dock'));
      const c = await current(page);
      return { ok: at && c === 'a:dj_dock', observed: { vehicleAtDock: at, target: c } };
    },
    action: async () => {
      await tap(page, 'KeyE');
      await page.click('[data-testid=load-starter]');
    },
    outcome: async () => {
      const warn = await visible(page, 'cargo-warning');
      const disabled = await page.isDisabled('[data-testid=cargo-load]');
      const err = (await page.textContent('[data-testid=crate-1-error]').catch(() => '')) ?? '';
      return { ok: warn && disabled, observed: { warning: warn, loadDisabled: disabled, crate1: err } };
    },
  });
  let w0;
  await check(ctx, 'rearranging fixes it and the cargo loads', {
    pre: async () => {
      w0 = (await snap(page)).weight.total;
      return { ok: await visible(page, 'cargo-warning') };
    },
    action: async () => {
      for (const i of [0, 1, 2]) await page.click(`[data-testid=crate-${i}-floor]`);
      await page.waitForSelector('[data-testid=cargo-ok]', { timeout: 3000 });
      await page.click('[data-testid=cargo-load]');
    },
    outcome: async () => {
      const s = await snap(page);
      return {
        ok: s.jobs.some((j) => j.id === 'starter' && j.status === 'loaded') && near(s.weight.cargo, 174, 0.5) && near(s.weight.total - w0, 174, 0.6) && s.objectives.includes('load'),
        observed: { jobs: s.jobs, cargoKg: s.weight.cargo, added: +(s.weight.total - w0).toFixed(2) },
      };
    },
  });
};

S.driving = async (ctx) => {
  const { page } = ctx;
  await startGame(ctx);
  const r = await rh(page, () => window.__rh.setupLoadedJob('starter', ['floor', 'floor', 'floor']));
  if (r !== 'ok') throw new Classified('HARNESS_PRECONDITION_FAILED', { check: 'setup loaded job', step: 'precondition', expected: 'ok', observed: r });
  await check(ctx, 'enter the driver’s seat', {
    pre: async () => ({ ok: (await mode(page)) === 'explore' }),
    action: async () => enterDriving(ctx),
    outcome: async () => {
      const m = await mode(page);
      const ready = await rh(page, () => window.__rh.game.drive.ready);
      return { ok: m === 'drive' && ready, observed: { mode: m, ready } };
    },
  });
  let s0;
  let arrived = false;
  await check(ctx, 'drive the real road to Pine Lake', {
    pre: async () => {
      s0 = await snap(page);
      return { ok: s0.mode === 'drive', observed: s0.mode };
    },
    action: async () => {
      arrived = await rh(page, () => window.__rh.autodrive('pl_c', 420000, 25));
    },
    outcome: async () => {
      const s = await snap(page);
      const d = Math.hypot(s.vehicle.x - -300, s.vehicle.z - -1030);
      const fuel = s0.vehicle.fuel - s.vehicle.fuel, km = s.vehicle.odometer - s0.vehicle.odometer, min = s.minutes - s0.minutes;
      const wear = s0.vehicle.condition.engine - s.vehicle.condition.engine;
      return {
        ok: arrived && d < 140 && fuel > 2 && km > 20 && min > 15 && wear > 0 && s.objectives.includes('travel'),
        observed: { arrived, distToPineLake: +d.toFixed(1), fuelUsedL: +fuel.toFixed(2), km: +km.toFixed(1), gameMinutes: +min.toFixed(1), engineWear: +wear.toFixed(5), objectives: s.objectives },
      };
    },
    outTimeout: 20000,
  });
  await shot(ctx, 'arrived-pine-lake');
  let cam0;
  await check(ctx, 'switch between chase and cockpit cameras', {
    pre: async () => {
      cam0 = await rh(page, () => window.__rh.game.drive.cam);
      return { ok: (await mode(page)) === 'drive', observed: cam0 };
    },
    action: async () => tap(page, 'KeyC'),
    outcome: async () => {
      const cam = await rh(page, () => window.__rh.game.drive.cam);
      return { ok: cam !== cam0, observed: { from: cam0, to: cam } };
    },
  });
  await shot(ctx, 'cockpit');
  await tap(page, 'KeyC');
  // drive into a building: collisions must still hold after camera switches
  await rh(page, () => window.__rh.teleportVehicle(-215, -1043, Math.PI));
  let before;
  await check(ctx, 'collisions still work after switching cameras', {
    pre: async () => {
      before = await snap(page);
      return { ok: before.mode === 'drive' };
    },
    action: async () => {
      await rh(page, () => (window.__rh.game.drive.auto = { throttle: 1, brake: 0, steer: 0 }));
      await sleep(3500);
      await rh(page, () => (window.__rh.game.drive.auto = { throttle: 0, brake: 1, steer: 0 }));
      await sleep(800);
      await rh(page, () => (window.__rh.game.drive.auto = null));
    },
    outcome: async () => {
      const s = await snap(page);
      // the lodge front wall is at z = -1053; the van nose must stop short of it
      const nose = s.vehicle.z - 2.8;
      return { ok: nose > -1054 && s.vehicle.z < before.vehicle.z - 0.5, observed: { z0: before.vehicle.z, z: s.vehicle.z, nose: +nose.toFixed(2) } };
    },
  });
};

S.delivery = async (ctx) => {
  const { page } = ctx;
  await startGame(ctx);
  const r = await rh(page, () => window.__rh.setupLoadedJob('starter', ['floor', 'floor', 'floor']));
  if (r !== 'ok') throw new Classified('HARNESS_PRECONDITION_FAILED', { check: 'setup loaded job', step: 'precondition', expected: 'ok', observed: r });
  await rh(page, () => {
    window.__rh.teleportVehicle(-180, -1050, Math.PI);
    window.__rh.teleport(-194.5, -1056.5, Math.PI / 2);
  });
  let s0;
  await check(ctx, 'unload at the destination dock and get paid', {
    pre: async () => {
      s0 = await snap(page);
      const at = await rh(page, () => window.__rh.vehicleAt('pl_lodge_dock'));
      const c = await current(page);
      return { ok: at && c === 'a:pl_lodge_dock', observed: { vehicleAtDock: at, target: c } };
    },
    action: async () => {
      await tap(page, 'KeyE');
      await page.click('[data-testid=deliver-starter]');
    },
    outcome: async () => {
      const s = await snap(page);
      const paid = s.cash - s0.cash;
      return {
        ok: paid >= 100 && s.completedJobs === 1 && s.weight.cargo === 0 && near(s0.weight.total - s.weight.total, 174, 0.6) && s.objectives.includes('deliver'),
        observed: { paid, completed: s.completedJobs, cargoKg: s.weight.cargo },
      };
    },
  });
};

S.camping = async (ctx) => {
  const { page } = ctx;
  await startGame(ctx);
  await rh(page, () => {
    window.__rh.teleportVehicle(70, -1124, 0.3);
    window.__rh.teleport(43.6, -1098, -Math.PI / 2);
  });
  let s0, siteId;
  await check(ctx, 'reserve a campsite at the office', {
    pre: async () => {
      s0 = await snap(page);
      const c = await current(page);
      return { ok: c === 'a:pl_kiosk', observed: c };
    },
    action: async () => {
      await tap(page, 'KeyE');
      await page.waitForSelector('[data-testid=screen-campground]');
      siteId = await page.evaluate(() => {
        const el = [...document.querySelectorAll('[data-testid^=site-P]')].find((e) => !e.classList.contains('disabled'));
        return el?.getAttribute('data-testid')?.slice(5) ?? null;
      });
      if (!siteId) throw new Error('no available site');
      await page.click(`[data-testid=site-${siteId}]`);
      await page.click('[data-testid=reserve-go]');
    },
    outcome: async () => {
      const s = await snap(page);
      const paid = s0.cash - s.cash;
      return { ok: s.reservation?.site === siteId && near(paid, 28, 0.01) && s.objectives.includes('campsite'), observed: { reservation: s.reservation, paid } };
    },
  });
  const site = await rh(page, (id) => window.__rh.site('pine_cg', id), siteId);
  await check(ctx, 'drive into the reserved site', {
    pre: async () => ({ ok: !!site, observed: site }),
    action: async () => {
      await enterDriving(ctx);
      // The loop's west lane runs north (toward -z) along x = 130; lakeside sites are west of it, forest
      // sites east. Approach from the south, stop 6 m short of the site (z + 6), then turn in nose-first.
      const dir = site.x < 130 ? -1 : 1;
      const path = [[92, -1132], [121, -1150], [130, -1176], [130, site.z + 6], [130 + dir * 2, site.z], [site.x + dir * 2, site.z]];
      await rh(page, (pts) => window.__rh.autodrivePath(pts, 120000, 1.5), path);
      await exitDriving(ctx);
    },
    outcome: async () => {
      const ok = await rh(page, () => window.__rh.inSite());
      const s = await snap(page);
      return { ok, observed: { inSite: ok, vehicle: { x: s.vehicle.x, z: s.vehicle.z, heading: s.vehicle.heading }, site } };
    },
    outTimeout: 5000,
  });
  await shot(ctx, 'parked-in-site');
  await rh(page, (p) => window.__rh.teleport(p.x - 0.8, p.z), site.pedestal);
  await check(ctx, 'connect shore power and city water at the pedestal', {
    pre: async () => {
      const c = await current(page);
      return { ok: c === 'pedestal', observed: c };
    },
    action: async () => {
      await tap(page, 'KeyE');
      await page.click('[data-testid=connect-power]');
      await doProcedure(page, 'connect_power');
      await sleep(400);
      await tap(page, 'KeyE');
      await page.click('[data-testid=connect-water]');
      await doProcedure(page, 'connect_water');
    },
    outcome: async () => {
      const s = await snap(page);
      return { ok: s.vehicle.hookups.power && s.vehicle.hookups.water && s.objectives.includes('hookups'), observed: s.vehicle.hookups };
    },
  });
  // Tanks with something to dump; drive (teleport) to the campground dump station.
  await rh(page, () => {
    const s = window.__rh.state();
    const v = s.vehicles[0];
    v.hookups = { power: false, water: false, sewer: false };
    v.gray = 30;
    v.black = 12;
    window.__rh.game.ui.closeAll();
    window.__rh.teleportVehicle(70, -1124, 0.3);
    window.__rh.teleport(75.5, -1128, Math.PI);
  });
  await check(ctx, 'empty the waste tanks at the dump station', {
    pre: async () => {
      s0 = await snap(page);
      const at = await rh(page, () => window.__rh.vehicleAt('pl_cg_dump'));
      const c = await current(page);
      return { ok: at && c === 'a:pl_cg_dump' && s0.vehicle.gray === 30, observed: { at, target: c, gray: s0.vehicle.gray } };
    },
    action: async () => {
      await tap(page, 'KeyE');
      await page.click('[data-testid=dump-go]');
      await doProcedure(page, 'dump_tanks');
    },
    outcome: async () => {
      const s = await snap(page);
      const dw = s0.weight.total - s.weight.total;
      return { ok: s.vehicle.gray === 0 && s.vehicle.black === 0 && near(dw, 42, 0.5) && s.objectives.includes('dump'), observed: { gray: s.vehicle.gray, black: s.vehicle.black, weightRemoved: +dw.toFixed(2) } };
    },
  });
};

S.living = async (ctx) => {
  const { page } = ctx;
  await startGame(ctx);
  await rh(page, () => {
    window.__rh.setMode('interior');
    window.__rh.state().player.needs.hunger = 50;
  });
  let s0, galley;
  await check(ctx, 'cook a meal on the stove', {
    pre: async () => {
      s0 = await snap(page);
      galley = await targetByLabel(page, /galley/i);
      return { ok: s0.mode === 'interior' && !!galley, observed: { mode: s0.mode, galley: galley?.label } };
    },
    action: async () => {
      await rh(page, (id) => window.__rh.act(id, 'Cook'), galley.id);
      await page.click('[data-testid=cook-pasta_kit]');
    },
    outcome: async () => {
      const s = await snap(page);
      const dh = s.needs.hunger - s0.needs.hunger, df = s0.vehicle.fresh - s.vehicle.fresh, dg = s.vehicle.gray - s0.vehicle.gray, dm = s.minutes - s0.minutes;
      return { ok: dh > 35 && near(df, 3, 0.05) && near(dg, 2.5, 0.05) && dm >= 30, observed: { hungerGain: +dh.toFixed(1), freshUsed: +df.toFixed(2), grayAdded: +dg.toFixed(2), minutes: +dm.toFixed(1) } };
    },
    outTimeout: 8000,
  });
  await rh(page, () => {
    const s = window.__rh.state();
    s.time.minutes = 21.5 * 60;
    s.player.needs.energy = 25;
  });
  let bed;
  await check(ctx, 'sleep until the next morning', {
    pre: async () => {
      s0 = await snap(page);
      bed = await targetByLabel(page, /bed/i);
      return { ok: !!bed && s0.minutes < 1440, observed: { bed: bed?.label, minutes: s0.minutes } };
    },
    action: async () => {
      await rh(page, (id) => window.__rh.act(id, 'Sleep until morning'), bed.id);
      await page.click('[data-testid=sleep-go]');
    },
    outcome: async () => {
      const s = await snap(page);
      const morning = s.minutes >= 1440 + 7 * 60 - 1 && s.minutes < 1440 + 7 * 60 + 15;
      const summary = await visible(page, 'summary-ok');
      return { ok: morning && s.needs.energy > 70 && summary, observed: { minutes: s.minutes, energy: +s.needs.energy.toFixed(1), summary } };
    },
    outTimeout: 10000,
  });
};

S.furnishing = async (ctx) => {
  const { page } = ctx;
  await startGame(ctx);
  await rh(page, () => window.__rh.teleport(-1030, 714.2, 0));
  let s0;
  await check(ctx, 'buy a furniture upgrade', {
    pre: async () => {
      s0 = await snap(page);
      const c = await current(page);
      return { ok: c === 'a:dj_rv_door', observed: c };
    },
    action: async () => {
      await tap(page, 'KeyE');
      await page.click('[data-testid=shop-item-plant]');
      await page.click('[data-testid=buy-btn]');
    },
    outcome: async () => {
      const s = await snap(page);
      return { ok: near(s0.cash - s.cash, 25, 0.01) && s.items === s0.items + 1, observed: { spent: s0.cash - s.cash } };
    },
  });
  const uid = await rh(page, () => Object.values(window.__rh.state().items).find((i) => i.def === 'plant')?.uid);
  await rh(page, () => {
    window.__rh.game.ui.closeAll();
    window.__rh.setMode('interior');
    window.__rh.setMode('furnish');
  });
  let probe;
  await check(ctx, 'invalid placements are rejected', {
    pre: async () => ({ ok: (await mode(page)) === 'furnish' && !!uid && (await visible(page, 'furnish')), observed: { mode: await mode(page), uid } }),
    action: async () => {
      probe = await rh(page, (id) => {
        const f = window.__rh.furnish;
        f.startMove(id);
        f.moveTo(0.665, -0.15, 0); // on top of the galley
        const overlap = f.issues();
        f.moveTo(-0.62, 0.2, 0); // in the doorway
        const door = f.issues();
        f.moveTo(0, 1.3, 0); // in the cab
        const cab = f.issues();
        const placed = f.place();
        return { overlap, door, cab, placed };
      }, uid);
    },
    outcome: async () => {
      const where = await rh(page, (id) => window.__rh.state().items[id].where.kind, uid);
      const ok = probe.overlap.some((t) => /overlaps/i.test(t)) && probe.door.some((t) => /door/i.test(t)) && probe.cab.some((t) => /living area/i.test(t)) && probe.placed === false && where === 'stored';
      return { ok, observed: { ...probe, where } };
    },
  });
  let w0, c0, spot;
  await check(ctx, 'a valid placement installs the upgrade and updates the RV', {
    pre: async () => {
      w0 = (await snap(page)).weight.total;
      c0 = (await rh(page, () => window.__rh.caps())).comfort;
      return { ok: (await mode(page)) === 'furnish' };
    },
    action: async () => {
      spot = await rh(page, () => {
        const f = window.__rh.furnish;
        const inr = window.__rh.game.phys.def.interior;
        for (let z = inr.living.z1 - 0.2; z > inr.living.z0 + 0.2; z -= 0.05) {
          for (let x = inr.living.x0 + 0.2; x < inr.living.x1 - 0.2; x += 0.05) {
            f.moveTo(+x.toFixed(2), +z.toFixed(2), 0);
            if (!f.issues().length) return { x, z, placed: f.place() };
          }
        }
        return null;
      });
    },
    outcome: async () => {
      const it = await rh(page, (id) => window.__rh.state().items[id], uid);
      const w = (await snap(page)).weight.total;
      const c = (await rh(page, () => window.__rh.caps())).comfort;
      return { ok: !!spot?.placed && it.where.kind === 'floor' && near(w, w0, 0.01) && near(c - c0, 1, 0.001), observed: { spot, where: it.where, weightDelta: +(w - w0).toFixed(3), comfortDelta: c - c0 } };
    },
  });
  await shot(ctx, 'placed');
  await rh(page, () => window.__rh.furnish.done());
};

S.saveload = async (ctx) => {
  const { page, base } = ctx;
  await startGame(ctx);
  await rh(page, () => {
    const g = window.__rh.game;
    g.sim.buy('dj_grocery', 'fruit');
    g.sim.accept('starter', 'dj_board');
    window.__rh.teleportVehicle(-930, 760, 1.0);
    const s = window.__rh.state();
    s.vehicles[0].fresh = 33.25;
    s.player.needs.hunger = 47.5;
  });
  let saved;
  await check(ctx, 'save to a slot from the pause menu', {
    pre: async () => ({ ok: (await mode(page)) === 'explore' }),
    action: async () => {
      await tap(page, 'Escape');
      await page.click('[data-testid=pause-save]');
      await page.click('[data-testid=save-slot1]');
    },
    outcome: async () => {
      saved = await page.evaluate(() => localStorage.getItem('rollinghome:save:slot1'));
      return { ok: !!saved && JSON.parse(saved).format === 'rolling-home-save', observed: saved ? 'saved' : null };
    },
  });
  await check(ctx, 'reload restores the complete state', {
    pre: async () => ({ ok: !!saved }),
    action: async () => {
      await page.goto(base);
      await page.waitForSelector('[data-testid=main-menu]', { timeout: 120000 });
      await page.click('[data-testid=menu-load]');
      await page.click('[data-testid=load-slot1]');
      await page.waitForFunction(() => window.__rh?.mode() === 'explore' || window.__rh?.mode() === 'interior', null, { timeout: 60000 });
    },
    outcome: async () => {
      const a = JSON.parse(saved).state;
      const b = await rh(page, () => window.__rh.state());
      const diffs = [];
      const cmp = (label, x, y, tol = 0) => {
        if (typeof x === 'number' ? Math.abs(x - y) > tol : JSON.stringify(x) !== JSON.stringify(y)) diffs.push({ label, saved: x, loaded: y });
      };
      cmp('cash', a.cash, b.cash);
      cmp('time', a.time.minutes, b.time.minutes, 1);
      cmp('vehicles', a.vehicles.map((v) => ({ ...v, batteryWh: 0, fuel: Math.round(v.fuel * 100) })), b.vehicles.map((v) => ({ ...v, batteryWh: 0, fuel: Math.round(v.fuel * 100) })));
      cmp('items', Object.keys(a.items).sort(), Object.keys(b.items).sort());
      cmp('item places', Object.values(a.items).map((i) => [i.uid, i.where]), Object.values(b.items).map((i) => [i.uid, i.where]));
      cmp('jobs', a.jobs.active.map((j) => [j.offer.id, j.status]), b.jobs.active.map((j) => [j.offer.id, j.status]));
      cmp('objectives', Object.keys(a.objectives.done).sort(), Object.keys(b.objectives.done).sort());
      cmp('hunger', a.player.needs.hunger, b.player.needs.hunger, 0.3);
      cmp('fresh', a.vehicles[0].fresh, b.vehicles[0].fresh, 0.01);
      cmp('seed', a.seed, b.seed);
      cmp('uidCounter', a.uidCounter, b.uidCounter);
      return { ok: diffs.length === 0, observed: diffs.length ? diffs.slice(0, 4) : 'identical' };
    },
  });
};

S.integration = async (ctx) => {
  const { page } = ctx;
  await startGame(ctx);
  const pose = await rh(page, () => window.__rh.roadPose('hwy60_w', 30));
  // full throttle for 8 s along the highway (the pilot only steers)
  const speedTest = async () => {
    const v = await rh(page, () => window.__rh.speedRun('hwy60_w', 30, 8));
    await sleep(400);
    return v;
  };
  await rh(page, (p) => window.__rh.teleportVehicle(p.x, p.z, p.heading), pose);
  await enterDriving(ctx);
  let vGood, vBad;
  await check(ctx, 'worn engine and brakes make the RV drive worse', {
    pre: async () => ({ ok: (await mode(page)) === 'drive' && (await rh(page, () => window.__rh.game.drive.ready)) }),
    action: async () => {
      vGood = await speedTest();
      await rh(page, () => {
        const v = window.__rh.state().vehicles[0];
        v.condition.engine = 0.12;
        v.condition.brakes = 0.2;
      });
      vBad = await speedTest();
    },
    outcome: async () => ({ ok: vGood > 10 && vBad < vGood * 0.8, observed: { goodSpeed: +vGood.toFixed(2), wornSpeed: +vBad.toFixed(2), limp: (await rh(page, () => window.__rh.perf().limp)) } }),
    outTimeout: 4000,
  });
  // repairs at Pro Auto in Mesa City
  await rh(page, () => {
    window.__rh.state().cash = 6000;
    window.__rh.teleportVehicle(1200, 314, Math.PI / 2);
  });
  await exitDriving(ctx);
  await rh(page, () => window.__rh.teleport(1200, 322.2, Math.PI));
  await check(ctx, 'professional repairs restore the condition', {
    pre: async () => {
      const c = await current(page);
      return { ok: c === 'a:mc_service_door' && (await rh(page, () => window.__rh.vehicleAt('mc_service_door'))), observed: c };
    },
    action: async () => {
      await tap(page, 'KeyE');
      await page.click('[data-testid=repair-engine]');
      await page.click('[data-testid=repair-brakes]');
      await page.click('[data-testid=repair-go]');
    },
    outcome: async () => {
      const s = await snap(page);
      return { ok: s.vehicle.condition.engine > 0.99 && s.vehicle.condition.brakes > 0.99 && s.cash < 6000, observed: { condition: s.vehicle.condition, cash: s.cash } };
    },
  });
  // assisted travel Mesa City → Dusty Junction (highways marked explored)
  await rh(page, () => {
    const s = window.__rh.state();
    s.explored.hwy60_w = true;
    s.explored.hwy60_e = true;
    window.__rh.game.ui.closeAll();
    window.__rh.teleportVehicle(1005, 375, Math.PI);
    window.__rh.setMode('interior');
  });
  let s0;
  await check(ctx, 'assisted travel charges time, fuel and needs', {
    pre: async () => {
      s0 = await snap(page);
      return { ok: s0.mode === 'interior', observed: s0.mode };
    },
    action: async () => {
      await rh(page, () => window.__rh.game.screens.openPhone('map'));
      await page.click('[data-testid=map-place-dusty]');
      await page.click('[data-testid=map-assisted]');
    },
    outcome: async () => {
      const s = await snap(page);
      const fuel = s0.vehicle.fuel - s.vehicle.fuel, min = s.minutes - s0.minutes, hunger = s0.needs.hunger - s.needs.hunger;
      const d = Math.hypot(s.vehicle.x - -935, s.vehicle.z - 752);
      return { ok: d < 5 && fuel > 5 && min > 25 && hunger > 1, observed: { distToLot: +d.toFixed(1), fuelUsed: +fuel.toFixed(2), minutes: +min.toFixed(1), hungerDrop: +hunger.toFixed(2) } };
    },
    outTimeout: 15000,
  });
  // fresh water: fill to a target and check the added mass
  await rh(page, () => {
    const s = window.__rh.state();
    s.vehicles[0].fresh = 10;
    window.__rh.teleportVehicle(-814, 680, Math.PI / 2);
    window.__rh.teleport(-807.8, 684.6, Math.PI / 2);
  });
  let w0;
  await check(ctx, 'filling fresh water adds 1 kg per liter', {
    pre: async () => {
      const s = await snap(page);
      w0 = s.weight.total;
      const c = await current(page);
      return { ok: s.vehicle.fresh === 10 && c === 'a:dj_water' && (await rh(page, () => window.__rh.vehicleAt('dj_water'))), observed: { fresh: s.vehicle.fresh, target: c } };
    },
    action: async () => {
      await tap(page, 'KeyE');
      await page.$eval('[data-testid=water-target]', (el) => {
        el.value = '60';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.click('[data-testid=water-fill]');
      await doProcedure(page, 'fill_water');
    },
    outcome: async () => {
      const s = await snap(page);
      return { ok: near(s.vehicle.fresh, 60, 0.01) && near(s.weight.total - w0, 50, 0.1), observed: { fresh: s.vehicle.fresh, weightAdded: +(s.weight.total - w0).toFixed(2) } };
    },
  });
  await check(ctx, 'no page errors during the integration run', {
    noPrecondition: true,
    outcome: async () => ({ ok: ctx.errors.length === 0, observed: ctx.errors.slice(0, 3) }),
  });
};

// ───────────────────────── runner ─────────────────────────

let server = null;
let base = externalUrl;
if (!base) {
  const { createServer } = await import('vite');
  server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5299, strictPort: false } });
  await server.listen();
  const addr = server.httpServer.address();
  base = `http://localhost:${addr.port}/`;
}
log('runner', `base ${base}`, { sections: selected });

const browser = await chromium.launch({ headless: !headed, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const sectionResults = {};
let overall = 'PASS';
for (const section of selected) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e?.stack ?? e).slice(0, 400)}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`);
  });
  const ctx = { section, page, base, errors };
  const before = checks.length;
  try {
    await S[section](ctx);
    if (checks.length === before) throw new Classified('HARNESS_ERROR', { check: '(section)', step: 'run', expected: 'at least one check', observed: 'no checks ran' });
    sectionResults[section] = 'PASS';
  } catch (e) {
    const cls = e instanceof Classified ? e.result : 'HARNESS_ERROR';
    const info = e instanceof Classified ? e.info : { check: '(section)', step: 'exception', expected: 'no exception', observed: String(e?.stack ?? e).slice(0, 800) };
    if (!(e instanceof Classified)) info.artifacts = [await shot(ctx, 'exception')].filter(Boolean);
    const f = { section, check: info.check, step: info.step, expected: info.expected, observed: info.observed ?? null, action: null, artifacts: info.artifacts ?? [], result: cls };
    failures.push(f);
    checks.push({ section, name: info.check, result: cls });
    sectionResults[section] = cls;
    log(section, `${cls}: ${info.check} — ${info.step}`, info.observed);
    // the first failure classifies the run (it is also manifest.failure)
    if (overall === 'PASS') overall = cls;
  }
  if (errors.length) log(section, `page errors: ${errors.length}`, errors.slice(0, 2));
  await context.close();
}
await browser.close();
if (server) await server.close();

const tracePath = path.join(runDir, 'trace.json');
fs.writeFileSync(tracePath, JSON.stringify(trace, null, 1));
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const manifest = {
  schema: 'acceptance-manifest/1',
  suite: 'rolling-home',
  section: only && only.length === 1 ? only[0] : 'full',
  selection: { mode: only ? 'only' : 'full', sections: selected },
  startedAt,
  endedAt: new Date().toISOString(),
  durationSeconds: +((Date.now() - T0) / 1000).toFixed(1),
  result: overall,
  exitCode: overall === 'PASS' ? 0 : 1,
  counts: { checks: checks.length, passed: checks.filter((c) => c.result === 'PASS').length, failed: checks.filter((c) => c.result !== 'PASS').length },
  sections: sectionResults,
  failure: failures[0] ?? null,
  failures,
  checks,
  trace: rel(tracePath),
  artifacts: [rel(tracePath), ...artifacts],
};
fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\nRESULT ${overall} · ${manifest.counts.passed}/${manifest.counts.checks} checks · ${manifest.durationSeconds}s · ${rel(path.join(runDir, 'manifest.json'))}`);
for (const [s, r] of Object.entries(sectionResults)) console.log(`  ${r === 'PASS' ? '✓' : '✗'} ${s}: ${r}`);
process.exit(manifest.exitCode);
