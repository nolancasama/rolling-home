import { ITEMS, itemDef } from '../data/items';
import { COVERINGS, MATERIALS } from '../data/materials';
import type { Finish, ItemConfig, SlotKind, VehicleDef, VehicleId, WindowTreatment } from '../data/types';
import { VEHICLES } from '../data/vehicles';
import { fail, newItem, ok, type Result } from './core';
import { normalizeConfig } from './families';
import { checkLayout, layoutOf } from './furnish';
import { newGame } from './newgame';
import { edit, removeItem, type Draft } from './renovation';
import type { GameState, ItemInstance, LightSettings } from './types';
import { defOf, installedItems, itemsInVehicle, mattressOn, vdef, vehicleById } from './vehicle';
import { computeWeight } from './weight';

export interface BlueprintItem {
  def: string;
  config?: ItemConfig;
  finish?: Record<string, Finish>;
  state?: string;
  light?: LightSettings;
  place: { kind: 'floor'; x: number; z: number; rot: number; y?: number } | { kind: 'slot'; slot: SlotKind };
  mattress?: string;
}

export interface Blueprint {
  format: 'rolling-home-blueprint';
  version: 1;
  id: string;
  name: string;
  vehicle: VehicleId;
  interiorSig: string;
  createdAt: string;
  surfaces: Record<string, Finish>;
  windows: Record<string, WindowTreatment>;
  items: BlueprintItem[];
  stats: { kg: number; value: number; items: number; issues: number };
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Sorting record keys makes signatures independent of content object construction order. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** FNV-1a of the shell geometry a layout actually depends on; finishes are deliberately excluded. */
export function interiorSignature(def: VehicleDef): string {
  const i = def.interior;
  const source = stable({
    living: i.living, cab: i.cab, floorY: i.floorY, ceilingY: i.ceilingY,
    cabFloorY: i.cabFloorY, cabCeilingY: i.cabCeilingY, door: i.door,
    windows: i.windows.map(w => ({ id: w.id, side: w.side, a0: w.a0, a1: w.a1, y0: w.y0, y1: w.y1 })).sort((a, b) => a.id.localeCompare(b.id)),
    surfaces: i.surfaces.map(s => s.id).sort(),
  });
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(source)) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

export function makeBlueprint(s: GameState, vid: string, metadata: Pick<Blueprint, 'id' | 'name' | 'createdAt'>): Blueprint {
  const vehicle = vehicleById(s, vid), def = vdef(vehicle);
  const installed = installedItems(s, vid);
  const items: BlueprintItem[] = installed.map(inst => {
    const w = inst.where;
    const place: BlueprintItem['place'] = w.kind === 'floor'
      ? { kind: 'floor', x: w.x, z: w.z, rot: w.rot, ...(w.y === undefined ? {} : { y: w.y }) }
      : { kind: 'slot', slot: (w as Extract<ItemInstance['where'], { kind: 'slot' }>).slot };
    const mattress = mattressOn(s, inst.uid);
    return {
      def: inst.def, place, ...(inst.config ? { config: inst.config } : {}),
      ...(inst.finish ? { finish: inst.finish } : {}), ...(inst.state ? { state: inst.state } : {}),
      ...(inst.light ? { light: inst.light } : {}), ...(mattress ? { mattress: mattress.def } : {}),
    };
  });
  const check = checkLayout(def, layoutOf(s, vid), s, vid);
  return clone({
    format: 'rolling-home-blueprint', version: 1, ...metadata, vehicle: def.id,
    interiorSig: interiorSignature(def), surfaces: vehicle.custom.surfaces, windows: vehicle.custom.windows, items,
    stats: {
      kg: computeWeight(s, vid).total,
      value: installed.reduce((sum, inst) => sum + defOf(inst).price + (mattressOn(s, inst.uid) ? defOf(mattressOn(s, inst.uid)!).price : 0), 0),
      items: items.length,
      issues: Object.values(check.issues).reduce((n, list) => n + list.length, 0) + check.general.length + Number(check.cabBlocked),
    },
  });
}

/** Factory metadata is fixed: restoring a layout never needs a wall clock or random identifier. */
export function factoryBlueprint(defId: VehicleId): Blueprint {
  const s = newGame({
    name: '', vehicle: defId, difficulty: 'balanced', seed: 0,
    look: { skin: '', hair: '', hairStyle: 0, shirt: '', pants: '' },
  });
  return makeBlueprint(s, s.vehicleId, { id: `factory:${defId}`, name: `Factory ${VEHICLES[defId].name}`, createdAt: '' });
}

type Obj = Record<string, unknown>;
function requireField(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function object(value: unknown, path: string): Obj {
  requireField(value !== null && typeof value === 'object' && !Array.isArray(value), `${path} must be an object.`);
  return value as Obj;
}
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const between = (v: unknown, lo: number, hi: number): boolean => finite(v) && v >= lo && v <= hi;
const color = (v: unknown): boolean => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
function finish(value: unknown, path: string, surfaces: readonly string[]): void {
  const f = object(value, path);
  requireField(typeof f.mat === 'string' && Object.hasOwn(MATERIALS, f.mat), `${path}: unknown material.`);
  requireField(MATERIALS[f.mat].surfaces.some(s => surfaces.includes(s)), `${path}: material ${f.mat} is incompatible.`);
  for (const key of ['color', 'color2']) if (f[key] !== undefined) requireField(color(f[key]), `${path}.${key} must be a hex color.`);
  for (const key of ['scale', 'plankW', 'plankL']) if (f[key] !== undefined) requireField(finite(f[key]) && f[key] > 0, `${path}.${key} must be positive.`);
  if (f.rot !== undefined) requireField(f.rot === 0 || f.rot === 90, `${path}.rot must be 0 or 90.`);
  if (f.roughness !== undefined) requireField(between(f.roughness, 0, 1), `${path}.roughness must be between 0 and 1.`);
  if (f.offset !== undefined) requireField(Array.isArray(f.offset) && f.offset.length === 2 && f.offset.every(finite), `${path}.offset must contain two finite numbers.`);
}

function config(value: unknown, defId: string, path: string): void {
  const c = object(value, path), def = itemDef(defId);
  const numbers = ['w', 'h', 'd', 'doors', 'drawers', 'shelves', 'length'];
  const choices: Record<string, readonly string[]> = {
    front: ['doors', 'drawers', 'mixed', 'open', 'glass'], style: ['slab', 'shaker', 'louver', 'beadboard'],
    handle: ['bar', 'knob', 'cup', 'edge', 'latch'], arms: ['track', 'round', 'none'],
    legs: ['tapered', 'block', 'metal', 'plinth'], size: ['s', 'm', 'l', 'runner'],
  };
  requireField(!!def.family || Object.keys(c).length === 0, `${path}: ${def.name} is not configurable.`);
  for (const [key, val] of Object.entries(c)) {
    if (numbers.includes(key)) {
      requireField(finite(val) && val >= 0 && (!['w', 'h', 'd', 'length'].includes(key) || val > 0), `${path}.${key} must be a valid dimension or count.`);
      if (['doors', 'drawers', 'shelves'].includes(key)) requireField(Number.isInteger(val), `${path}.${key} must be an integer.`);
    } else requireField(Object.hasOwn(choices, key) && choices[key].includes(val as string), `${path}.${key} is invalid.`);
  }
}

function treatment(value: unknown, path: string): void {
  const t = object(value, path);
  requireField(typeof t.type === 'string' && Object.hasOwn(COVERINGS, t.type), `${path}: unknown covering type.`);
  finish(t.fabric, `${path}.fabric`, ['window']);
  if (t.fabric2 !== undefined) finish(t.fabric2, `${path}.fabric2`, ['window']);
  if (t.valance !== undefined && t.valance !== null) finish(t.valance, `${path}.valance`, ['window']);
  requireField(['white', 'black', 'brass', 'chrome', 'wood'].includes(t.hardware as string), `${path}.hardware is invalid.`);
  requireField(t.mount === 'inside' || t.mount === 'outside', `${path}.mount must be inside or outside.`);
  requireField(between(t.open, 0, 1), `${path}.open must be between 0 and 1.`);
  if (t.layer !== undefined) requireField(t.layer === 'day' || t.layer === 'night', `${path}.layer is invalid.`);
  if (t.length !== undefined) requireField(t.length === 'sill' || t.length === 'long', `${path}.length is invalid.`);
}

/** Imports are checked before exposing a blueprint, including all nested numeric and catalog fields. */
export function parseBlueprint(json: string): Result<{ blueprint: Blueprint }> {
  try {
    let raw: unknown;
    try { raw = JSON.parse(json) as unknown; } catch { return fail('Blueprint is not valid JSON.'); }
    const bp = object(raw, 'Blueprint');
    requireField(bp.format === 'rolling-home-blueprint', 'Not a Rolling Home blueprint.');
    requireField(bp.version === 1, `Unsupported blueprint version: ${String(bp.version)}.`);
    for (const key of ['id', 'name', 'interiorSig', 'createdAt']) requireField(typeof bp[key] === 'string' && (key === 'createdAt' || (bp[key] as string).trim().length > 0), `Blueprint.${key} must be a string.`);
    requireField(typeof bp.vehicle === 'string' && Object.hasOwn(VEHICLES, bp.vehicle), 'Blueprint has an unknown vehicle.');
    requireField(/^[0-9a-f]{8}$/i.test(bp.interiorSig as string), 'Blueprint.interiorSig must be an eight-digit hex signature.');
    const def = VEHICLES[bp.vehicle as VehicleId];
    const surfaces = object(bp.surfaces, 'Blueprint.surfaces');
    requireField(Object.keys(surfaces).length === def.interior.surfaces.length, 'Blueprint must specify every vehicle surface.');
    for (const surface of def.interior.surfaces) finish(surfaces[surface.id], `Surface ${surface.id}`, [surface.kind]);
    const windows = object(bp.windows, 'Blueprint.windows');
    const expectedWindows = def.interior.windows.filter(w => !w.door && w.factory);
    requireField(Object.keys(windows).length === expectedWindows.length, 'Blueprint must specify every vehicle window covering.');
    for (const win of expectedWindows) treatment(windows[win.id], `Window ${win.id}`);
    requireField(Array.isArray(bp.items), 'Blueprint.items must be an array.');
    for (const [index, entry] of bp.items.entries()) {
      const path = `Item ${index + 1}`, item = object(entry, path);
      requireField(typeof item.def === 'string' && Object.hasOwn(ITEMS, item.def), `${path}: unknown item definition.`);
      const id = item.def, itemDefn = itemDef(id), place = object(item.place, `${path}.place`);
      if (place.kind === 'floor') {
        requireField(!!itemDefn.floor, `${path}: ${itemDefn.name} cannot be placed on the floor.`);
        requireField(finite(place.x) && finite(place.z), `${path}: placement coordinates must be finite numbers.`);
        requireField(between(place.rot, 0, 3) && Number.isInteger(place.rot), `${path}: rotation must be a quarter turn (0–3).`);
        if (place.y !== undefined) requireField(finite(place.y), `${path}: elevation must be finite.`);
      } else {
        requireField(place.kind === 'slot' && !!itemDefn.slot && place.slot === itemDefn.slot.kind, `${path}: incompatible system slot.`);
      }
      if (item.config !== undefined) config(item.config, id, `${path}.config`);
      if (item.finish !== undefined) for (const [slotId, value] of Object.entries(object(item.finish, `${path}.finish`))) {
        const slot = itemDefn.slots?.find(s => s.id === slotId);
        // S1 factory cabinets share a finish group, including an unused countertop on uppers/wardrobes.
        const factoryFinish = def.defaults.find(d => d.item === id && 'finish' in d && d.finish?.[slotId]);
        const inactive = factoryFinish && 'finish' in factoryFinish ? factoryFinish.finish?.[slotId] : undefined;
        requireField(slot || inactive, `${path}: unknown finish slot ${slotId}.`);
        finish(value, `${path}.${slotId}`, slot?.surfaces ?? MATERIALS[inactive!.mat].surfaces);
      }
      if (item.state !== undefined) requireField(typeof item.state === 'string' && itemDefn.floor?.states?.some(s => s.id === item.state), `${path}: unknown furniture state.`);
      if (item.light !== undefined) {
        const l = object(item.light, `${path}.light`);
        requireField(itemDefn.light && ['auto', 'on', 'off'].includes(l.mode as string) && between(l.dim, 0, 1) && between(l.kelvin, itemDefn.light.kelvin[0], itemDefn.light.kelvin[1]), `${path}: invalid light settings.`);
        if (l.color !== undefined) requireField(itemDefn.light.rgb && color(l.color), `${path}: invalid light color.`);
      }
      if (item.mattress !== undefined) {
        requireField(typeof item.mattress === 'string' && Object.hasOwn(ITEMS, item.mattress), `${path}: unknown mattress.`);
        requireField(itemDefn.features?.bed?.usesMattress && itemDef(item.mattress).features?.mattress?.size === itemDefn.features.bed.mattressSize, `${path}: mattress does not fit this bed.`);
      }
    }
    const stats = object(bp.stats, 'Blueprint.stats');
    for (const key of ['kg', 'value', 'items', 'issues']) requireField(finite(stats[key]) && stats[key] >= 0, `Blueprint.stats.${key} must be a nonnegative number.`);
    requireField(Number.isInteger(stats.items) && stats.items === bp.items.length && Number.isInteger(stats.issues), 'Blueprint statistics have invalid item or issue counts.');
    return ok({ blueprint: raw as Blueprint });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Invalid blueprint.');
  }
}

export function checkBlueprint(bp: Blueprint, def: VehicleDef): Result {
  if (bp.vehicle === def.id && bp.interiorSig === interiorSignature(def)) return ok();
  const source = VEHICLES[bp.vehicle]?.name ?? String(bp.vehicle);
  return fail(`Blueprint for ${source} cannot be applied to ${def.name}: ${bp.vehicle !== def.id ? 'different vehicles' : 'the interior geometry has changed'}.`);
}

/** Apply a complete layout in one undoable transaction; the draft review reports resulting layout issues. */
export function applyBlueprint(d: Draft, bp: Blueprint): Result<{ reused: number; added: number; removed: number }> {
  let json: string;
  try { json = JSON.stringify(bp); } catch { return fail('Blueprint must be JSON-serializable.'); }
  const parsed = parseBlueprint(json);
  if (!parsed.ok) return parsed;
  const def = vdef(vehicleById(d.s, d.vid));
  const compatible = checkBlueprint(bp, def);
  if (!compatible.ok) return compatible;
  return edit(d, () => {
    const clearance = def.interior.ceilingY - def.interior.floorY;
    const candidates = itemsInVehicle(d.s, d.vid).sort((a, b) => Number(!d.base.items[a.uid]) - Number(!d.base.items[b.uid]));
    const original = installedItems(d.s, d.vid);
    const used = new Set<string>();
    let reused = 0, added = 0, removed = 0;
    const acquire = (id: string, config: ItemConfig | undefined, mattress = false): ItemInstance => {
      const normalized = normalizeConfig(itemDef(id), config, clearance);
      const inst = candidates.find(it => !used.has(it.uid) && it.def === id &&
        (mattress || it.where.kind !== 'mattress') && stable(normalizeConfig(itemDef(it.def), it.config, clearance)) === stable(normalized));
      if (inst) { reused++; used.add(inst.uid); return inst; }
      const fresh = newItem(d.s, id, { kind: 'carried' }, { ...(itemDef(id).family ? { config: normalized } : {}) });
      added++; used.add(fresh.uid); return fresh;
    };
    // Place all target storage first so contents of removed furniture can use the final compartments.
    for (const item of bp.items) {
      const inst = acquire(item.def, item.config);
      inst.where = { ...clone(item.place), vehicle: d.vid };
      inst.config = itemDef(item.def).family ? normalizeConfig(itemDef(item.def), item.config, clearance) : undefined;
      inst.finish = item.finish ? clone(item.finish) : undefined;
      inst.state = item.state;
      inst.light = item.light ? clone(item.light) : undefined;
      inst.secured = undefined;
      if (item.mattress) {
        // Prefer keeping the same mattress on the same bed when several beds share its definition.
        const current = mattressOn(d.s, inst.uid);
        let mattress: ItemInstance;
        if (current?.def === item.mattress && !used.has(current.uid)) { mattress = current; used.add(current.uid); reused++; }
        else mattress = acquire(item.mattress, undefined, true);
        mattress.where = { kind: 'mattress', vehicle: d.vid, bed: inst.uid };
      }
    }
    for (const inst of original) if (!used.has(inst.uid)) {
      const result = removeItem(d, inst.uid);
      if (!result.ok) return result;
      removed++;
    }
    // A reused bed may have had a different mattress; it must not remain mounted or disappear silently.
    for (const inst of candidates) if (inst.where.kind === 'mattress' && !used.has(inst.uid)) {
      const result = removeItem(d, inst.uid);
      if (!result.ok) return result;
      removed++;
    }
    vehicleById(d.s, d.vid).custom = { surfaces: clone(bp.surfaces), windows: clone(bp.windows) };
    return ok({ reused, added, removed });
  });
}
