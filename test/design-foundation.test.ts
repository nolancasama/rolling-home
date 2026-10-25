import { describe, expect, it } from 'vitest';
import vanV1 from './fixtures/v1-van.json';
import classcV1 from './fixtures/v1-classc.json';
import baseline from './fixtures/v1-balance.json';
import { MATERIAL_LIST, PALETTE, materialDef } from '../src/data/materials';
import { VEHICLES } from '../src/data/vehicles';
import { newGame, SAVE_VERSION } from '../src/sim/newgame';
import { deserialize, serialize } from '../src/sim/save';
import { computeWeight } from '../src/sim/weight';
import { checkLayout, layoutOf } from '../src/sim/furnish';
import { capacities, compartments, defOf } from '../src/sim/vehicle';
import { newItem } from '../src/sim/core';
import { interiorAppeal, factoryAppeal } from '../src/sim/appeal';
import { surfaceGeometry, coveringMass, windowArea } from '../src/sim/finishes';
import { tradeInValue } from '../src/sim/shop';

const look = { skin: '#e0b090', hair: '#3a2a1a', hairStyle: 0, shirt: '#3a7a9a', pants: '#2a2a3a' };
const game = (vehicle: 'van' | 'classc' = 'classc') => newGame({ name: 'Designer', look, vehicle, difficulty: 'balanced', seed: 1234 });

describe('frozen content and balance', () => {
  it('has unique materials, exactly 48 palette swatches, and valid factory finishes', () => {
    expect(new Set(MATERIAL_LIST.map(m => m.id)).size).toBe(MATERIAL_LIST.length);
    expect(PALETTE).toHaveLength(48);
    for (const def of Object.values(VEHICLES)) {
      expect(new Set(def.interior.windows.map(w => w.id)).size).toBe(def.interior.windows.length);
      for (const surface of def.interior.surfaces) expect(materialDef(surface.factory.mat).surfaces).toContain(surface.kind);
    }
  });

  for (const vehicle of ['van', 'classc'] as const) {
    it(`${vehicle} preserves recorded v1 new-game total and axle loads within 5 kg`, () => {
      // Recorded from the original code before S1: van 2798.995 / 1426.112 / 1372.883;
      // Class C 4643.925 / 1896.8451136363647 / 2747.0798863636355 (total/front/rear kg).
      const s = game(vehicle), w = computeWeight(s, s.vehicleId);
      for (const key of ['total', 'front', 'rear'] as const) expect(Math.abs(w[key] - baseline[vehicle][key]), key).toBeLessThanOrEqual(5);
      expect(checkLayout(VEHICLES[vehicle], layoutOf(s, s.vehicleId)).valid).toBe(true);
      expect(s.gameType).toBe('life');
      expect(s.version).toBe(2);
    });
  }
});

describe('surface and covering weight deltas', () => {
  it('counts a replacement less the factory floor and positions its axle moment', () => {
    const s = game(), v = s.vehicles[0], d = VEHICLES.classc;
    const floor = d.interior.surfaces.find(f => f.id === 'floor.bedroom')!;
    const { area, d: position } = surfaceGeometry(d, floor);
    const before = computeWeight(s, v.id);
    v.custom.surfaces[floor.id] = { mat: 'lvp_natural_oak' };
    const after = computeWeight(s, v.id);
    const delta = (10.5 - 2.6) * area;
    expect(after.total - before.total).toBeCloseTo(delta);
    expect(after.byCat.finishes).toBeCloseTo(delta);
    expect(after.rear - before.rear).toBeCloseTo(delta * position / d.dims.wheelbase);
    v.custom.surfaces[floor.id] = { mat: 'lvp_glue_thin' };
    const thin = computeWeight(s, v.id);
    expect(thin.total).toBeLessThan(after.total);
    expect(thin.total - before.total).toBeCloseTo((4.5 - 2.6) * area);
    v.custom.surfaces[floor.id] = { mat: 'factory_plywood' };
    expect(computeWeight(s, v.id).byCat.finishes).toBeCloseTo((0.4 - 2.6) * area);
  });

  it('subtracts factory covering fabric and valance, with outside mount margins', () => {
    const s = game(), v = s.vehicles[0], w = VEHICLES.classc.interior.windows.find(w => w.id === 'L1')!;
    const before = computeWeight(s, v.id).total;
    expect(coveringMass(w, w.factory)).toBeCloseTo((w.a1 - w.a0 + 0.1) * (w.y1 - w.y0 + 0.1) * 0.7 + 0.6 * (w.a1 - w.a0));
    v.custom.windows[w.id] = { type: 'blackout_roller', fabric: { mat: 'win_blackout' }, mount: 'inside', hardware: 'black', open: 0 };
    expect(computeWeight(s, v.id).total - before).toBeCloseTo(windowArea(w) - coveringMass(w, w.factory));
    v.custom.windows[w.id].type = 'none';
    expect(computeWeight(s, v.id).total - before).toBeCloseTo(-coveringMass(w, w.factory));
  });
});

describe('appeal', () => {
  it('factory appeal matches a factory game, and slotless plants add exactly their comfort', () => {
    const s = game('van'), vid = s.vehicleId;
    expect(interiorAppeal(s, vid)).toBeCloseTo(factoryAppeal(VEHICLES.van));
    const before = capacities(s, vid).comfort, appeal = interiorAppeal(s, vid);
    newItem(s, 'plant', { kind: 'floor', vehicle: vid, x: 0, z: 0, rot: 0 });
    expect(interiorAppeal(s, vid)).toBe(appeal);
    expect(capacities(s, vid).comfort - before).toBe(1);
  });

  it('improved finishes increase comfort and give bounded trade-in credit', () => {
    const s = game(), v = s.vehicles[0];
    const before = tradeInValue(s), comfort = capacities(s, v.id).comfort;
    for (const surface of VEHICLES.classc.interior.surfaces) v.custom.surfaces[surface.id] = { mat: surface.kind === 'floor' ? 'engineered_oak' : surface.kind === 'trim' ? 'trim_walnut' : 'paint_satin' };
    const value = tradeInValue(s);
    expect(capacities(s, v.id).comfort).toBeGreaterThan(comfort);
    expect(value).toBeGreaterThan(before);
    expect(value - before).toBeLessThanOrEqual(VEHICLES.classc.price * 0.15);
  });
});

describe('authentic v1 save migration', () => {
  for (const [vehicle, fixture] of [['van', vanV1], ['classc', classcV1]] as const) {
    it(`${vehicle}: loads, keeps all owned uids and contents, validates, and preserves mass`, () => {
      const result = deserialize(JSON.stringify(fixture));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const s = result.state;
      expect(s.version).toBe(SAVE_VERSION);
      expect(s.gameType).toBe('life');
      for (const uid of Object.keys(fixture.state.items)) expect(s.items[uid]).toBeDefined();
      for (const it of Object.values(s.items)) {
        expect(['small_cabinet', 'wardrobe', 'tall_cabinet']).not.toContain(it.def);
        const where = it.where;
        if (where.kind === 'stored') expect(compartments(s, where.vehicle).some(c => c.id === where.comp)).toBe(true);
      }
      const chk = checkLayout(VEHICLES[vehicle], layoutOf(s, s.vehicleId));
      expect(chk.valid, JSON.stringify(chk.issues)).toBe(true);
      expect(Math.abs(computeWeight(s, s.vehicleId).total - baseline[vehicle].total)).toBeLessThanOrEqual(5);
      const cabinets = Object.values(fixture.state.items).filter(it => ['small_cabinet', 'wardrobe'].includes(it.def));
      for (const cabinet of cabinets) expect(s.items[cabinet.uid].where).toEqual(cabinet.where);
      if (vehicle === 'classc') {
        for (const def of ['clothes', 'books', 'bedding']) {
          const it = Object.values(s.items).find(it => it.def === def)!;
          expect(it.where.kind === 'stored' && it.where.comp.startsWith('item:')).toBe(true);
        }
      }
      const again = deserialize(serialize(s, 'fixture'));
      expect(again.ok && again.state).toEqual(JSON.parse(JSON.stringify(s)));
    });
  }

  it('preserves legacy cabinet compartment uid references and migrates used stock keys', () => {
    const fixture = structuredClone(vanV1);
    const cabinet = Object.values(fixture.state.items).find(it => it.def === 'small_cabinet')!;
    const books = Object.values(fixture.state.items).find(it => it.def === 'books')!;
    Object.assign(books, { where: { kind: 'stored', vehicle: fixture.state.vehicleId, comp: `item:${cabinet.uid}` } });
    Object.assign(fixture.state.usedSold, { 'dj_rvsupply:small_cabinet': 1 });
    const result = deserialize(JSON.stringify(fixture));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.items[books.uid].where).toEqual(books.where);
    expect(Math.abs(defOf(result.state.items[cabinet.uid]).storage!.liters - 73)).toBeLessThan(3);
    expect(result.state.usedSold['dj_rvsupply:cab_base']).toBe(1);
  });

  it('discards draft-only removals on every load', () => {
    const s = game();
    const it = newItem(s, 'plant', { kind: 'removed', vehicle: s.vehicleId, sell: true });
    const result = deserialize(serialize(s, 'fixture'));
    expect(result.ok && result.state.items[it.uid]).toBeUndefined();
  });

  it('skips a new upper obstructed by an existing custom layout and records why', () => {
    const fixture = structuredClone(vanV1);
    const galley = Object.values(fixture.state.items).find(it => it.def === 'van_galley')!;
    Object.assign(galley, { def: 'tall_cabinet', where: { kind: 'floor', vehicle: fixture.state.vehicleId, x: 0.715, z: -0.15, rot: 3 } });
    const result = deserialize(JSON.stringify(fixture));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.items[galley.uid].def).toBe('cab_tall');
    expect(Object.values(result.state.items).some(it => it.def === 'cab_upper')).toBe(false);
    expect(result.state.journal.some(entry => entry.text === 'One overhead cabinet did not fit your custom layout')).toBe(true);
    expect(Object.values(result.state.items).filter(it => it.def === 'light_dome')).toHaveLength(2);
  });
});
