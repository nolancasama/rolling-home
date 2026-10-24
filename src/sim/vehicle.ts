import { CARGO_DEF, itemDef, longestDim, packedLiters } from '../data/items';
import { dFromZ, VEHICLES } from '../data/vehicles';
import type { CompartmentDef, ItemDef, SlotKind, VehicleDef } from '../data/types';
import type { GameState, ItemInstance, VehicleState } from './types';

// Vehicle-derived facts: what is installed, capacities, compartments.

export function vehicleById(s: GameState, id: string): VehicleState {
  const v = s.vehicles.find((x) => x.id === id);
  if (!v) throw new Error(`no vehicle ${id}`);
  return v;
}

export function activeVehicle(s: GameState): VehicleState {
  return vehicleById(s, s.vehicleId);
}

export function vdef(v: VehicleState): VehicleDef {
  return VEHICLES[v.def];
}

export function defOf(inst: ItemInstance): ItemDef {
  return inst.def === 'cargo' ? CARGO_DEF : itemDef(inst.def);
}

export function itemsInVehicle(s: GameState, vid: string): ItemInstance[] {
  const out: ItemInstance[] = [];
  for (const uid in s.items) {
    const it = s.items[uid];
    const w = it.where;
    if ((w.kind === 'stored' || w.kind === 'floor' || w.kind === 'slot' || w.kind === 'mattress') && w.vehicle === vid) out.push(it);
  }
  return out;
}

export function floorItems(s: GameState, vid: string): ItemInstance[] {
  return itemsInVehicle(s, vid).filter((i) => i.where.kind === 'floor');
}

export function slotItems(s: GameState, vid: string, slot?: SlotKind): ItemInstance[] {
  return itemsInVehicle(s, vid).filter((i) => i.where.kind === 'slot' && (!slot || i.where.slot === slot));
}

export function mattressOn(s: GameState, bedUid: string): ItemInstance | undefined {
  for (const uid in s.items) {
    const w = s.items[uid].where;
    if (w.kind === 'mattress' && w.bed === bedUid) return s.items[uid];
  }
  return undefined;
}

/** Installed (working) items: floor + slots. */
export function installedItems(s: GameState, vid: string): ItemInstance[] {
  return itemsInVehicle(s, vid).filter((i) => i.where.kind === 'floor' || i.where.kind === 'slot');
}

export function hasTool(s: GameState, vid: string, tool: string): boolean {
  return itemsInVehicle(s, vid).some((i) => i.where.kind === 'stored' && defOf(i).features?.tool === tool);
}

// ── mass/volume of instances ──

export function itemKg(inst: ItemInstance): number {
  if (inst.cargo) return inst.cargo.mass;
  const d = defOf(inst);
  if (d.food && inst.servings != null) return Math.max(0.05, d.mass * (inst.servings / d.food.servings));
  if (d.features?.waterJug && inst.uses != null) return 0.6 + inst.uses;
  if (d.features?.butane && inst.uses != null) return 0.1 + (0.26 * inst.uses) / d.features.butane.uses;
  return d.mass;
}

export function itemLiters(inst: ItemInstance): number {
  if (inst.cargo) {
    const [a, b, c] = inst.cargo.dims;
    return Math.round(a * b * c * 1000 * 10) / 10;
  }
  const d = defOf(inst);
  const full = packedLiters(d);
  if (d.food && inst.servings != null) return Math.max(0.2, full * (inst.servings / d.food.servings));
  return full;
}

export function itemLongest(inst: ItemInstance): number {
  if (inst.cargo) return longestDim(inst.cargo.dims);
  return longestDim(defOf(inst).dims);
}

export function itemName(inst: ItemInstance): string {
  return inst.cargo ? inst.cargo.name : defOf(inst).name;
}

// ── compartments ──

export interface CompartmentInfo {
  id: string;
  name: string;
  liters: number;
  maxKg: number;
  d: number;
  secure: boolean;
  refrigerated: boolean;
  exterior: boolean;
  maxDim: number;
  high: boolean;
  hostUid?: string;
  fixed?: CompartmentDef;
}

export function compartments(s: GameState, vid: string): CompartmentInfo[] {
  const v = vehicleById(s, vid);
  const def = vdef(v);
  const out: CompartmentInfo[] = def.compartments.map((c) => ({
    id: c.id, name: c.name, liters: c.liters, maxKg: c.maxKg, d: c.d, secure: c.secure, refrigerated: false,
    exterior: c.exterior, maxDim: c.maxDim, high: !!c.high, fixed: c,
  }));
  for (const it of floorItems(s, vid)) {
    const d = defOf(it);
    if (!d.storage || it.where.kind !== 'floor') continue;
    out.push({
      id: `item:${it.uid}`, name: d.storage.refrigerated ? `${d.name}` : `${d.name} storage`,
      liters: d.storage.liters, maxKg: d.storage.maxKg, d: dFromZ(def, it.where.z), secure: d.storage.secure,
      refrigerated: !!d.storage.refrigerated, exterior: false, maxDim: d.storage.maxDim ?? 0.6, high: false,
      hostUid: it.uid,
    });
  }
  return out;
}

export function compartmentById(s: GameState, vid: string, comp: string): CompartmentInfo | undefined {
  return compartments(s, vid).find((c) => c.id === comp);
}

export function itemsInCompartment(s: GameState, vid: string, comp: string): ItemInstance[] {
  const out: ItemInstance[] = [];
  for (const uid in s.items) {
    const w = s.items[uid].where;
    if (w.kind === 'stored' && w.vehicle === vid && w.comp === comp) out.push(s.items[uid]);
  }
  return out;
}

export function compartmentUse(s: GameState, vid: string, comp: string): { liters: number; kg: number; count: number } {
  let liters = 0, kg = 0, count = 0;
  for (const it of itemsInCompartment(s, vid, comp)) {
    liters += itemLiters(it);
    kg += itemKg(it);
    count++;
  }
  return { liters, kg, count };
}

// ── capacities ──

export interface Capacities {
  fuel: number;
  fresh: number;
  freshMain: number;
  gray: number;
  black: number;
  propane: number;
  batteryWh: number;
  solarW: number;
  inverterW: number;
  boosterBars: number;
  generatorW: number;
  generatorLph: number;
  stove: 'butane' | 'propane' | 'induction' | null;
  sink: boolean;
  toilet: 'cassette' | 'plumbed' | 'composting' | null;
  shower: { liters: number; heater: 'propane' | 'electric' } | null;
  outdoorShower: boolean;
  fridge: { liters: number; mode: '12v' | '3way'; watts: number; propaneKgPerDay: number; uid: string } | null;
  fanW: number;
  lightsW: number;
  awning: boolean;
  comfort: number;
  bestBed: { quality: number; uid: string | null; name: string };
  table: number;
  black_d: number;
}

export function capacities(s: GameState, vid: string): Capacities {
  const v = vehicleById(s, vid);
  const def = vdef(v);
  const c: Capacities = {
    fuel: def.tanks.fuel.liters,
    fresh: def.tanks.fresh.liters,
    freshMain: def.tanks.fresh.liters,
    gray: def.tanks.gray.liters,
    black: def.tanks.black?.liters ?? 0,
    propane: def.tanks.propane?.kg ?? 0,
    batteryWh: 0, solarW: 0, inverterW: 0, boosterBars: 0, generatorW: 0, generatorLph: 0,
    stove: null, sink: false, toilet: null, shower: null, outdoorShower: false, fridge: null,
    fanW: 0, lightsW: 0, awning: false, comfort: def.id === 'classc' ? 4 : 1,
    bestBed: { quality: 0, uid: null, name: 'none' }, table: 0,
    black_d: def.tanks.black?.d ?? 0,
  };
  if (def.interior.cabover) c.bestBed = { quality: def.interior.cabover.quality, uid: null, name: 'Cab-over bunk' };
  for (const it of installedItems(s, vid)) {
    const d = defOf(it);
    const f = d.features ?? {};
    const working = it.condition > 0.12;
    if (f.battery) c.batteryWh += f.battery.wh * (0.55 + 0.45 * it.condition);
    if (f.solar) c.solarW += f.solar.watts * (0.6 + 0.4 * it.condition);
    if (f.inverter) c.inverterW = Math.max(c.inverterW, f.inverter.watts);
    if (f.booster) c.boosterBars = Math.max(c.boosterBars, f.booster.bars);
    if (f.generator && working) { c.generatorW += f.generator.watts; c.generatorLph += f.generator.fuelLph; }
    if (f.tank) c.fresh += f.tank.liters;
    if (f.galley) {
      c.sink = c.sink || f.galley.sink;
      if (working && f.galley.stove) c.stove = c.stove ?? f.galley.stove;
    }
    if (f.toilet && working) {
      c.toilet = f.toilet.kind;
      if (f.toilet.kind === 'cassette') {
        c.black = f.toilet.cassetteLiters ?? 19;
        if (it.where.kind === 'floor') c.black_d = dFromZ(def, it.where.z);
      }
    }
    if (f.shower && working) c.shower = f.shower;
    if (f.outdoorShower) c.outdoorShower = true;
    if (f.fridge && working && d.storage) {
      if (!c.fridge || f.fridge.liters > c.fridge.liters) {
        c.fridge = { liters: f.fridge.liters, mode: f.fridge.mode, watts: f.fridge.watts * (it.condition < 0.35 ? 1.35 : 1), propaneKgPerDay: f.fridge.propaneKgPerDay ?? 0, uid: it.uid };
      }
    }
    if (f.fan) c.fanW += f.fan.watts;
    if (f.lights) c.lightsW += f.lights.watts;
    if (f.awning) c.awning = true;
    if (f.comfort) c.comfort += f.comfort;
    if (f.seat) c.comfort += f.seat.comfort * 0.5;
    if (f.table) c.table = Math.max(c.table, f.table.workMul);
    if (f.bed) {
      let q = f.bed.quality;
      if (f.bed.usesMattress) {
        const m = mattressOn(s, it.uid);
        q = m ? (defOf(m).features?.mattress?.quality ?? 0.6) * (0.75 + 0.25 * m.condition) : 0.35;
      }
      if (q > c.bestBed.quality) c.bestBed = { quality: q, uid: it.uid, name: d.name };
    }
  }
  // Composting toilets have no black tank at all.
  if (c.toilet === 'composting' && !def.tanks.black) c.black = 0;
  return c;
}

/** Average condition of installed appliances (the "appliances" component). */
export function appliancesCondition(s: GameState, vid: string): number {
  const list = installedItems(s, vid).filter((i) => {
    const c = defOf(i).category;
    return c === 'appliance' || c === 'system';
  });
  if (!list.length) return 1;
  return list.reduce((a, i) => a + i.condition, 0) / list.length;
}

export function overallCondition(s: GameState, vid: string): number {
  const v = vehicleById(s, vid);
  const app = appliancesCondition(s, vid);
  return v.condition.engine * 0.35 + v.condition.steering * 0.22 + v.condition.brakes * 0.23 + app * 0.2;
}

export function slotUse(s: GameState, vid: string, slot: SlotKind): { used: number; capacity: number } {
  const def = vdef(vehicleById(s, vid));
  const cap = def.slots[slot]?.capacity ?? 0;
  const used = slotItems(s, vid, slot).reduce((a, i) => a + (defOf(i).slot?.size ?? 1), 0);
  return { used, capacity: cap };
}
