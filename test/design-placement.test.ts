import { describe, expect, it } from 'vitest';
import { SHOPS } from '../src/data/content';
import { itemDef } from '../src/data/items';
import { materialDef } from '../src/data/materials';
import { VEHICLES } from '../src/data/vehicles';
import type { ItemDef, VehicleId } from '../src/data/types';
import { newItem } from '../src/sim/core';
import { normalizeConfig, resolveDef } from '../src/sim/families';
import { checkLayout, checkPlacement, doorFitIssue, itemElevation, layoutOf, placeItem, setItemState, staticIssues, type LayoutItem } from '../src/sim/furnish';
import { newGame } from '../src/sim/newgame';
import { buy, shopLines } from '../src/sim/shop';
import { defOf } from '../src/sim/vehicle';

const LOOK = { skin: '#e0b090', hair: '#3a2a1a', hairStyle: 0, shirt: '#3a7a9a', pants: '#2a2a3a' };
const game = (vehicle: VehicleId = 'classc') => newGame({ name: 'Design test', look: LOOK, vehicle, difficulty: 'balanced', seed: 1234 });
const li = (def: string, extra: Partial<LayoutItem> = {}): LayoutItem => ({ uid: def, def, x: 0, z: -2, rot: 0, ...extra });
const codes = (layout: LayoutItem[], item = layout[0], vehicle = VEHICLES.classc) => staticIssues(vehicle, layout, item).map((issue) => issue.code);

describe('parametric definitions', () => {
  it('normalizes dimensions and choices while preserving catalog defaults', () => {
    expect(normalizeConfig(itemDef('cab_upper'), {}).d).toBe(0.33);
    expect(normalizeConfig(itemDef('cab_upper'), { d: 0.33 }).d).toBe(0.33);
    expect(normalizeConfig(itemDef('cab_base'), { w: 7, h: -1, d: 0.47, front: 'glass' })).toMatchObject({ w: 1.2, h: 0.55, d: 0.45, front: 'doors' });
    expect(normalizeConfig(itemDef('cab_tall'), { h: 9 }, 1.87).h).toBe(1.87);
    expect(normalizeConfig(itemDef('cab_wardrobe'), { h: 1.9 }, 1.87).h).toBe(1.87);
    expect(normalizeConfig(itemDef('cab_base'), { w: Number.NaN }).w).toBe(0.6);
  });

  it('derives cabinet carcass, hardware, counter, price and storage from dimensions', () => {
    const def = itemDef('cab_base');
    const actual = resolveDef(def, { config: { w: 0.6, h: 0.9, d: 0.4 } });
    const hc = 0.86;
    const area = 2 * hc * 0.4 + 2 * 0.6 * 0.4 + 0.6 * 0.4 * 0.95;
    const front = 0.6 * hc;
    const counter = materialDef('counter_butcher');
    expect(actual.mass).toBeCloseTo(area * 6 + 0.6 * hc * 3 + front * 6 + 2 * 0.15 + 2 * 0.12 + 0.6 * 0.42 * counter.kgPerM2);
    expect(actual.price).toBe(Math.round((60 + 140 * front + 90 * area + 16 + 0.6 * 0.42 * counter.pricePerM2) / 5) * 5);
    expect(actual.storage?.liters).toBeCloseTo(72.63576);
    expect(actual.storage?.maxKg).toBeCloseTo(10 + 0.22 * actual.storage!.liters);
    expect(actual.floor?.access).toEqual([0.6, 0.5]);
    expect(actual.dims).toEqual([0.9, 0.4, 0.12]);
  });

  it('keeps legacy cabinet capacities close and wall shelves secure', () => {
    const legacy: [string, { w: number; h: number; d: number }, number][] = [
      ['cab_base', { w: 0.6, h: 0.9, d: 0.4 }, 80],
      ['cab_tall', { w: 0.6, h: 1.8, d: 0.45 }, 180],
      ['cab_wardrobe', { w: 0.6, h: 1.9, d: 0.6 }, 250],
    ];
    for (const [id, config, liters] of legacy) expect(Math.abs(resolveDef(itemDef(id), { config }).storage!.liters - liters)).toBeLessThan(10);
    const shelf = resolveDef(itemDef('cab_open_shelf'), {});
    expect(shelf.storage?.secure).toBe(true);
    expect(shelf.storage!.maxKg).toBeLessThanOrEqual(25);
  });

  it('resolves sofa, rug, strip and state footprints and memoizes equivalent definitions', () => {
    const sofa = resolveDef(itemDef('sofa_lounge'), { config: { w: 1.8, arms: 'round', legs: 'metal' } });
    expect(sofa.mass).toBeCloseTo(18 + 16 * 1.8 + 4);
    expect(sofa.price).toBe(380 + 320 * 1.8 + 60 + 40);
    expect(sofa.features?.seat?.comfort).toBe(4);
    const bed = resolveDef(itemDef('sofa_jackknife'), { config: { w: 1.9 }, state: 'bed' });
    expect(bed.floor?.footprint).toEqual([1.9, 1.2]);
    expect(bed.floor?.height).toBe(0.45);
    const rug = resolveDef(itemDef('rug'), { config: { size: 'runner' } });
    expect(rug.floor?.footprint).toEqual([0.7, 2.2]);
    expect(rug.mass).toBeCloseTo(1.5 * 0.7 * 2.2);
    expect(rug.price).toBeCloseTo(30 + 25 * 0.7 * 2.2);
    expect(rug.features?.comfort).toBe(2);
    const strip = resolveDef(itemDef('light_undercab'), { config: { length: 1.2 } });
    expect(strip.light?.watts).toBeCloseTo(4.8);
    expect(strip.light?.lumens).toBeCloseTo(384);
    expect(strip.mass).toBeCloseTo(0.144);
    expect(strip.price).toBe(39);
    expect(resolveDef(itemDef('light_undercab'), { config: { length: 1.2 } })).toBe(strip);
  });

  it('applies countertop finish deltas to fixed appliances and cabinets', () => {
    const def = itemDef('fridge_drawer');
    const stone = materialDef('counter_quartz');
    const initial = materialDef('counter_butcher');
    expect(resolveDef(def, { finish: { counter: { mat: stone.id } } }).mass - def.mass).toBeCloseTo(0.6 * 0.6 * (stone.kgPerM2 - initial.kgPerM2));
    const cabinet = resolveDef(itemDef('cab_base'), {});
    const changed = resolveDef(itemDef('cab_base'), { finish: { counter: { mat: stone.id } } });
    expect(changed.mass - cabinet.mass).toBeCloseTo(0.6 * 0.57 * (stone.kgPerM2 - initial.kgPerM2));
  });
});

describe('2.5D placement', () => {
  for (const id of ['van', 'classc'] as const) it(`${id} factory layout has zero blocking issues`, () => {
    const s = game(id);
    const result = checkLayout(VEHICLES[id], layoutOf(s, s.vehicleId), s);
    expect(Object.values(result.issues).flat().filter((issue) => issue.severity === 'block')).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('separates upper cabinets from counters and allows reaching over low furniture', () => {
    const upper = li('cab_upper', { x: -0.975, z: -0.45, rot: 1, y: 1.45, config: { w: 1.6, h: 0.5, d: 0.33 } });
    const counter = li('propane_galley', { x: -0.83, z: -0.45, rot: 1 });
    expect(codes([upper, counter])).not.toContain('overlap');
    expect(codes([upper, counter])).not.toContain('access');
    const high = li('cab_tall', { x: -0.26, z: -0.45, rot: 1 });
    expect(codes([upper, high])).toContain('access');
  });

  it('rejects bodies colliding vertically while keeping rugs under furniture', () => {
    expect(codes([li('plant'), li('swivel_chair')])).toContain('overlap');
    expect(codes([li('rug'), li('swivel_chair')])).not.toContain('overlap');
    const art = li('wall_art', { x: -1.125, rot: 1, y: 0.2 });
    const cabinet = li('cab_base', { x: -0.865, rot: 1 });
    expect(codes([art, cabinet])).toContain('overlap');
    expect(codes([{ ...art, y: 1.2 }, cabinet])).not.toContain('overlap');
  });

  it('validates living bounds, wall mount orientation, headroom, and door zone', () => {
    expect(codes([li('plant', { x: 4 })])).toContain('outside');
    expect(codes([li('cab_base')])).toContain('wall');
    expect(codes([li('wall_art', { x: -1.125, rot: 1 })])).not.toContain('wall');
    expect(codes([li('wall_art', { x: -1.125, rot: 3 })])).toContain('wall');
    expect(codes([li('murphy_bed')], undefined, VEHICLES.van)).toContain('headroom');
    const door = VEHICLES.classc.interior.door.zone;
    const atDoor = { x: (door.x0 + door.x1) / 2, z: (door.z0 + door.z1) / 2 };
    expect(codes([li('plant', atDoor)])).toContain('door');
    expect(codes([li('light_puck', atDoor)])).not.toContain('door');
    expect(codes([li('light_pendant', atDoor)])).toContain('door');
    expect(itemElevation(VEHICLES.classc, li('light_puck'))).toBeCloseTo(1.98);
  });

  it('refuses a cabinet over a window but accepts the factory dinette below its sill', () => {
    const upper = li('cab_upper', { x: 0.975, z: -0.05, rot: 3, y: 1.3, config: { w: 1.4 } });
    expect(codes([upper])).toContain('window');
    expect(codes([li('cab_tall', { x: 0.89, z: -0.05, rot: 3 })])).toContain('window');
    const s = game();
    const dinette = layoutOf(s, s.vehicleId).find((entry) => entry.def === 'dinette')!;
    expect(codes([dinette])).not.toContain('window');
  });

  it('enforces plumbing, black tanks and gas, with only utility rules relaxed in Creative', () => {
    const item = li('wet_bath_deluxe', { x: 0, z: -2 });
    const list = staticIssues(VEHICLES.van, [item], item);
    expect(list.map((issue) => issue.code)).toEqual(expect.arrayContaining(['plumbing', 'blacktank', 'headroom']));
    expect(codes([li('propane_galley')], undefined, VEHICLES.van)).toContain('gas');
    const s = game('van'); s.gameType = 'creative'; s.creativeRelaxed = true;
    const relaxed = staticIssues(VEHICLES.van, [item], item, s);
    expect(relaxed.find((issue) => issue.code === 'plumbing')?.severity).toBe('warn');
    expect(relaxed.find((issue) => issue.code === 'blacktank')?.severity).toBe('warn');
    expect(relaxed.find((issue) => issue.code === 'headroom')?.severity).toBe('block');
    const propane = li('propane_galley');
    expect(staticIssues(VEHICLES.van, [propane], propane, s).find((issue) => issue.code === 'gas')?.severity).toBe('warn');
  });

  it('preserves access and aisle checks and ignores fixtures entirely above standing height', () => {
    const chair = li('swivel_chair', { x: 0, z: -1.8 });
    const plant = li('plant', { x: 0, z: -1.3 });
    expect(codes([chair, plant])).toContain('access');
    const s = game();
    const baseline = checkLayout(VEHICLES.classc, layoutOf(s, s.vehicleId));
    const fixture = li('light_puck', { x: 0, z: -0.9 });
    expect(checkLayout(VEHICLES.classc, [...layoutOf(s, s.vehicleId), fixture]).cabBlocked).toBe(baseline.cabBlocked);
    const obstacle = li('theater_seats', { rot: 0, z: 0 });
    const narrow = { ...VEHICLES.classc, interior: { ...VEHICLES.classc.interior, living: { x0: -0.8, x1: 0.8, z0: -3.64, z1: 1.45 } } };
    expect(checkLayout(narrow, [obstacle, chair]).issues[chair.uid].some((issue) => issue.code === 'blocked')).toBe(true);
  });

  it('warns about insufficient AC power and mixed batteries', () => {
    const s = game();
    const fridge = li('fridge_residential');
    expect(staticIssues(VEHICLES.classc, [fridge], fridge, s).find((issue) => issue.code === 'power')?.severity).toBe('warn');
    newItem(s, 'inverter_1000', { kind: 'slot', vehicle: s.vehicleId, slot: 'electronics' });
    expect(staticIssues(VEHICLES.classc, [fridge], fridge, s).some((issue) => issue.code === 'power')).toBe(false);
    newItem(s, 'lithium_battery', { kind: 'slot', vehicle: s.vehicleId, slot: 'battery' });
    expect(checkLayout(VEHICLES.classc, layoutOf(s, s.vehicleId), s).general.find((issue) => issue.code === 'mixedbattery')?.severity).toBe('warn');
  });
});

describe('door fit and item states', () => {
  it('checks packed orientations, allows flatpack, and names the entry door', () => {
    expect(doorFitIssue(VEHICLES.classc, itemDef('fridge_residential'))?.text).toMatch(/entry door.*0.68.*1.85/);
    expect(doorFitIssue(VEHICLES.classc, itemDef('fridge_12v_10cf'))).toBeNull();
    expect(doorFitIssue(VEHICLES.classc, itemDef('murphy_bed'))).toBeNull();
    expect(doorFitIssue(VEHICLES.classc, itemDef('fridge_residential'), true)?.severity).toBe('warn');
    const oversized: ItemDef = { ...itemDef('plant'), floor: undefined, dims: [2, 2, 2] };
    expect(doorFitIssue(VEHICLES.classc, oversized)?.severity).toBe('block');
  });

  it('blocks an oversized shop purchase before storage and uses resolved cabinet prices', () => {
    const s = game(); s.cash = 100000;
    const shop = Object.values(SHOPS).find((entry) => entry.stock.some((stock) => stock.item === 'fridge_residential'))!;
    const result = buy(s, shop.id, 'fridge_residential', { confirmOverweight: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/entry door/i);
    const cabinet = shopLines(s, shop.id).find((entry) => entry.def.id === 'cab_base')!;
    expect(cabinet.price).toBeGreaterThan(0);
    expect(cabinet.def.mass).toBeGreaterThan(0);
  });

  it('does not recheck a previously owned appliance against the door', () => {
    const s = game();
    s.items = {};
    const inst = newItem(s, 'fridge_residential', { kind: 'stored', vehicle: s.vehicleId, comp: 'floor' });
    expect(checkPlacement(s, s.vehicleId, li(inst.def, { uid: inst.uid })).some((issue) => issue.code === 'doorfit')).toBe(false);
    expect(checkPlacement(s, s.vehicleId, li(inst.def, { uid: 'catalog' })).some((issue) => issue.code === 'doorfit')).toBe(true);
  });

  it('warns about deployment and refuses a blocked state without mutating it', () => {
    const s = game(); s.items = {};
    const sofa = newItem(s, 'sofa_jackknife', { kind: 'floor', vehicle: s.vehicleId, x: 0, z: -2, rot: 0 });
    const plant = newItem(s, 'plant', { kind: 'floor', vehicle: s.vehicleId, x: 0, z: -1.35, rot: 0 });
    const warnings = checkLayout(VEHICLES.classc, layoutOf(s, s.vehicleId)).issues[sofa.uid];
    expect(warnings.find((issue) => issue.code === 'deploy')).toMatchObject({ severity: 'warn', text: 'Unfolded, it would hit the Potted plant.' });
    const blocked = setItemState(s, s.vehicleId, sofa.uid, 'bed');
    expect(blocked.ok).toBe(false);
    expect(sofa.state).toBeUndefined();
    delete s.items[plant.uid];
    expect(setItemState(s, s.vehicleId, sofa.uid, 'bed').ok).toBe(true);
    expect(defOf(sofa).floor?.footprint).toEqual([1.7, 1.2]);
    expect(setItemState(s, s.vehicleId, sofa.uid, 'missing').ok).toBe(false);
  });

  it('preserves wall mounting when a folding table opens and stows, plus config and elevation', () => {
    const s = game(); s.items = {};
    const table = newItem(s, 'folding_table', { kind: 'stored', vehicle: s.vehicleId, comp: 'floor' });
    const wall = VEHICLES.classc.interior.living.x0;
    const result = placeItem(s, s.vehicleId, table.uid, wall + 0.05, -2, 1);
    expect(result.ok).toBe(true);
    expect(table.where.kind).toBe('floor');
    expect(table.config).toBeUndefined();
    expect(setItemState(s, s.vehicleId, table.uid, 'open').ok).toBe(true);
    expect(table.where).toMatchObject({ kind: 'floor', z: -2 });
    if (table.where.kind === 'floor') expect(table.where.x).toBeCloseTo(wall + 0.3);
    expect(setItemState(s, s.vehicleId, table.uid, 'folded').ok).toBe(true);
    if (table.where.kind === 'floor') expect(table.where.x).toBeCloseTo(wall + 0.05);
    const art = newItem(s, 'wall_art', { kind: 'stored', vehicle: s.vehicleId, comp: 'floor' });
    expect(placeItem(s, s.vehicleId, art.uid, wall + 0.015, -1.5, 1, 1.35).ok).toBe(true);
    expect(art.where).toMatchObject({ kind: 'floor', y: 1.35 });
  });
});
