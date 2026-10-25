import type { ItemConfig, ItemDef } from '../data/types';
import { materialDef } from '../data/materials';
import type { ItemInstance } from './types';

/** Normalize purchased dimensions without changing the catalog's intentionally chosen defaults. */
export function normalizeConfig(def: ItemDef, config: ItemConfig = {}, clearance = 3): ItemConfig {
  const family = def.family;
  if (!family) return {};
  const out: ItemConfig = { ...family.defaults };
  for (const key of ['w', 'h', 'd'] as const) {
    const range = family[key];
    if (!range) continue;
    const max = range[1] === 'clearance' ? clearance : range[1];
    const n = config[key];
    if (n === family.defaults[key]) {
      if (typeof n === 'number') out[key] = Math.min(max, n);
      continue;
    }
    if (typeof n === 'number' && Number.isFinite(n)) {
      out[key] = Number(Math.max(range[0], Math.min(max, range[0] + Math.round((n - range[0]) / range[2]) * range[2])).toFixed(4));
    } else if (typeof out[key] === 'number') out[key] = Math.min(max, out[key]!);
  }
  for (const [key, choices] of Object.entries(family.options ?? {})) {
    const k = key as keyof ItemConfig;
    if (choices!.includes(config[k] as never)) Object.assign(out, { [k]: config[k] });
  }
  if (family.id === 'strip') {
    const n = config.length ?? out.length ?? 0.6;
    out.length = Number(Math.max(0.3, Math.min(1.5, Math.round((Number.isFinite(n) ? n : 0.6) * 10) / 10)).toFixed(1));
  }
  if (family.id === 'rug') out.size = ['s', 'm', 'l', 'runner'].includes(config.size ?? '') ? config.size : out.size ?? 'm';
  return out;
}

const cache = new Map<string, ItemDef>();

/** Effective, shared definition for every simulation and renderer consumer. */
export function resolveDef(def: ItemDef, inst: Pick<ItemInstance, 'config' | 'state' | 'finish'>): ItemDef {
  const counters = def.slots?.filter((slot) => slot.surfaces.includes('counter')) ?? [];
  if (!def.family && !def.floor?.states && !counters.some((slot) => inst.finish?.[slot.id])) return def;
  const config = normalizeConfig(def, inst.config);
  const key = `${def.id}:${JSON.stringify(config)}:${inst.state ?? ''}:${JSON.stringify(inst.finish ?? {})}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const result: ItemDef = { ...def, floor: def.floor && { ...def.floor }, features: def.features && { ...def.features } };
  const family = def.family;
  if (!family && def.floor) {
    const [w, d] = def.floor.footprint;
    for (const slot of counters) {
      const finish = inst.finish?.[slot.id];
      if (!finish) continue;
      const current = materialDef(finish.mat), initial = materialDef(slot.default.mat);
      const area = w * (d + 0.02);
      result.mass += area * (current.kgPerM2 - initial.kgPerM2);
      result.price += area * (current.pricePerM2 - initial.pricePerM2);
    }
  }
  if (family?.id === 'cabinet') {
    const w = config.w!, h = config.h!, d = config.d!;
    const counterSlot = def.slots?.find((slot) => slot.id === 'counter' || slot.id === 'top');
    const counter = !!counterSlot;
    const hc = h - (counter ? 0.04 : 0);
    const shelves = config.shelves ?? 0;
    const front = config.front ?? 'doors';
    const drawers = front === 'drawers' || front === 'mixed' ? config.drawers ?? 4 : 0;
    const doors = front === 'open' || front === 'drawers' ? 0 : config.doors ?? (w <= 0.5 ? 1 : family.type === 'upper' ? Math.ceil(w / 0.5) : 2);
    const handles = doors + drawers;
    const carcassArea = 2 * hc * d + 2 * w * d + shelves * w * d * 0.95;
    const frontArea = front === 'open' ? 0 : w * hc;
    const style = config.style ?? 'slab';
    const frontDensity = front === 'glass' ? 9 : { slab: 6, shaker: 6.6, louver: 5, beadboard: 6.3 }[style];
    const handle = config.handle ?? 'bar';
    const mat = counterSlot ? materialDef(inst.finish?.[counterSlot.id]?.mat ?? counterSlot.default.mat) : null;
    const counterArea = counter ? w * (d + 0.02) : 0;
    result.mass = carcassArea * 6 + w * hc * 3 + frontArea * frontDensity + drawers * 1.6 + doors * 0.15 + handles * (handle === 'edge' ? 0.02 : 0.12) + counterArea * (mat?.kgPerM2 ?? 0);
    const stylePrice = front === 'glass' ? 1.25 : style === 'shaker' ? 1.15 : style === 'louver' ? 1.1 : 1;
    result.price = Math.round(((60 + 140 * frontArea + 90 * carcassArea) * stylePrice + handles * { bar: 8, knob: 6, cup: 9, edge: 0, latch: 12 }[handle] + 35 * drawers + counterArea * (mat?.pricePerM2 ?? 0)) / 5) * 5;
    const k = front === 'open' ? 0.5 : front === 'drawers' || front === 'mixed' ? 0.38 : 0.42;
    const liters = k * (w - 0.03) * (hc - 0.04) * (d - 0.03) * 1000;
    result.storage = { ...def.storage, liters, maxKg: Math.min(def.floor?.mount === 'wall' ? 25 : 60, 10 + 0.22 * liters), secure: true };
    result.floor = { ...result.floor!, footprint: [w, d], height: h, access: [w, family.type === 'upper' ? 0.9 : family.type === 'shelf' ? 0.6 : 0.5] };
    result.dims = [Math.max(w, h), d, 0.12];
  } else if (family?.id === 'sofa') {
    const w = config.w!, d = config.d ?? def.floor!.footprint[1];
    const jackknife = def.id === 'sofa_jackknife';
    result.mass = jackknife ? 34 + 12 * w : 18 + 16 * w + (config.arms === 'none' ? 0 : 4);
    result.price = jackknife ? 650 + 300 * w : 380 + 320 * w + (config.arms === 'round' ? 60 : 0) + (config.legs === 'metal' ? 40 : 0);
    result.floor = { ...result.floor!, footprint: [w, d], states: def.floor?.states?.map((state) => ({ ...state, footprint: [w, state.id === 'bed' ? 1.2 : d] })) };
    result.features = { ...result.features, seat: { comfort: jackknife ? 3 : 3 + (w >= 1.6 ? 1 : 0) } };
    result.dims = [w, d, result.floor.height];
  } else if (family?.id === 'rug') {
    const sizes: Record<string, [number, number]> = { s: [0.6, 0.9], m: [0.9, 1.5], l: [1.2, 1.8], runner: [0.7, 2.2] };
    const size = sizes[config.size ?? 'm'];
    const area = size[0] * size[1];
    result.floor = { ...result.floor!, footprint: size };
    result.mass = 1.5 * area;
    result.price = 30 + 25 * area;
    result.features = { ...result.features, comfort: 1 + (area > 1 ? 1 : 0) };
    result.dims = [size[0], size[1], 0.02];
  } else if (family?.id === 'strip') {
    const length = config.length!;
    result.floor = { ...result.floor!, footprint: [length, 0.04] };
    result.mass = 0.12 * length;
    result.price = 15 + 20 * length;
    result.light = def.light && { ...def.light, watts: def.light.watts * length, lumens: def.light.lumens * length };
    result.dims = [length, 0.04, result.floor.height];
  }
  const states = result.floor?.states;
  const state = states?.find((entry) => entry.id === inst.state) ?? states?.[0];
  if (state) result.floor = { ...result.floor!, footprint: state.footprint, height: state.height, access: state.access ?? result.floor?.access };
  cache.set(key, result);
  return result;
}
