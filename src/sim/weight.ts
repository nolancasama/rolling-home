import { DENSITY, OVERLOAD, PERSON_MASS } from '../data/config';
import { dFromZ } from '../data/vehicles';
import type { GameState } from './types';
import { capacities, compartments, defOf, itemKg, itemName, itemsInVehicle, vdef, vehicleById } from './vehicle';

// Gross weight and axle loads from first principles: every mass element has a
// longitudinal position d (m behind the front axle). Rear axle load is the
// moment sum / wheelbase; the front axle carries the rest.

export type WeightCat =
  | 'vehicle' | 'equipment' | 'furniture' | 'belongings' | 'passengers' | 'supplies'
  | 'fuel' | 'fresh' | 'gray' | 'black' | 'propane' | 'cargo';

export const WEIGHT_CAT_LABEL: Record<WeightCat, string> = {
  vehicle: 'Base vehicle', equipment: 'Installed equipment', furniture: 'Furniture', belongings: 'Personal belongings',
  passengers: 'Passengers', supplies: 'Food & supplies', fuel: 'Fuel', fresh: 'Fresh water', gray: 'Gray water',
  black: 'Black water', propane: 'Propane', cargo: 'Delivery cargo',
};

export interface MassEl {
  label: string;
  cat: WeightCat;
  kg: number;
  d: number;
}

export type WeightStatus = 'ok' | 'near' | 'over' | 'refuse';

export interface WeightReport {
  total: number;
  gvwr: number;
  payloadLeft: number;
  front: number;
  rear: number;
  frontGawr: number;
  rearGawr: number;
  byCat: Record<WeightCat, number>;
  elements: MassEl[];
  overGvwr: number;
  overFront: number;
  overRear: number;
  /** Largest fraction over any rating (0 when within limits). */
  worstFraction: number;
  status: WeightStatus;
  messages: string[];
  /** Mass on high roof storage (handling). */
  roofKg: number;
}

function catForItem(category: string): WeightCat {
  switch (category) {
    case 'appliance':
    case 'system':
      return 'equipment';
    case 'furniture':
    case 'mattress':
      return 'furniture';
    case 'grocery':
    case 'supply':
      return 'supplies';
    case 'cargo':
      return 'cargo';
    default:
      return 'belongings';
  }
}

export interface MassOverride {
  /** Liters to use instead of the current tank level. */
  fresh?: number;
  gray?: number;
  black?: number;
  fuel?: number;
  /** Extra hypothetical elements (a purchase being previewed). */
  extra?: MassEl[];
  /** Item uids to ignore (an item being removed). */
  exclude?: string[];
}

export function computeWeight(s: GameState, vid: string, o: MassOverride = {}): WeightReport {
  const v = vehicleById(s, vid);
  const def = vdef(v);
  const caps = capacities(s, vid);
  const els: MassEl[] = [];
  els.push({ label: def.shortName, cat: 'vehicle', kg: def.shellMass, d: def.shellD });
  els.push({ label: 'Driver', cat: 'passengers', kg: PERSON_MASS, d: dFromZ(def, def.interior.driverSeat.z) });

  const comps = compartments(s, vid);
  const compD: Record<string, number> = {};
  for (const c of comps) compD[c.id] = c.d;
  const slotD = (slot: string) => def.slots[slot as keyof typeof def.slots]?.d ?? def.shellD;
  const floorD: Record<string, number> = {};
  let roofKg = 0;
  const exclude = new Set(o.exclude ?? []);

  const items = itemsInVehicle(s, vid).filter((it) => !exclude.has(it.uid));
  for (const it of items) if (it.where.kind === 'floor') floorD[it.uid] = dFromZ(def, it.where.z);
  for (const it of items) {
    const d = defOf(it);
    const kg = itemKg(it);
    let pos = def.shellD;
    const w = it.where;
    if (w.kind === 'stored') {
      pos = compD[w.comp] ?? def.shellD;
      if (w.comp === 'roof') roofKg += kg;
    } else if (w.kind === 'floor') pos = floorD[it.uid];
    else if (w.kind === 'slot') pos = slotD(w.slot);
    else if (w.kind === 'mattress') pos = floorD[w.bed] ?? def.shellD;
    els.push({ label: itemName(it), cat: catForItem(d.category), kg, d: pos });
  }

  const fuelL = o.fuel ?? v.fuel;
  els.push({ label: 'Fuel', cat: 'fuel', kg: fuelL * DENSITY[def.fuelType], d: def.tanks.fuel.d });
  const freshL = o.fresh ?? v.fresh;
  const mainL = Math.min(freshL, caps.freshMain);
  els.push({ label: 'Fresh water', cat: 'fresh', kg: mainL * DENSITY.water, d: def.tanks.fresh.d });
  if (freshL > mainL) {
    els.push({ label: 'Fresh water (aux tank)', cat: 'fresh', kg: (freshL - mainL) * DENSITY.water, d: slotD('tank') });
  }
  els.push({ label: 'Gray water', cat: 'gray', kg: (o.gray ?? v.gray) * DENSITY.water, d: def.tanks.gray.d });
  els.push({ label: 'Black water', cat: 'black', kg: (o.black ?? v.black) * DENSITY.water, d: caps.black_d || def.tanks.gray.d });
  if (def.tanks.propane) els.push({ label: 'Propane', cat: 'propane', kg: v.propane, d: def.tanks.propane.d });
  if (o.extra) els.push(...o.extra);

  let total = 0, moment = 0;
  const byCat = Object.fromEntries(Object.keys(WEIGHT_CAT_LABEL).map((k) => [k, 0])) as Record<WeightCat, number>;
  for (const e of els) {
    total += e.kg;
    moment += e.kg * e.d;
    byCat[e.cat] += e.kg;
  }
  const rear = moment / def.dims.wheelbase;
  const front = total - rear;
  const overGvwr = Math.max(0, total - def.gvwr);
  const overFront = Math.max(0, front - def.frontGawr);
  const overRear = Math.max(0, rear - def.rearGawr);
  const worstFraction = Math.max(overGvwr / def.gvwr, overFront / def.frontGawr, overRear / def.rearGawr);
  const messages: string[] = [];
  if (overGvwr > 0) messages.push(`Over gross weight rating by ${Math.round(overGvwr)} kg`);
  if (overFront > 0) messages.push(`Front axle over its rating by ${Math.round(overFront)} kg`);
  if (overRear > 0) messages.push(`Rear axle over its rating by ${Math.round(overRear)} kg`);
  if (front < total * 0.3) messages.push('Very little weight on the front axle: steering will feel light');
  let status: WeightStatus = 'ok';
  if (worstFraction > OVERLOAD.refuseFraction) status = 'refuse';
  else if (worstFraction > 0) status = 'over';
  else if (total > def.gvwr * 0.97 || front > def.frontGawr * 0.97 || rear > def.rearGawr * 0.97) status = 'near';
  return {
    total, gvwr: def.gvwr, payloadLeft: def.gvwr - total, front, rear, frontGawr: def.frontGawr, rearGawr: def.rearGawr,
    byCat, elements: els, overGvwr, overFront, overRear, worstFraction, status, messages, roofKg,
  };
}

/** Load factor used by performance: 1 = curb + driver, >1 heavier. */
export function loadRatio(s: GameState, vid: string): number {
  const w = computeWeight(s, vid);
  const def = vdef(vehicleById(s, vid));
  return w.total / (def.shellMass + PERSON_MASS + 200);
}
