import { describe, expect, it } from 'vitest';
import { itemDef } from '../src/data/items';
import { VEHICLES } from '../src/data/vehicles';
import { applyBlueprint, checkBlueprint, factoryBlueprint, interiorSignature, makeBlueprint, parseBlueprint } from '../src/sim/blueprints';
import { newItem } from '../src/sim/core';
import { normalizeConfig } from '../src/sim/families';
import { newGame, setupNewVehicle } from '../src/sim/newgame';
import { begin, commit, redo, remove, setFinish, setRemoval, setWindow, summary, undo } from '../src/sim/renovation';
import { installedItems } from '../src/sim/vehicle';
import type { GameState } from '../src/sim/types';

const look = { skin: '#e0b090', hair: '#3a2a1a', hairStyle: 0, shirt: '#3a7a9a', pants: '#2a2a3a' };
const game = (vehicle: 'van' | 'classc' = 'classc') => newGame({ name: 'Builder', look, vehicle, difficulty: 'balanced', seed: 917 });
const metadata = { id: 'layout-1', name: 'My renovation', createdAt: '2026-10-25T10:00:00Z' };
const review = { pro: false, atShop: true, atService: true };
function layout(s: GameState, vid = s.vehicleId) {
  return makeBlueprint(s, vid, metadata).items.map(item => ({
    ...item,
    ...(itemDef(item.def).family ? { config: normalizeConfig(itemDef(item.def), item.config, 2.1) } : {}),
  }));
}

describe('blueprint format and compatibility', () => {
  it('uses stable FNV-1a shell signatures, ignores finishes, and detects geometry changes', () => {
    const def = structuredClone(VEHICLES.classc), original = interiorSignature(def);
    expect(original).toMatch(/^[0-9a-f]{8}$/);
    def.interior.surfaces.reverse();
    def.interior.windows.reverse();
    def.interior.surfaces[0].factory = { mat: 'paint_satin' };
    expect(interiorSignature(def)).toBe(original);
    def.interior.door.z0 += 0.01;
    expect(interiorSignature(def)).not.toBe(original);
    expect(interiorSignature(VEHICLES.van)).not.toBe(original);
  });

  for (const vehicle of ['van', 'classc'] as const) it(`round-trips the complete ${vehicle} factory blueprint`, () => {
    const bp = factoryBlueprint(vehicle), parsed = parseBlueprint(JSON.stringify(bp));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.blueprint).toEqual(bp);
    expect(bp.items.some(item => item.def === 'cab_upper')).toBe(true);
    expect(bp.items.filter(item => item.def === 'light_dome')).toHaveLength(vehicle === 'classc' ? 3 : 2);
    expect(checkBlueprint(bp, VEHICLES[vehicle]).ok).toBe(true);
  });

  it('returns clear failures for garbage, unsupported versions, and malformed nested fields', () => {
    for (const json of ['nonsense', 'null', '[]', '{}']) expect(parseBlueprint(json).ok).toBe(false);
    const changes: [string, (bp: ReturnType<typeof factoryBlueprint>) => void][] = [
      ['version', bp => Object.assign(bp, { version: 3 })],
      ['coordinates', bp => Object.assign(bp.items.find(item => item.place.kind === 'floor')!.place, { x: 'bad' })],
      ['rotation', bp => Object.assign(bp.items.find(item => item.place.kind === 'floor')!.place, { rot: 0.5 })],
      ['material', bp => bp.surfaces['floor.living'].mat = 'missing_material'],
      ['surface', bp => { delete bp.surfaces['floor.living']; }],
      ['covering', bp => Object.assign(bp.windows.L1, { open: 4 })],
      ['config', bp => Object.assign(bp.items.find(item => item.def === 'cab_upper')!, { config: { w: 'huge' } })],
      ['finish slot', bp => Object.assign(bp.items.find(item => item.def === 'cab_upper')!, { finish: { missing: { mat: 'cab_walnut' } } })],
      ['mattress', bp => bp.items.find(item => item.mattress)!.mattress = 'foam_van'],
      ['item', bp => bp.items[0].def = 'missing_item'],
      ['statistics', bp => bp.stats.items++],
    ];
    for (const [label, change] of changes) {
      const bp = factoryBlueprint('classc'); change(bp);
      const result = parseBlueprint(JSON.stringify(bp));
      expect(result.ok, label).toBe(false);
      if (!result.ok) expect(result.reason.length, label).toBeGreaterThan(10);
    }
  });

  it('names both vehicles on incompatibility and rejects changed signatures atomically', () => {
    const s = game('van'), d = begin(s, s.vehicleId), before = JSON.stringify(d);
    const result = applyBlueprint(d, factoryBlueprint('classc'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain(VEHICLES.van.name);
      expect(result.reason).toContain(VEHICLES.classc.name);
    }
    expect(JSON.stringify(d)).toBe(before);
    const c = game(), draft = begin(c, c.vehicleId), bp = factoryBlueprint('classc');
    bp.interiorSig = '00000000';
    expect(applyBlueprint(draft, bp).ok).toBe(false);
    expect(draft.s).toEqual(c);
    expect(draft.undo).toHaveLength(0);
  });
});

describe('complete blueprint application', () => {
  it('make → JSON → parse → apply to a fresh Class C reproduces layout and finishes', () => {
    const s = game(), source = begin(s, s.vehicleId);
    expect(setFinish(source, { surface: 'floor.living' }, { mat: 'lvp_natural_oak', rot: 90, scale: 1.4 }).ok).toBe(true);
    const cabinet = installedItems(source.s, source.vid).find(item => item.def === 'cab_upper')!;
    expect(setFinish(source, { uid: cabinet.uid, slot: 'fronts' }, { mat: 'paint_satin', color: '#173a2b' }).ok).toBe(true);
    expect(setWindow(source, 'L1', { type: 'blackout_roller', fabric: { mat: 'win_blackout' }, mount: 'inside', hardware: 'black', open: 0 }).ok).toBe(true);
    const parsed = parseBlueprint(JSON.stringify(makeBlueprint(source.s, source.vid, metadata)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const target = game(), d = begin(target, target.vehicleId), original = structuredClone(target);
    const result = applyBlueprint(d, parsed.blueprint);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (result.ok) expect(result.added).toBe(0);
    expect(layout(d.s)).toEqual(layout(source.s));
    expect(d.s.vehicles[0].custom).toEqual(source.s.vehicles[0].custom);
    expect(summary(d, review).goods).toBeGreaterThan(0);
    expect(target).toEqual(original);
    expect(d.undo).toHaveLength(1);
    const applied = structuredClone(d.s);
    expect(undo(d).ok).toBe(true);
    expect(d.s).toEqual(original);
    expect(redo(d).ok).toBe(true);
    expect(d.s).toEqual(applied);
  });

  it('restores a sold factory dinette by buying it back', () => {
    const s = game(); s.cash = 100_000;
    const d = begin(s, s.vehicleId), dinette = installedItems(s, s.vehicleId).find(item => item.def === 'dinette')!;
    expect(remove(d, dinette.uid).ok).toBe(true);
    expect(setRemoval(d, dinette.uid, 'sell').ok).toBe(true);
    expect(commit(s, d, { pro: false }).ok).toBe(true);
    expect(s.items[dinette.uid]).toBeUndefined();
    const restore = begin(s, s.vehicleId), result = applyBlueprint(restore, factoryBlueprint('classc'));
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (result.ok) expect(result.added).toBe(1);
    expect(installedItems(restore.s, s.vehicleId).filter(item => item.def === 'dinette')).toHaveLength(1);
    expect(summary(restore, review).lines.some(line => line.kind === 'item' && line.label.includes('Dinette'))).toBe(true);
  });

  it('reuses owned stored instances with equal normalized configuration', () => {
    const source = game(), target = game();
    const sourceCabinet = newItem(source, 'cab_base', { kind: 'floor', vehicle: source.vehicleId, x: 0, z: 1.1, rot: 0 }, { config: { w: 0.61 } });
    const owned = newItem(target, 'cab_base', { kind: 'stored', vehicle: target.vehicleId, comp: 'floor' }, { config: { w: 0.6 } });
    const bp = makeBlueprint(source, source.vehicleId, metadata), d = begin(target, target.vehicleId);
    const result = applyBlueprint(d, bp);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (result.ok) expect(result.added).toBe(0);
    expect(d.s.items[owned.uid].where).toMatchObject(sourceCabinet.where);
    expect(Object.values(d.s.items).filter(item => item.def === 'cab_base')).toHaveLength(1);
  });

  it('reuses each owned instance once, including mattresses and identical batteries', () => {
    const s = game(), d = begin(s, s.vehicleId), before = new Set(Object.keys(s.items));
    const result = applyBlueprint(d, factoryBlueprint('classc'));
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (result.ok) {
      expect(result.added).toBe(0);
      expect(result.removed).toBe(0);
      expect(result.reused).toBe(installedItems(s, s.vehicleId).length + 1);
    }
    expect(new Set(Object.keys(d.s.items))).toEqual(before);
    expect(Object.values(d.s.items).filter(item => item.where.kind === 'mattress')).toHaveLength(1);
    expect(summary(d, review).goods).toBe(0);
  });

  it('does not borrow another vehicle’s owned items', () => {
    const s = game(), second = setupNewVehicle(s, 'classc', { x: 0, z: 0, heading: 0 });
    const firstItems = installedItems(s, s.vehicleId).map(item => structuredClone(item));
    const d = begin(s, second.id), result = applyBlueprint(d, factoryBlueprint('classc'));
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (result.ok) expect(result.added).toBe(0);
    expect(installedItems(d.s, s.vehicleId)).toEqual(firstItems);
  });

  it('allows complete invalid layouts in the draft but blocks committing them', () => {
    const s = game(), d = begin(s, s.vehicleId), bp = factoryBlueprint('classc');
    const bed = bp.items.find(item => item.def === 'double_bed')!;
    if (bed.place.kind === 'floor') bed.place.x = 20;
    expect(applyBlueprint(d, bp).ok).toBe(true);
    expect(summary(d, review).canCommit).toBe(false);
    expect(summary(d, review).issues.some(issue => issue.code === 'outside' && issue.severity === 'block')).toBe(true);
    const before = structuredClone(s);
    expect(commit(s, d, { pro: false }).ok).toBe(false);
    expect(s).toEqual(before);
  });

  it('rolls the whole blueprint back if removed storage contents cannot be relocated', () => {
    const s = game(), fridge = installedItems(s, s.vehicleId).find(item => item.def === 'threeway_fridge')!;
    newItem(s, 'cargo', { kind: 'stored', vehicle: s.vehicleId, comp: `item:${fridge.uid}` }, {
      cargo: { name: 'Cold crate', dims: [0.2, 0.2, 0.2], mass: 5, refrigerated: true, damage: 0, jobId: 'test' },
    });
    const d = begin(s, s.vehicleId), before = structuredClone(d), bp = factoryBlueprint('classc');
    bp.items = bp.items.filter(item => item.def !== 'threeway_fridge');
    bp.stats.items = bp.items.length;
    const result = applyBlueprint(d, bp);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('Cold crate');
    expect(d).toEqual(before);
  });
});
