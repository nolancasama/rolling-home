import { materialDef } from '../data/materials';
import { itemDef } from '../data/items';
import type { Finish, VehicleDef } from '../data/types';
import { VEHICLES } from '../data/vehicles';
import type { GameState, ItemInstance, VehicleState } from './types';
import { factoryCustom, surfaceGeometry, windowArea } from './finishes';
import { resolveDef } from './families';

function mean(entries: { value: number; area: number }[]): number {
  const area = entries.reduce((n, e) => n + e.area, 0);
  return area ? entries.reduce((n, e) => n + e.value * e.area, 0) / area : 0;
}

function finishAppeal(f: Finish): number { return materialDef(f.mat).appeal; }

function score(def: VehicleDef, custom: VehicleState['custom'], items: ItemInstance[]): number {
  const surfaceMean = (kind: string) => mean(def.interior.surfaces.filter(s => s.kind === kind).map(s => ({
    area: surfaceGeometry(def, s).area, value: finishAppeal(custom.surfaces[s.id] ?? s.factory),
  })));
  const coverings = mean(def.interior.windows.filter(w => !w.door).map(w => {
    const t = custom.windows[w.id] ?? w.factory;
    const fabric = t?.type === 'day_night' ? t.fabric2 ?? t.fabric : t?.fabric;
    const value = !t || t.type === 'none' || !fabric ? 0 : t.valance
      ? (finishAppeal(fabric) + 0.3 * finishAppeal(t.valance)) / 1.3 : finishAppeal(fabric);
    return { area: windowArea(w), value };
  }));
  const furnishings = mean(items.filter(it => it.where.kind === 'floor').flatMap(it => {
    const d = resolveDef(itemDef(it.def), it);
    if (!d.slots?.length) return [];
    return [{ area: 1, value: d.slots.reduce((sum, slot) => sum + finishAppeal(it.finish?.[slot.id] ?? slot.default), 0) / d.slots.length * (0.6 + 0.4 * it.condition) }];
  }));
  return 0.35 * surfaceMean('floor') + 0.25 * surfaceMean('wall') + 0.08 * surfaceMean('ceiling') +
    0.04 * surfaceMean('trim') + 0.12 * coverings + 0.16 * furnishings;
}

export function interiorAppeal(s: GameState, vid: string): number {
  const v = s.vehicles.find(v => v.id === vid)!;
  const items = Object.values(s.items).filter(it => it.where.kind === 'floor' && it.where.vehicle === vid);
  return score(VEHICLES[v.def], v.custom, items);
}

const factoryCache = new WeakMap<VehicleDef, number>();
export function factoryAppeal(def: VehicleDef): number {
  const cached = factoryCache.get(def);
  if (cached !== undefined) return cached;
  const items: ItemInstance[] = def.defaults.flatMap((d, index) => 'slot' in d ? [] : [{
    uid: `factory${index}`, def: d.item, condition: def.startCondition.appliances,
    where: { kind: 'floor' as const, vehicle: 'factory', x: d.x, z: d.z, rot: d.rot, y: d.y },
    finish: d.finish, config: d.config, state: d.state,
  }]);
  const value = score(def, factoryCustom(def), items);
  factoryCache.set(def, value);
  return value;
}
