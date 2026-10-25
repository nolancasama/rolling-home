import { describe, expect, it } from 'vitest';
import { VEHICLES } from '../src/data/vehicles';
import { newItem } from '../src/sim/core';
import { checkLayout, freeWallSpan, layoutOf, staticIssues } from '../src/sim/furnish';
import { newGame } from '../src/sim/newgame';

const look = { skin: '#e0b090', hair: '#3a2a1a', hairStyle: 0, shirt: '#3a7a9a', pants: '#2a2a3a' };
const game = () => newGame({ name: 'Wall test', look, vehicle: 'classc', difficulty: 'balanced', seed: 1234 });
const living = VEHICLES.classc.interior.living;

describe('wall measurements', () => {
  it('bounds an empty wall by its ends and leaves the state unchanged', () => {
    const s = game(); s.items = {};
    const before = JSON.stringify(s);
    expect(freeWallSpan(s, s.vehicleId, 'left', -1, 0.1, 0.5)).toEqual({
      a0: living.z0, a1: living.z1, length: living.z1 - living.z0,
    });
    expect(JSON.stringify(s)).toBe(before);
  });

  it('finds the closest furniture on either side and ignores its orientation and furniture away from the wall', () => {
    const s = game(); s.items = {};
    for (const z of [-2, -0.5]) {
      const it = newItem(s, 'cab_base', { kind: 'floor', vehicle: s.vehicleId, x: living.x1 - 0.2, z, rot: 1 });
      it.config = { w: 0.6, d: 0.4, h: 0.9 };
    }
    newItem(s, 'plant', { kind: 'floor', vehicle: s.vehicleId, x: 0, z: -1.2, rot: 0 });
    const span = freeWallSpan(s, s.vehicleId, 'left', -1.2, 0.1, 0.5);
    expect(span.a0).toBeCloseTo(-1.7);
    expect(span.a1).toBeCloseTo(-0.8);
    expect(span.length).toBeCloseTo(0.9);
    expect(span.before).toBeDefined();
    expect(span.after).toBe(span.before);
    const above = freeWallSpan(s, s.vehicleId, 'left', -1.2, 1.5, 1.8);
    expect(above.a0).toBe(living.z0);
    expect(above.a1).toBe(living.z1);
  });

  it('subtracts windows only when the requested vertical band intersects their opening', () => {
    const s = game(); s.items = {};
    expect(freeWallSpan(s, s.vehicleId, 'left', -1.5, 1, 1.3)).toEqual({
      a0: -2.45, a1: -0.85, length: 1.6, before: 'Window L1', after: 'Window L2',
    });
    expect(freeWallSpan(s, s.vehicleId, 'left', -1.5, 0.4, 0.7).length).toBeCloseTo(living.z1 - living.z0);
    const covered = freeWallSpan(s, s.vehicleId, 'left', 0, 1, 1.3);
    expect(covered).toEqual({ a0: 0, a1: 0, length: 0, before: 'Window L2', after: 'Window L2' });
  });

  it('bounds the right wall by the actual door opening and permits a band above the door', () => {
    const s = game(); s.items = {};
    const span = freeWallSpan(s, s.vehicleId, 'right', 0, 0.1, 0.5);
    expect(span.a1).toBe(VEHICLES.classc.interior.door.z0);
    expect(span.after).toBe('entry door');
    expect(freeWallSpan(s, s.vehicleId, 'right', 0.9, 0.1, 0.5).length).toBe(0);
    expect(freeWallSpan(s, s.vehicleId, 'right', 0, 1.86, 1.9).length).toBeCloseTo(living.z1 - living.z0);
  });

  it('uses x coordinates on the rear wall and includes touching boundaries in the free interval', () => {
    const s = game(); s.items = {};
    for (const x of [-0.7, 0.7]) {
      const it = newItem(s, 'cab_base', { kind: 'floor', vehicle: s.vehicleId, x, z: living.z0 + 0.2, rot: 0 });
      it.config = { w: 0.6, d: 0.4, h: 0.9 };
    }
    const span = freeWallSpan(s, s.vehicleId, 'rear', 0, 0.1, 0.5);
    expect(span.a0).toBeCloseTo(-0.4);
    expect(span.a1).toBeCloseTo(0.4);
    expect(span.length).toBeCloseTo(0.8);
    expect(freeWallSpan(s, s.vehicleId, 'rear', span.a0, 0.1, 0.5)).toEqual(span);
  });
});

describe('vehicle-specific layout checks', () => {
  it('checks AC equipment on the selected instance when two vehicles share a definition', () => {
    const s = game();
    const second = structuredClone(s.vehicles[0]); second.id = 'second-classc';
    s.vehicles.push(second);
    newItem(s, 'inverter_1000', { kind: 'slot', vehicle: s.vehicleId, slot: 'electronics' });
    const fridge = newItem(s, 'fridge_residential', { kind: 'floor', vehicle: second.id, x: 0, z: -1, rot: 0 });
    const layout = layoutOf(s, second.id), item = layout.find((entry) => entry.uid === fridge.uid)!;
    expect(staticIssues(VEHICLES.classc, layout, item, s, second.id).some((issue) => issue.code === 'power')).toBe(true);
    expect(checkLayout(VEHICLES.classc, layout, s, second.id).issues[fridge.uid].some((issue) => issue.code === 'power')).toBe(true);
    // Existing callers without the id infer it from the installed layout, never the shared definition.
    expect(staticIssues(VEHICLES.classc, layout, item, s).some((issue) => issue.code === 'power')).toBe(true);
    newItem(s, 'inverter_1000', { kind: 'slot', vehicle: second.id, slot: 'electronics' });
    expect(staticIssues(VEHICLES.classc, layout, item, s, second.id).some((issue) => issue.code === 'power')).toBe(false);
  });

  it('reports mixed batteries at vehicle level, including without furniture', () => {
    const s = game();
    const second = structuredClone(s.vehicles[0]); second.id = 'second-classc';
    s.vehicles.push(second);
    newItem(s, 'lithium_battery', { kind: 'slot', vehicle: s.vehicleId, slot: 'battery' });
    expect(checkLayout(VEHICLES.classc, [], s, second.id).general).toEqual([]);
    const first = checkLayout(VEHICLES.classc, layoutOf(s, s.vehicleId), s, s.vehicleId);
    expect(first.general).toEqual([{ code: 'mixedbattery', severity: 'warn', text: 'Mixing AGM and lithium shortens battery life.' }]);
    expect(Object.values(first.issues).flat().some((issue) => issue.code === 'mixedbattery')).toBe(false);
    expect(checkLayout(VEHICLES.classc, [], s, s.vehicleId).general).toEqual(first.general);
  });
});
