import { describe, expect, it } from 'vitest';
import { VEHICLES } from '../src/data/vehicles';
import type { VehicleId } from '../src/data/types';
import { CollisionWorld } from '../src/game/collision';
import { VehiclePhysics } from '../src/game/vehiclePhysics';
import { performance as vehiclePerformance } from '../src/sim/maintenance';
import { newGame } from '../src/sim/newgame';
import { computeWeight } from '../src/sim/weight';
import { buildHeights } from '../src/world/terrain';

const LOOK = { skin: '#e0b090', hair: '#3a2a1a', hairStyle: 0, shirt: '#3a7a9a', pants: '#2a2a3a' };
const world = new CollisionWorld();

function rig(id: VehicleId, tweak?: (s: ReturnType<typeof newGame>) => void) {
  buildHeights();
  const s = newGame({ name: 't', look: LOOK, vehicle: id, difficulty: 'balanced', seed: 1 });
  tweak?.(s);
  const v = s.vehicles[0];
  const p = new VehiclePhysics(VEHICLES[id]);
  // Coyote Flats truck-stop lot: a large flat concrete pad; drive east along it.
  p.place(70, 972, Math.PI / 2);
  p.engineOn = true;
  p.perf = vehiclePerformance(s, v.id);
  p.mass = computeWeight(s, v.id).total;
  return { s, p };
}

const DT = 1 / 60;

function timeTo(p: VehiclePhysics, speed: number, maxT = 30): number {
  let t = 0;
  while (p.speed < speed && t < maxT) {
    p.step(DT, { throttle: 1, brake: 0, steer: 0, handbrake: false }, world, () => false);
    t += DT;
  }
  return t;
}

function brakeDistance(p: VehiclePhysics): number {
  const x0 = p.x;
  let t = 0;
  while (p.speed > 0.05 && t < 20) {
    p.step(DT, { throttle: 0, brake: 1, steer: 0, handbrake: false }, world, () => false);
    t += DT;
  }
  return Math.abs(p.x - x0);
}

describe('vehicle physics', () => {
  it('accelerates like an old van (0-50 km/h in a few seconds)', () => {
    const { p } = rig('van');
    const t = timeTo(p, 13.9);
    console.log(`van 0-50 km/h: ${t.toFixed(2)} s`);
    expect(t).toBeGreaterThan(3);
    expect(t).toBeLessThan(8);
  });

  it('a worn engine is clearly slower', () => {
    const good = rig('van', (s) => (s.vehicles[0].condition.engine = 1)).p;
    const worn = rig('van', (s) => (s.vehicles[0].condition.engine = 0.2)).p;
    const tg = timeTo(good, 13.9), tw = timeTo(worn, 13.9);
    console.log(`van 0-50 km/h healthy ${tg.toFixed(2)} s, worn ${tw.toFixed(2)} s`);
    expect(tw).toBeGreaterThan(tg * 1.2);
  });

  it('the Class C is heavier and slower off the line than the van', () => {
    const van = rig('van').p, cc = rig('classc').p;
    const tv = timeTo(van, 13.9), tc = timeTo(cc, 13.9);
    console.log(`0-50 km/h van ${tv.toFixed(2)} s, Class C ${tc.toFixed(2)} s`);
    expect(tc).toBeGreaterThan(tv);
  });

  it('overloading lengthens braking distance', () => {
    const normal = rig('van').p;
    const heavy = rig('van', (s) => {
      // 700 kg of loose junk in the floor space: ~3% over the GVWR
      for (let i = 0; i < 10; i++) s.items[`x${i}`] = { uid: `x${i}`, def: 'cargo', condition: 1, where: { kind: 'stored', vehicle: s.vehicles[0].id, comp: 'floor' }, cargo: { name: 'junk', dims: [0.5, 0.5, 0.5], mass: 70, jobId: 'x', damage: 0 }, secured: true };
    }).p;
    timeTo(normal, 13.9);
    timeTo(heavy, 13.9);
    const dn = brakeDistance(normal), dh = brakeDistance(heavy);
    console.log(`braking from 50 km/h: normal ${dn.toFixed(1)} m, overloaded ${dh.toFixed(1)} m`);
    expect(heavy.perf!.overloaded).toBe(true);
    expect(dh).toBeGreaterThan(dn * 1.08);
  });
});
