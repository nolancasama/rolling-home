import { describe, expect, it, vi } from 'vitest';
import { DENSITY, PERSON_MASS, RENOVATION } from '../src/data/config';
import { materialDef } from '../src/data/materials';
import { ANCHORS } from '../src/data/map';
import { VEHICLES } from '../src/data/vehicles';
import type { WindowTreatment } from '../src/data/types';
import { newItem } from '../src/sim/core';
import { coveringArea, coveringMass, coveringTransmission, surfaceGeometry } from '../src/sim/finishes';
import { freeWallSpan } from '../src/sim/furnish';
import { newGame } from '../src/sim/newgame';
import { makeBlueprint } from '../src/sim/blueprints';
import * as renovation from '../src/sim/renovation';
import { mulberry32 } from '../src/sim/rng';
import { deserialize, serialize } from '../src/sim/save';
import { Sim } from '../src/sim/sim';
import { compartments, defOf, itemKg, slotUse } from '../src/sim/vehicle';
import { computeWeight } from '../src/sim/weight';
import type { GameState } from '../src/sim/types';

const look = { skin: '#e0b090', hair: '#3a2a1a', hairStyle: 0, shirt: '#3a7a9a', pants: '#2a2a3a' };
const ctx = { pro: false, atShop: true, atService: true };
const floor = (x = 0, z = 0, rot = 0) => ({ kind: 'floor' as const, x, z, rot });
const slot = { kind: 'slot' as const, slot: 'battery' as const };
const game = () => {
  const s = newGame({ name: 'Designer', look, vehicle: 'classc', difficulty: 'balanced', seed: 1234 });
  s.cash = 100_000;
  return s;
};
const empty = () => {
  const s = game();
  for (const it of Object.values(s.items)) {
    if (it.where.kind === 'floor' || it.where.kind === 'mattress' || it.where.kind === 'stored') delete s.items[it.uid];
  }
  return s;
};
const roller = (open = 0): WindowTreatment => ({ type: 'blackout_roller', fabric: { mat: 'win_blackout' }, hardware: 'black', mount: 'inside', open });
const uidOf = (s: GameState, def: string) => Object.values(s.items).find(it => it.def === def)!.uid;
const good = <T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> => {
  expect(result, JSON.stringify(result)).toHaveProperty('ok', true);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result as Extract<T, { ok: true }>;
};
const snapshot = (d: renovation.Draft) => JSON.parse(JSON.stringify({ items: d.s.items, vehicles: d.s.vehicles, uidCounter: d.s.uidCounter }));
const massOfParts = (s: GameState) => {
  const v = s.vehicles[0], def = VEHICLES[v.def];
  let kg = def.shellMass + PERSON_MASS + v.fuel * DENSITY[def.fuelType] +
    (v.fresh + v.gray + v.black) * DENSITY.water + v.propane;
  for (const it of Object.values(s.items)) {
    if ('vehicle' in it.where && it.where.vehicle === v.id && it.where.kind !== 'removed') kg += itemKg(it);
  }
  for (const surface of def.interior.surfaces) {
    const finish = v.custom.surfaces[surface.id] ?? surface.factory;
    kg += surfaceGeometry(def, surface).area * (materialDef(finish.mat).kgPerM2 - materialDef(surface.factory.mat).kgPerM2);
  }
  for (const window of def.interior.windows.filter(w => !w.door)) {
    kg += coveringMass(window, v.custom.windows[window.id] ?? window.factory) - coveringMass(window, window.factory);
  }
  return kg;
};
const assertRefusedUnchanged = (d: renovation.Draft, operation: () => { ok: boolean }) => {
  const before = snapshot(d);
  expect(operation().ok).toBe(false);
  expect(snapshot(d)).toEqual(before);
};

describe('renovation draft operations', () => {
  it('isolates the base and treats cancelling as dropping a draft', () => {
    const s = empty(), before = structuredClone(s), d = renovation.begin(s, s.vehicleId);
    good(renovation.addFromCatalog(d, 'plant', floor()));
    good(renovation.setFinish(d, { surface: 'floor.living' }, { mat: 'lvp_natural_oak' }));
    expect(d.s).not.toBe(s);
    expect(d.s.items).not.toBe(s.items);
    expect(s).toEqual(before);
    expect(d.base).toEqual(before);
  });

  it('adds floor, wall, ceiling and slot items, refusing geometry and bay capacity atomically', () => {
    const s = empty(), d = renovation.begin(s, s.vehicleId);
    const plant = good(renovation.addFromCatalog(d, 'plant', floor())).uid;
    good(renovation.addFromCatalog(d, 'light_reading', { ...floor(1.06, -1, 3), y: 1.5 }));
    good(renovation.addFromCatalog(d, 'light_puck', floor(0, 1)));
    good(renovation.addFromCatalog(d, 'lithium_battery', slot));
    expect(d.s.items[plant].where.kind).toBe('floor');
    assertRefusedUnchanged(d, () => renovation.addFromCatalog(d, 'plant', floor(9, 0)));
    assertRefusedUnchanged(d, () => renovation.addFromCatalog(d, 'plant', floor()));
    assertRefusedUnchanged(d, () => renovation.addFromCatalog(d, 'lithium_300', slot));
    assertRefusedUnchanged(d, () => renovation.addFromCatalog(d, 'light_reading', { ...floor(), y: 5 }));
    assertRefusedUnchanged(d, () => renovation.addFromCatalog(d, 'does-not-exist', floor()));
  });

  it('places owned inventory, moves a group together and rotates only when all placements are valid', () => {
    const s = empty();
    const a = newItem(s, 'plant', { kind: 'stored', vehicle: s.vehicleId, comp: 'rearbay' });
    const b = newItem(s, 'plant', { kind: 'floor', vehicle: s.vehicleId, x: .7, z: 0, rot: 0 });
    const d = renovation.begin(s, s.vehicleId);
    good(renovation.placeOwned(d, a.uid, floor(-.7, 0)));
    assertRefusedUnchanged(d, () => renovation.placeOwned(d, 'missing', floor()));
    // Swapping occupied positions succeeds because the entire proposed layout is validated together.
    good(renovation.moveItems(d, [{ uid: a.uid, x: .7, z: 0 }, { uid: b.uid, x: -.7, z: 0 }]));
    good(renovation.rotate(d, a.uid));
    assertRefusedUnchanged(d, () => renovation.moveItems(d, [{ uid: a.uid, x: 5, z: 0 }, { uid: b.uid, x: 0, z: 0 }]));
    const cabinet = good(renovation.addFromCatalog(d, 'cab_base', floor(.94, -1, 3), { config: { w: .5, h: .55, d: .4 } })).uid;
    assertRefusedUnchanged(d, () => renovation.rotate(d, cabinet));
    expect(renovation.summary(d, ctx).canCommit).toBe(true);
  });

  it('edits new configurations, finishes, coverings, lights and states with refusal rollback', () => {
    const s = empty(), d = renovation.begin(s, s.vehicleId);
    const cabinet = good(renovation.addFromCatalog(d, 'cab_base', floor(.94, -1, 3), { config: { w: .5, h: .55, d: .4 } })).uid;
    good(renovation.setConfig(d, cabinet, { w: .6, h: .55, d: .4, handle: 'knob' }));
    good(renovation.setFinish(d, { uid: cabinet, slot: 'fronts' }, { mat: 'paint_satin', color: '#334455' }));
    good(renovation.setFinish(d, { surface: 'floor.living' }, { mat: 'lvp_natural_oak', rot: 90, scale: 1.3 }));
    good(renovation.setWindow(d, 'L2', roller()));
    good(renovation.setFinish(d, { window: 'L2', layer: 'fabric' }, { mat: 'win_blackout', color: '#123456' }));
    const light = good(renovation.addFromCatalog(d, 'light_puck', floor())).uid;
    good(renovation.setLight(d, light, { mode: 'on', dim: .5, kelvin: 3500 }));
    const table = good(renovation.addFromCatalog(d, 'folding_table', floor(1.09, 1.05, 3))).uid;
    good(renovation.setState(d, table, 'open'));
    good(renovation.setState(d, table, 'folded'));
    assertRefusedUnchanged(d, () => renovation.setConfig(d, uidOf(s, 'agm_battery'), {}));
    assertRefusedUnchanged(d, () => renovation.setConfig(d, cabinet, { w: .6, h: .55, d: .6 }));
    assertRefusedUnchanged(d, () => renovation.setFinish(d, { surface: 'floor.living' }, { mat: 'win_blackout' }));
    assertRefusedUnchanged(d, () => renovation.setFinish(d, { uid: cabinet, slot: 'missing' }, { mat: 'paint_satin' }));
    assertRefusedUnchanged(d, () => renovation.setWindow(d, 'D1', roller()));
    assertRefusedUnchanged(d, () => renovation.setLight(d, cabinet, { mode: 'on', dim: 1, kelvin: 3000 }));
    assertRefusedUnchanged(d, () => renovation.setState(d, table, 'missing'));
  });

  it('swaps a mattress, removes an unpurchased item entirely, and refuses an incompatible mattress', () => {
    const s = game(), d = renovation.begin(s, s.vehicleId), bed = uidOf(s, 'double_bed');
    good(renovation.swapMattress(d, bed, 'foam_double'));
    expect(renovation.summary(d, ctx).diyMinutes).toBe(2);
    expect(Object.values(d.s.items).filter(it => it.where.kind === 'mattress' && it.where.bed === bed)).toHaveLength(1);
    assertRefusedUnchanged(d, () => renovation.swapMattress(d, bed, 'foam_van'));
    good(renovation.remove(d, uidOf(d.s, 'dinette')));
    const table = good(renovation.addFromCatalog(d, 'folding_table', floor(1.09, 1.05, 3))).uid;
    good(renovation.remove(d, table));
    expect(d.s.items[table]).toBeUndefined();
    assertRefusedUnchanged(d, () => renovation.remove(d, 'missing'));
  });

  it('refuses unfolding into an obstacle and placing inventory from another vehicle', () => {
    const s = empty();
    const table = newItem(s, 'folding_table', { kind: 'floor', vehicle: s.vehicleId, x: 1.09, z: .9, rot: 3 });
    newItem(s, 'plant', { kind: 'floor', vehicle: s.vehicleId, x: .8, z: .9, rot: 0 });
    const foreign = newItem(s, 'plant', { kind: 'stored', vehicle: 'other-rv', comp: 'rearbay' });
    const d = renovation.begin(s, s.vehicleId);
    assertRefusedUnchanged(d, () => renovation.setState(d, table.uid, 'open'));
    assertRefusedUnchanged(d, () => renovation.placeOwned(d, foreign.uid, floor()));
  });

  it('refuses a placement that newly blocks another item while tolerating prior blueprint issues', () => {
    const s = empty();
    newItem(s, 'double_bed', { kind: 'floor', vehicle: s.vehicleId, x: 0, z: -2.94, rot: 0 });
    const d = renovation.begin(s, s.vehicleId);
    // A 2 m sofa across the aisle ahead of the bed leaves 14 cm at each side: nobody can walk past it.
    assertRefusedUnchanged(d, () => renovation.addFromCatalog(d, 'sofa_lounge', floor(0, -1.0, 0), { config: { w: 2.0 } }));
    const blocked = renovation.addFromCatalog(d, 'sofa_lounge', floor(0, -1.0, 0), { config: { w: 2.0 } });
    expect(blocked).toMatchObject({ ok: false, reason: 'Would block the way to Double bed frame.' });

    const source = empty();
    newItem(source, 'plant', { kind: 'floor', vehicle: source.vehicleId, x: 10, z: 0, rot: 0 });
    const blueprint = makeBlueprint(source, source.vehicleId, { id: 'broken', name: 'Broken layout', createdAt: '2026-10-25T00:00:00.000Z' });
    const draft = renovation.begin(empty(), source.vehicleId);
    good(renovation.applyBlueprint(draft, blueprint));
    good(renovation.addFromCatalog(draft, 'plant', floor()));
  });

  it('records all undo snapshots, restores them in both directions, clears redo, and caps history at 200', () => {
    const s = empty(), d = renovation.begin(s, s.vehicleId), before = snapshot(d);
    good(renovation.addFromCatalog(d, 'plant', floor()));
    good(renovation.setFinish(d, { surface: 'floor.living' }, { mat: 'lvp_natural_oak' }));
    good(renovation.setWindow(d, 'L2', roller()));
    const after = snapshot(d);
    for (let i = 0; i < 3; i++) good(renovation.undo(d));
    expect(snapshot(d)).toEqual(before);
    expect(renovation.undo(d).ok).toBe(false);
    for (let i = 0; i < 3; i++) good(renovation.redo(d));
    expect(snapshot(d)).toEqual(after);
    good(renovation.undo(d));
    good(renovation.setWindow(d, 'L2', roller(.5)));
    expect(renovation.redo(d).ok).toBe(false);
    for (let i = 0; i < 205; i++) good(renovation.setWindow(d, 'L2', roller(i % 2)));
    let count = 0;
    while (renovation.undo(d).ok) count++;
    expect(count).toBe(200);
  });
});

describe('removal dispositions and contents', () => {
  it('can sell an owned item after placing it from storage and removing it again', () => {
    const s = empty();
    const owned = newItem(s, 'plant', { kind: 'stored', vehicle: s.vehicleId, comp: 'rearbay' });
    const d = renovation.begin(s, s.vehicleId);
    good(renovation.placeOwned(d, owned.uid, floor()));
    good(renovation.remove(d, owned.uid));
    good(renovation.setRemoval(d, owned.uid, 'sell'));
    const quote = renovation.summary(d, { ...renovation.renovationContext(s), pro: false });
    expect(quote.sales).toBe(Math.round(defOf(owned).price * .3));
    expect(quote.diyMinutes).toBe(0);
    const cash = s.cash;
    good(renovation.commit(s, d, { pro: false }));
    expect(s.items[owned.uid]).toBeUndefined();
    expect(s.cash - cash).toBe(quote.sales);
  });

  it('relocates storage contents and supports store, sell and discard', () => {
    const s = game(), dinette = uidOf(s, 'dinette');
    const books = newItem(s, 'books', { kind: 'stored', vehicle: s.vehicleId, comp: `item:${dinette}` });
    const d = renovation.begin(s, s.vehicleId);
    good(renovation.remove(d, dinette));
    expect(d.s.items[books.uid].where).not.toEqual(books.where);
    expect(d.s.items[books.uid].where.kind).toBe('stored');
    good(renovation.setRemoval(d, dinette, 'sell'));
    expect(renovation.summary(d, ctx).sales).toBe(Math.round(defOf(s.items[dinette]).price * .3 * s.items[dinette].condition));
    good(renovation.setRemoval(d, dinette, 'discard'));
    expect(renovation.summary(d, ctx).sales).toBe(0);
    const battery = uidOf(s, 'agm_battery');
    good(renovation.remove(d, battery));
    good(renovation.setRemoval(d, battery, 'store'));
    expect(d.s.items[battery].where.kind).toBe('stored');
    assertRefusedUnchanged(d, () => renovation.setRemoval(d, 'missing', 'store'));
    good(renovation.commit(s, d, { pro: false }));
    expect(s.items[dinette]).toBeUndefined();
    expect(s.items[books.uid]).toBeDefined();
    expect(Object.values(s.items).some(it => it.where.kind === 'removed')).toBe(false);
  });

  it('refuses removal without orphaning refrigerated contents and rechecks room for store', () => {
    const s = game(), fridge = uidOf(s, 'threeway_fridge');
    newItem(s, 'cargo', { kind: 'stored', vehicle: s.vehicleId, comp: `item:${fridge}` }, {
      cargo: { name: 'Cold cargo', dims: [.1, .1, .1], mass: 1, refrigerated: true, damage: 0, jobId: 'test' },
    });
    const d = renovation.begin(s, s.vehicleId);
    const before = snapshot(d), refused = renovation.remove(d, fridge);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toMatch(/room|refrigerat/i);
    expect(snapshot(d)).toEqual(before);
    const dinette = uidOf(s, 'dinette');
    good(renovation.remove(d, dinette));
    const battery = uidOf(s, 'agm_battery');
    good(renovation.remove(d, battery));
    good(renovation.setRemoval(d, battery, 'store'));
    good(renovation.setRemoval(d, battery, 'sell'));
    for (const comp of compartments(d.s, d.vid)) newItem(d.s, 'cargo', { kind: 'stored', vehicle: d.vid, comp: comp.id }, {
      cargo: { name: 'Full compartment', dims: [.1, .1, .1], mass: comp.maxKg, damage: 0, jobId: 'test' },
    });
    assertRefusedUnchanged(d, () => renovation.setRemoval(d, battery, 'store'));
  });
});

describe('renovation pricing and atomic commit', () => {
  it('prices materials by area, delivery and pro labor, with free reversions and creative totals', () => {
    const s = empty(), d = renovation.begin(s, s.vehicleId);
    const surface = VEHICLES.classc.interior.surfaces.find(surface => surface.id === 'floor.living')!;
    const area = surfaceGeometry(VEHICLES.classc, surface).area;
    good(renovation.setFinish(d, { surface: surface.id }, { mat: 'lvp_natural_oak' }));
    const diy = renovation.summary(d, ctx);
    expect(diy.goods).toBeCloseTo(area * materialDef('lvp_natural_oak').pricePerM2, 2);
    expect(diy.diyMinutes).toBeCloseTo(area * materialDef('lvp_natural_oak').laborPerM2);
    expect(diy.labor).toBe(0);
    const delivered = renovation.summary(d, { ...ctx, atShop: false });
    expect(delivered.delivery).toBeCloseTo(Math.max(15, .08 * diy.goods), 2);
    const pro = renovation.summary(d, { ...ctx, pro: true });
    expect(pro.proCost).toBeCloseTo(diy.diyMinutes / 60 * 70, 2);
    expect(pro.minutes).toBeCloseTo(diy.diyMinutes * .35);
    expect(renovation.summary(d, { ...ctx, pro: true, atService: false }).canCommit).toBe(false);
    good(renovation.setFinish(d, { surface: surface.id }, surface.factory));
    expect(renovation.summary(d, ctx).goods).toBe(0);
    s.gameType = 'creative';
    const creative = renovation.begin(s, s.vehicleId);
    good(renovation.setFinish(creative, { surface: surface.id }, { mat: 'lvp_natural_oak' }));
    const free = renovation.summary(creative, ctx);
    expect(free.total).toBe(0);
    expect(free.minutes).toBe(0);
    expect(free.lines.some(line => line.amount > 0)).toBe(true);
  });

  it('uses the delivery minimum for a small order and eight percent for a larger order', () => {
    const s = empty(), d = renovation.begin(s, s.vehicleId);
    good(renovation.addFromCatalog(d, 'plant', floor()));
    expect(renovation.summary(d, { ...ctx, atShop: false }).delivery).toBe(15);
    good(renovation.addFromCatalog(d, 'lithium_battery', slot));
    const larger = renovation.summary(d, { ...ctx, atShop: false });
    expect(larger.delivery).toBeCloseTo(larger.goods * .08, 2);
  });

  it('prices new furniture, cabinet, fixture, system and appliance installation categories', () => {
    for (const [def, place, opts, minutes] of [
      ['plant', floor(), {}, 10],
      ['cab_base', floor(.94, -1, 3), { config: { w: .5, h: .55, d: .4 } }, 35],
      ['light_puck', floor(), {}, 15],
      ['lithium_battery', slot, {}, 40],
      ['fridge_75', floor(.865, -1, 3), {}, 45],
      ['wet_bath', floor(-.73, -1.79, 1), {}, 120],
      ['threeway_fridge', floor(.83, -1.3, 3), {}, 60],
    ] as const) {
      const s = empty(), d = renovation.begin(s, s.vehicleId);
      const added = good(renovation.addFromCatalog(d, def, place, opts));
      const quote = renovation.summary(d, ctx);
      expect(quote.goods, def).toBeCloseTo(defOf(d.s.items[added.uid]).price, 2);
      expect(quote.diyMinutes, def).toBe(minutes);
    }
  });

  it('prices new cabinet finish choices as purchase options without double-charging countertops', () => {
    const walnutState = empty(), walnut = renovation.begin(walnutState, walnutState.vehicleId);
    const walnutCabinet = good(renovation.addFromCatalog(walnut, 'cab_base', floor(.94, -1, 3), {
      config: { w: .5, h: .55, d: .4 }, finish: { fronts: { mat: 'cab_walnut' } },
    })).uid;
    const walnutItem = walnut.s.items[walnutCabinet], walnutQuote = renovation.summary(walnut, ctx);
    const walnutPremium = .5 * .55 * (materialDef('cab_walnut').pricePerM2 - materialDef('paint_satin').pricePerM2);
    expect(walnutQuote.goods).toBeCloseTo(defOf(walnutItem).price + walnutPremium, 2);
    expect(walnutQuote.diyMinutes).toBe(RENOVATION.installMinutes.cabinet);
    expect(walnutQuote.lines.find(line => line.label === 'Base cabinet: Walnut veneer fronts')).toMatchObject({ amount: expect.closeTo(walnutPremium, 2), minutes: 0 });

    const quartzState = empty(), quartz = renovation.begin(quartzState, quartzState.vehicleId);
    const quartzCabinet = good(renovation.addFromCatalog(quartz, 'cab_base', floor(.94, -1, 3), {
      config: { w: .5, h: .55, d: .4 }, finish: { counter: { mat: 'counter_quartz' } },
    })).uid;
    const quartzItem = quartz.s.items[quartzCabinet], quartzQuote = renovation.summary(quartz, ctx);
    expect(quartzQuote.goods).toBeCloseTo(defOf(quartzItem).price, 2);
    expect(quartzQuote.diyMinutes).toBe(RENOVATION.installMinutes.cabinet);
    expect(quartzQuote.lines.some(line => line.ref === quartzCabinet && line.kind === 'refinish' && /counter/i.test(line.label))).toBe(false);
  });

  it('charges owned cabinet placement and relocation, and half labor on removal; furniture moves are free', () => {
    const s = empty();
    const cabinet = newItem(s, 'cab_base', { kind: 'stored', vehicle: s.vehicleId, comp: 'rearbay' }, { config: { w: .5, h: .55, d: .4 } });
    const plant = newItem(s, 'plant', { kind: 'stored', vehicle: s.vehicleId, comp: 'rearbay' });
    const d = renovation.begin(s, s.vehicleId);
    good(renovation.placeOwned(d, cabinet.uid, floor(.94, -1, 3)));
    good(renovation.placeOwned(d, plant.uid, floor()));
    expect(renovation.summary(d, ctx).goods).toBe(0);
    expect(renovation.summary(d, ctx).diyMinutes).toBe(35);
    good(renovation.commit(s, d, { pro: false }));
    const move = renovation.begin(s, s.vehicleId);
    good(renovation.moveItems(move, [{ uid: cabinet.uid, x: .94, z: -.8 }, { uid: plant.uid, x: 0, z: .2 }]));
    expect(renovation.summary(move, ctx).diyMinutes).toBe(35);
    good(renovation.remove(move, cabinet.uid));
    expect(renovation.summary(move, ctx).diyMinutes).toBe(17.5);
  });

  it('prices cabinet slots and handles, coverings and valances while settings and states stay free', () => {
    const s = game(), d = renovation.begin(s, s.vehicleId), cabinet = uidOf(s, 'cab_upper');
    good(renovation.setFinish(d, { uid: cabinet, slot: 'fronts' }, { mat: 'paint_satin' }));
    const c = defOf(d.s.items[cabinet]).floor!;
    const fronts = renovation.summary(d, ctx);
    expect(fronts.goods).toBeCloseTo(c.footprint[0] * c.height * materialDef('paint_satin').pricePerM2, 2);
    expect(fronts.diyMinutes).toBeCloseTo(c.footprint[0] * c.height * 40);
    good(renovation.setFinish(d, { uid: cabinet, slot: 'handles' }, { mat: 'metal_black' }));
    expect(renovation.summary(d, ctx).goods).toBeGreaterThan(fronts.goods);
    good(renovation.setWindow(d, 'L2', { ...roller(), valance: { mat: 'win_blackout' } }));
    const covered = renovation.summary(d, ctx);
    expect(covered.goods).toBeGreaterThan(fronts.goods);
    const l2 = VEHICLES.classc.interior.windows.find(window => window.id === 'L2')!;
    const withoutValance = renovation.begin(s, s.vehicleId);
    good(renovation.setWindow(withoutValance, 'L2', roller()));
    const withValance = renovation.begin(s, s.vehicleId);
    good(renovation.setWindow(withValance, 'L2', { ...roller(), valance: { mat: 'win_blackout' } }));
    expect(renovation.summary(withValance, ctx).goods - renovation.summary(withoutValance, ctx).goods).toBeCloseTo(RENOVATION.valance.basePrice + RENOVATION.valance.pricePerMeter * (l2.a1 - l2.a0), 2);
    expect(renovation.summary(withValance, ctx).diyMinutes - renovation.summary(withoutValance, ctx).diyMinutes).toBe(RENOVATION.valance.laborMinutes);
    expect(coveringArea(VEHICLES.classc.interior.windows.find(w => w.id === 'L2')!, roller())).toBeGreaterThan(0);
    const free = renovation.begin(s, s.vehicleId);
    good(renovation.setState(free, uidOf(s, 'dinette'), 'bed'));
    good(renovation.setLight(free, uidOf(s, 'light_dome'), { mode: 'off', dim: 1, kelvin: 3000 }));
    expect(renovation.summary(free, ctx).total).toBe(0);
    expect(renovation.summary(free, ctx).minutes).toBe(0);
  });

  it('commits the quoted cash, inventory and weight and leaves all real bytes unchanged when cash is short', () => {
    const s = game(), d = renovation.begin(s, s.vehicleId);
    good(renovation.remove(d, uidOf(s, 'dinette')));
    good(renovation.setRemoval(d, uidOf(s, 'dinette'), 'sell'));
    good(renovation.setFinish(d, { surface: 'floor.living' }, { mat: 'lvp_glue_thin' }));
    const actualContext = renovation.renovationContext(s);
    const quote = renovation.summary(d, { ...actualContext, pro: false });
    const beforeCash = s.cash, beforeJournal = s.journal.length;
    expect(quote.canCommit).toBe(true);
    const result = good(renovation.commit(s, d, { pro: false }));
    expect(result.cost).toBe(quote.total);
    expect(s.cash).toBeCloseTo(beforeCash - quote.total, 2);
    expect(computeWeight(s, s.vehicleId).total).toBeCloseTo(quote.weightAfter.total, 2);
    expect(s.journal).toHaveLength(beforeJournal + 1);
    expect(s.tx.some(tx => tx.category === 'equipment' && tx.label.startsWith('Renovation:'))).toBe(true);
    expect(s.tx.some(tx => tx.category === 'sale')).toBe(true);
    const low = game();
    low.cash = 0;
    const lowDraft = renovation.begin(low, low.vehicleId);
    good(renovation.setFinish(lowDraft, { surface: 'floor.living' }, { mat: 'lvp_natural_oak' }));
    const bytes = JSON.stringify(low);
    expect(renovation.summary(lowDraft, { ...renovation.renovationContext(low), pro: false }).canCommit).toBe(false);
    expect(renovation.commit(low, lowDraft, { pro: false }).ok).toBe(false);
    expect(JSON.stringify(low)).toBe(bytes);
  });

  it('revalidates the complete layout at commit without mutating the real state on refusal', () => {
    const s = empty(), d = renovation.begin(s, s.vehicleId);
    const plant = good(renovation.addFromCatalog(d, 'plant', floor())).uid;
    d.s.items[plant].where = { kind: 'floor', vehicle: s.vehicleId, x: 10, z: 0, rot: 0 };
    const before = JSON.stringify(s);
    const quote = renovation.summary(d, ctx);
    expect(quote.canCommit).toBe(false);
    expect(quote.issues.some(issue => issue.uid === plant && issue.severity === 'block')).toBe(true);
    expect(renovation.commit(s, d, { pro: false }).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('derives shop/service context from the vehicle and facade advances only successful commits', () => {
    const s = empty();
    const supply = ANCHORS.find(a => a.kind === 'shop' && a.ref === 'dj_rvsupply')!;
    s.vehicles[0].pose = { x: supply.x, z: supply.z, heading: 0 };
    expect(renovation.renovationContext(s)).toEqual({ atShop: true, atService: true });
    const sim = new Sim(s), notify = vi.fn();
    sim.onChange(notify);
    const d = sim.beginDesign();
    good(renovation.addFromCatalog(d, 'plant', floor()));
    const before = s.time.minutes;
    const result = good(sim.commitDesign(d, { pro: false }));
    expect(s.time.minutes - before).toBe(result.minutes);
    expect(notify).toHaveBeenCalledTimes(1);
    sim.dispose();
  });
});

describe('complete renovation scenario and seeded editing session', () => {
  it('renovates a used Class C and persists the complete draft through commit and save/load', () => {
    const s = game(), d = renovation.begin(s, s.vehicleId), dinette = uidOf(s, 'dinette');
    const baseline = computeWeight(s, s.vehicleId).total;
    good(renovation.remove(d, dinette));
    good(renovation.setRemoval(d, dinette, 'sell'));
    expect(computeWeight(d.s, d.vid).total).toBeLessThan(baseline);
    good(renovation.setFinish(d, { surface: 'floor.living' }, { mat: 'lvp_natural_oak', rot: 90, scale: 1.35, plankW: .23, plankL: 1.52 }));
    const upper = uidOf(s, 'cab_upper');
    good(renovation.setFinish(d, { uid: upper, slot: 'fronts' }, { mat: 'paint_satin', color: '#31534d' }));
    good(renovation.setFinish(d, { uid: upper, slot: 'handles' }, { mat: 'metal_black' }));
    const gap = freeWallSpan(d.s, d.vid, 'left', -.4, .05, .5);
    expect(gap.length).toBeGreaterThanOrEqual(1.2);
    const width = Math.min(1.2, Math.floor(gap.length / .05) * .05);
    const cabinet = good(renovation.addFromCatalog(d, 'cab_base', floor(.94, -.4, 3), { config: { w: width, h: .55, d: .4 } })).uid;
    expect(defOf(d.s.items[cabinet]).floor!.footprint[0]).toBeLessThanOrEqual(gap.length);
    const table = good(renovation.addFromCatalog(d, 'folding_table', floor(1.09, 1.05, 3))).uid;
    good(renovation.setState(d, table, 'open'));
    good(renovation.setState(d, table, 'folded'));
    good(renovation.setWindow(d, 'L2', roller()));
    expect(coveringTransmission(d.s.vehicles[0].custom.windows.L2)).toBe(materialDef('win_blackout').transmission);
    good(renovation.setWindow(d, 'L2', roller(1)));
    expect(coveringTransmission(d.s.vehicles[0].custom.windows.L2)).toBe(1);
    const watts = renovation.summary(d, ctx).nightLoadAfter;
    good(renovation.addFromCatalog(d, 'light_undercab', { ...floor(1.12, -.05, 3), y: 1.455 }, { config: { length: .6 }, light: { mode: 'auto', dim: 1, kelvin: 3000 } }));
    expect(renovation.summary(d, ctx).nightLoadAfter - watts).toBeCloseTo(2.4);
    const agm = uidOf(s, 'agm_battery');
    good(renovation.remove(d, agm));
    good(renovation.setRemoval(d, agm, 'sell'));
    const weight = computeWeight(d.s, d.vid).total;
    good(renovation.addFromCatalog(d, 'lithium_300', slot));
    expect(computeWeight(d.s, d.vid).total - weight).toBeCloseTo(31);
    expect(slotUse(d.s, d.vid, 'battery')).toMatchObject({ used: 3, capacity: 3 });
    const beforeFridge = renovation.summary(d, ctx).total;
    const refused = renovation.addFromCatalog(d, 'fridge_residential', floor(.745, -.4, 3));
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toMatch(/cannot fit through.*entry door.*0\.68/);
    expect(renovation.summary(d, ctx).total).toBe(beforeFridge);
    const ready = snapshot(d);
    for (let i = 0; i < 4; i++) good(renovation.undo(d));
    for (let i = 0; i < 4; i++) good(renovation.redo(d));
    expect(snapshot(d)).toEqual(ready);
    const quote = renovation.summary(d, { ...renovation.renovationContext(s), pro: false });
    expect(quote.canCommit, quote.reason).toBe(true);
    good(renovation.commit(s, d, { pro: false }));
    expect(s.items[dinette]).toBeUndefined();
    expect(s.items[agm]).toBeUndefined();
    expect(computeWeight(s, s.vehicleId).total).toBeCloseTo(quote.weightAfter.total, 2);
    const loaded = deserialize(serialize(s, 'scenario'));
    expect(loaded.ok && loaded.state).toEqual(JSON.parse(JSON.stringify(s)));
  });

  it('preserves inventory, locations and mass in 500 deterministic edit/undo/redo operations', () => {
    const s = empty(), d = renovation.begin(s, s.vehicleId), rng = mulberry32(0x5eeda11);
    // Keep successful plants at the wall so arbitrary edit order cannot seal the aisle;
    // occasional outside coordinates exercise refusal and rollback too.
    const randomX = () => rng() < .2 ? 2 : rng() < .5 ? -.9 : .9;
    for (let step = 0; step < 500; step++) {
      const choice = Math.floor(rng() * 8), items = Object.values(d.s.items).filter(it => it.def === 'plant');
      const item = items[Math.floor(rng() * items.length)];
      if (choice === 0) renovation.addFromCatalog(d, 'plant', floor(randomX(), -2 + rng() * 3));
      else if (choice === 1 && item) renovation.moveItems(d, [{ uid: item.uid, x: randomX(), z: -2 + rng() * 3 }]);
      else if (choice === 2 && item) renovation.rotate(d, item.uid);
      else if (choice === 3 && item) renovation.remove(d, item.uid);
      else if (choice === 4) renovation.undo(d);
      else if (choice === 5) renovation.redo(d);
      else if (choice === 6) renovation.setWindow(d, 'L2', roller(rng()));
      else renovation.setFinish(d, { surface: 'floor.living' }, { mat: rng() < .5 ? 'lvp_glue_thin' : 'factory_carpet', rot: rng() < .5 ? 0 : 90 });
      const instances = Object.values(d.s.items);
      expect(new Set(instances.map(it => it.uid)).size, `step ${step}`).toBe(instances.length);
      for (const it of instances) {
        expect(it.where).toBeDefined();
        expect(['floor', 'slot', 'stored', 'mattress', 'removed', 'carried', 'locker', 'outdoor']).toContain(it.where.kind);
        const where = it.where;
        if (where.kind === 'stored') expect(compartments(d.s, where.vehicle).some(c => c.id === where.comp)).toBe(true);
      }
      const w = computeWeight(d.s, d.vid);
      expect(w.total).toBeCloseTo(massOfParts(d.s), 8);
    }
    const quote = renovation.summary(d, { ...renovation.renovationContext(s), pro: false });
    expect(quote.canCommit, quote.reason).toBe(true);
    good(renovation.commit(s, d, { pro: false }));
    expect(Object.values(s.items).some(it => it.where.kind === 'removed')).toBe(false);
    const w = computeWeight(s, s.vehicleId);
    expect(w.total).toBeCloseTo(quote.weightAfter.total, 2);
    expect(w.total).toBeCloseTo(massOfParts(s), 8);
  });
});
