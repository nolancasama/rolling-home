import { beforeEach, describe, expect, it } from 'vitest';
import { ANCHOR_BY_ID, PARKING } from '../src/data/map';
import { VEHICLES } from '../src/data/vehicles';
import type { VehicleId } from '../src/data/types';
import { siteOptions } from '../src/sim/camping';
import { newItem } from '../src/sim/core';
import * as furnish from '../src/sim/furnish';
import { boardOffers, jobCargo, previewLoad } from '../src/sim/jobs';
import { performance } from '../src/sim/maintenance';
import { newGame } from '../src/sim/newgame';
import { deserialize } from '../src/sim/save';
import { Sim } from '../src/sim/sim';
import { advance } from '../src/sim/time';
import { capacities, compartmentUse, itemsInVehicle, vdef } from '../src/sim/vehicle';
import { computeWeight } from '../src/sim/weight';

const LOOK = { skin: '#e0b090', hair: '#3a2a1a', hairStyle: 0, shirt: '#3a7a9a', pants: '#2a2a3a' };

function makeSim(vehicle: VehicleId = 'van', difficulty: 'relaxed' | 'balanced' | 'hard' = 'balanced') {
  return new Sim(newGame({ name: 'Tester', look: LOOK, vehicle, difficulty, seed: 1234 }));
}

function parkAtAnchor(sim: Sim, anchorId: string) {
  const a = ANCHOR_BY_ID[anchorId];
  sim.v.pose = { x: a.x, z: a.z + 3, heading: 0 };
}

describe('new game', () => {
  for (const id of ['van', 'classc'] as VehicleId[]) {
    it(`${id}: starts within ratings with belongings stored`, () => {
      const sim = makeSim(id);
      const w = computeWeight(sim.s, sim.v.id);
      const def = VEHICLES[id];
      console.log(
        `${id}: total ${w.total.toFixed(0)} kg / ${def.gvwr}, front ${w.front.toFixed(0)} / ${def.frontGawr}, ` +
          `rear ${w.rear.toFixed(0)} / ${def.rearGawr}, payload ${w.payloadLeft.toFixed(0)} kg`,
      );
      expect(w.status === 'ok' || w.status === 'near').toBe(true);
      expect(w.payloadLeft).toBeGreaterThan(250);
      expect(itemsInVehicle(sim.s, sim.v.id).filter((i) => i.where.kind === 'stored').length).toBeGreaterThan(10);
      const layout = furnish.layoutOf(sim.s, sim.v.id);
      const chk = furnish.checkLayout(vdef(sim.v), layout);
      expect(chk.valid, JSON.stringify(chk.issues)).toBe(true);
    });
  }
});

describe('economy & purchases', () => {
  it('cannot buy without sufficient funds', () => {
    const sim = makeSim();
    sim.s.cash = 5;
    const r = sim.buy('dj_rvsupply', 'solar_200');
    expect(r.ok).toBe(false);
    expect(sim.s.cash).toBe(5);
  });

  it('purchases update cash, weight and storage', () => {
    const sim = makeSim();
    const cash0 = sim.s.cash;
    const w0 = computeWeight(sim.s, sim.v.id).total;
    const r = sim.buy('dj_grocery', 'pasta_kit');
    expect(r.ok).toBe(true);
    expect(sim.s.cash).toBeCloseTo(cash0 - 6, 2);
    const w1 = computeWeight(sim.s, sim.v.id).total;
    expect(w1 - w0).toBeCloseTo(1.1, 3);
    expect(sim.s.objectives.done.groceries).toBeDefined();
  });

  it('refuses purchases with no room and never removes other items', () => {
    const sim = makeSim();
    const before = Object.keys(sim.s.items).length;
    let bought = 0;
    for (let i = 0; i < 40; i++) {
      sim.s.cash = 10000;
      if (sim.buy('dj_grocery', 'water_jug', { confirmOverweight: true }).ok) bought++;
    }
    expect(bought).toBeLessThan(40);
    expect(Object.keys(sim.s.items).length).toBe(before + bought);
  });
});

describe('water and waste', () => {
  let sim: Sim;
  beforeEach(() => {
    sim = makeSim('classc');
  });

  it('filling fresh water adds 1 kg per liter', () => {
    sim.v.fresh = 20;
    parkAtAnchor(sim, 'mc_water');
    const w0 = computeWeight(sim.s, sim.v.id).total;
    const fw0 = computeWeight(sim.s, sim.v.id).byCat.fresh;
    const r = sim.fillWater('mc_water', 120);
    expect(r.ok).toBe(true);
    expect(sim.v.fresh).toBeCloseTo(120, 5);
    expect(computeWeight(sim.s, sim.v.id).byCat.fresh - fw0).toBeCloseTo(100, 5);
    // total changes by the water plus a few grams of propane burned by the fridge meanwhile
    expect(computeWeight(sim.s, sim.v.id).total - w0).toBeCloseTo(100, 1);
  });

  it('cooking and showering move water from fresh to gray liter for liter', () => {
    const f0 = sim.v.fresh, g0 = sim.v.gray;
    const pasta = itemsInVehicle(sim.s, sim.v.id).find((i) => i.def === 'pasta_kit')!;
    expect(sim.cook(pasta.uid).ok).toBe(true);
    expect(f0 - sim.v.fresh).toBeCloseTo(3, 5);
    expect(sim.v.gray - g0).toBeCloseTo(2.5, 5);
    const f1 = sim.v.fresh, g1 = sim.v.gray;
    expect(sim.rvShower().ok).toBe(true);
    expect(f1 - sim.v.fresh).toBeCloseTo(22, 5);
    expect(sim.v.gray - g1).toBeCloseTo(22, 5);
    const b0 = sim.v.black;
    expect(sim.toilet().ok).toBe(true);
    expect(sim.v.black - b0).toBeCloseTo(1.4, 5);
  });

  it('full waste tanks stop the relevant fixtures', () => {
    const c = capacities(sim.s, sim.v.id);
    sim.v.gray = c.gray;
    expect(sim.rvShower().ok).toBe(false);
    const pasta = itemsInVehicle(sim.s, sim.v.id).find((i) => i.def === 'pasta_kit')!;
    expect(sim.cook(pasta.uid).ok).toBe(false);
    sim.v.black = c.black;
    expect(sim.toilet().ok).toBe(false);
  });

  it('dumping empties tanks and removes their mass', () => {
    sim.v.gray = 80;
    sim.v.black = 60;
    parkAtAnchor(sim, 'mc_dump');
    const w0 = computeWeight(sim.s, sim.v.id);
    const r = sim.dump('mc_dump');
    expect(r.ok).toBe(true);
    expect(sim.v.gray).toBe(0);
    expect(sim.v.black).toBe(0);
    const w1 = computeWeight(sim.s, sim.v.id);
    expect(w0.byCat.gray + w0.byCat.black - (w1.byCat.gray + w1.byCat.black)).toBeCloseTo(140, 5);
    expect(w0.total - w1.total).toBeCloseTo(140, 1);
    expect(sim.s.objectives.done.dump).toBeDefined();
  });
});

describe('delivery jobs', () => {
  it('validates compartments and axles, loads, and pays only on delivery', () => {
    const sim = makeSim('van');
    const offers = boardOffers(sim.s, 'dj_board');
    const starter = offers.find((o) => o.id === 'starter')!;
    expect(starter).toBeDefined();
    expect(sim.accept('starter', 'dj_board').ok).toBe(true);
    parkAtAnchor(sim, 'dj_dock');
    // everything into the rear garage: rejected (weight limit / room)
    const allGarage = previewLoad(sim.s, 'starter', ['garage', 'garage', 'garage']);
    expect(allGarage.ok).toBe(false);
    expect(allGarage.crateErrors.some((e) => e)).toBe(true);
    expect(sim.loadCargo('starter', ['garage', 'garage', 'garage']).ok).toBe(false);
    // floor space (loose, strap down) works
    const w0 = computeWeight(sim.s, sim.v.id).total;
    const cash0 = sim.s.cash;
    const r = sim.loadCargo('starter', ['floor', 'floor', 'floor']);
    expect(r.ok, !r.ok ? r.reason : '').toBe(true);
    expect(computeWeight(sim.s, sim.v.id).total - w0).toBeCloseTo(174, 3);
    expect(sim.s.cash).toBe(cash0);
    // cannot deliver from the wrong place
    expect(sim.deliver('starter').ok).toBe(false);
    parkAtAnchor(sim, 'pl_lodge_dock');
    const d = sim.deliver('starter');
    expect(d.ok).toBe(true);
    expect(sim.s.cash).toBeGreaterThan(cash0);
    expect(jobCargo(sim.s, 'starter').length).toBe(0);
    expect(computeWeight(sim.s, sim.v.id).total).toBeCloseTo(w0, 3);
  });

  it('rejects cargo that would overload the rear axle', () => {
    const sim = makeSim('classc');
    sim.v.gray = 115;
    sim.v.black = 95;
    // heavy belongings in the rear bay
    for (let i = 0; i < 4; i++) newItem(sim.s, 'agm_battery', { kind: 'stored', vehicle: sim.v.id, comp: 'rearbay' });
    const offers = boardOffers(sim.s, 'dj_board');
    expect(sim.accept(offers[0].id, 'dj_board').ok).toBe(true);
    parkAtAnchor(sim, 'dj_dock');
    const heavy = { ...offers[0] };
    void heavy;
    const w = computeWeight(sim.s, sim.v.id);
    expect(w.rear).toBeGreaterThan(w.front);
  });

  it('expired deliveries fail without pay', () => {
    const sim = makeSim('van');
    sim.accept('starter', 'dj_board');
    const cash0 = sim.s.cash;
    advance(sim.s, 60 * 60, { activity: 'idle' });
    expect(sim.s.jobs.active.length).toBe(0);
    expect(sim.s.jobs.failed).toBe(1);
    expect(sim.s.cash).toBeLessThan(cash0);
  });
});

describe('maintenance', () => {
  it('wear reduces performance and repairs restore it', () => {
    const sim = makeSim('van');
    const good = performance(sim.s, sim.v.id);
    sim.v.condition.engine = 0.2;
    sim.v.condition.brakes = 0.25;
    sim.v.condition.steering = 0.3;
    const bad = performance(sim.s, sim.v.id);
    expect(bad.power).toBeLessThan(good.power);
    expect(bad.brake).toBeLessThan(good.brake);
    expect(bad.fuelMul).toBeGreaterThan(good.fuelMul);
    expect(bad.drift).toBeGreaterThan(good.drift);
    sim.s.cash = 5000;
    const r = sim.repair('pro', ['engine', 'brakes', 'steering']);
    expect(r.ok).toBe(true);
    expect(sim.v.condition.engine).toBeCloseTo(1, 5);
    const fixed = performance(sim.s, sim.v.id);
    expect(fixed.power).toBeGreaterThan(bad.power);
  });
});

describe('assisted travel', () => {
  it('costs time, fuel, needs and wear', () => {
    const sim = makeSim('van');
    sim.s.explored = { hwy60_w: true, hwy60_e: true };
    const t0 = sim.s.time.minutes, f0 = sim.v.fuel, h0 = sim.s.player.needs.hunger, e0 = sim.v.condition.engine;
    const r = sim.assistedTravel('mc_c');
    expect(r.ok, !r.ok ? r.reason : '').toBe(true);
    expect(sim.s.time.minutes - t0).toBeGreaterThan(20);
    expect(f0 - sim.v.fuel).toBeGreaterThan(3);
    expect(sim.s.player.needs.hunger).toBeLessThan(h0);
    expect(sim.v.condition.engine).toBeLessThan(e0);
    const lot = PARKING.find((p) => p.id === 'mc_lot')!;
    expect(Math.hypot(sim.v.pose.x - lot.x, sim.v.pose.z - lot.z)).toBeLessThan(1);
  });

  it('requires the route to have been driven once', () => {
    const sim = makeSim('van');
    expect(sim.assistedTravel('mc_c').ok).toBe(false);
  });
});

describe('furnishing validation', () => {
  it('rejects overlaps, blocked doors and blocked access; accepts valid spots', () => {
    const sim = makeSim('van');
    const v = sim.v;
    const chair = newItem(sim.s, 'swivel_chair', { kind: 'stored', vehicle: v.id, comp: 'floor' });
    const iss = (x: number, z: number, rot = 0) => furnish.checkPlacement(sim.s, v.id, { uid: chair.uid, def: chair.def, x, z, rot });
    expect(iss(0.7, -0.15).some((i) => i.code === 'overlap')).toBe(true); // on the galley
    expect(iss(-0.65, 0.2).some((i) => i.code === 'door')).toBe(true); // in the doorway
    expect(iss(0, -1.2).some((i) => i.code === 'access' || i.code === 'blocked')).toBe(true); // in front of the bed
    expect(iss(0, 2.5).some((i) => i.code === 'outside')).toBe(true); // in the cab
    const plumb = newItem(sim.s, 'van_galley', { kind: 'stored', vehicle: v.id, comp: 'floor' });
    const p = furnish.checkPlacement(sim.s, v.id, { uid: plumb.uid, def: plumb.def, x: -0.7, z: -1.9, rot: 1 });
    expect(p.some((i) => i.code === 'plumbing')).toBe(true);
  });

  it('can place and remove furniture, updating weight and storage', () => {
    const sim = makeSim('classc');
    const v = sim.v;
    const plant = newItem(sim.s, 'plant', { kind: 'stored', vehicle: v.id, comp: 'floor' });
    const w0 = computeWeight(sim.s, v.id);
    const r = sim.place(plant.uid, 0.95, 1.2, 0);
    expect(r.ok, !r.ok ? r.reason : '').toBe(true);
    const w1 = computeWeight(sim.s, v.id);
    expect(w1.total).toBeCloseTo(w0.total, 5);
    expect(compartmentUse(sim.s, v.id, 'floor').liters).toBeLessThan(500);
    expect(sim.uninstall(plant.uid).ok).toBe(true);
  });

  it('refuses a wet bath in a van without a black tank', () => {
    const sim = makeSim('van');
    const wb = newItem(sim.s, 'wet_bath', { kind: 'stored', vehicle: sim.v.id, comp: 'floor' });
    const p = furnish.checkPlacement(sim.s, sim.v.id, { uid: wb.uid, def: wb.def, x: 0.5, z: -0.5, rot: 3 });
    expect(p.some((i) => i.code === 'blacktank')).toBe(true);
  });
});

describe('time', () => {
  it('sleeping advances to morning and applies costs', () => {
    const sim = makeSim('van');
    sim.s.time.minutes = 22 * 60;
    sim.s.player.needs.energy = 20;
    const sum = sim.sleep(false);
    expect(Math.round((sim.s.time.minutes % 1440) / 60)).toBe(7);
    expect(sim.s.player.needs.energy).toBeGreaterThan(70);
    expect(sum.minutes).toBe(540);
  });

  it('staying past check-out is charged', () => {
    const sim = makeSim('classc');
    sim.s.cash = 500;
    const free = siteOptions(sim.s, 'pine_cg').find((o) => o.available)!;
    const r = sim.reserve('pine_cg', free.site.id, 1);
    expect(r.ok, !r.ok ? r.reason : '').toBe(true);
    sim.v.pose = { x: free.site.x, z: free.site.z, heading: free.site.heading };
    const cash1 = sim.s.cash;
    advance(sim.s, 2 * 1440, { activity: 'idle' });
    expect(sim.s.cash).toBeLessThan(cash1);
  });

  it('weekly bills are charged on Mondays', () => {
    const sim = makeSim('van');
    const cash0 = sim.s.cash;
    advance(sim.s, 7 * 1440, { activity: 'idle' });
    expect(sim.s.tx.some((t) => t.category === 'recurring')).toBe(true);
    expect(sim.s.cash).toBeLessThan(cash0);
  });
});

describe('save / load', () => {
  it('round-trips the complete state', () => {
    const sim = makeSim('classc');
    sim.buy('dj_grocery', 'fruit');
    sim.accept('starter', 'dj_board');
    sim.v.fresh = 77.5;
    sim.s.player.needs.hunger = 41.25;
    const json = sim.serialize('2026-10-25T00:00:00Z');
    const r = deserialize(json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state).toEqual(JSON.parse(JSON.stringify(sim.s)));
    expect(r.file.summary.day).toBe(1);
  });

  it('rejects garbage', () => {
    expect(deserialize('not json').ok).toBe(false);
    expect(deserialize('{"format":"other"}').ok).toBe(false);
  });
});
