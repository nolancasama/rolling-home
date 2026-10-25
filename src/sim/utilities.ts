import { POWER, PROPANE } from '../data/config';
import { difficulty, fail, note, ok, type Result } from './core';
import { hourOf } from './core';
import { sunAt } from './places';
import type { GameState, LightSettings, VehicleState } from './types';
import { capacities, compartments, defOf, installedItems, itemsInCompartment, type Capacities } from './vehicle';

// RV utility flows. Water moves between tanks liter for liter; electricity is
// integrated in watt-hours; propane in kilograms.

export interface WaterUse {
  fresh: number;
  gray?: number;
  black?: number;
}

/** Can the RV supply this water use right now? */
export function checkWater(s: GameState, v: VehicleState, use: WaterUse, what: string): Result {
  const c = capacities(s, v.id);
  const cityWater = v.hookups.water;
  if (!cityWater && v.fresh < use.fresh - 1e-6) return fail(`Not enough fresh water for ${what}: ${use.fresh.toFixed(1)} L needed, ${v.fresh.toFixed(1)} L left.`);
  if (use.gray && !v.hookups.sewer && v.gray + use.gray > c.gray + 1e-6) return fail(`Gray tank is full (${Math.round(v.gray)}/${c.gray} L). Empty it at a dump station before ${what}.`);
  if (use.black && v.black + use.black > c.black + 1e-6) {
    return fail(c.black > 0 ? `Black tank is full (${Math.round(v.black)}/${c.black} L). Dump it before using the toilet.` : 'This RV has no toilet tank.');
  }
  return ok();
}

/** Apply a water use (call checkWater first). Returns liters pumped from the tank. */
export function applyWater(s: GameState, v: VehicleState, use: WaterUse): number {
  const mul = difficulty(s).resourceMul;
  const fresh = use.fresh * mul;
  let pumped = 0;
  if (!v.hookups.water) {
    pumped = Math.min(v.fresh, fresh);
    v.fresh = Math.max(0, v.fresh - fresh);
    v.batteryWh = Math.max(0, v.batteryWh - pumped * POWER.pumpWhPerL);
  }
  const c = capacities(s, v.id);
  if (use.gray) {
    if (v.hookups.sewer) {
      // gray valve open to the site sewer: nothing accumulates
    } else v.gray = Math.min(c.gray, v.gray + use.gray * mul);
  }
  if (use.black) v.black = Math.min(c.black, v.black + use.black * mul);
  return pumped;
}

export function sunFactor(min: number): number {
  const h = hourOf(min);
  if (h < 6 || h > 20) return 0;
  return Math.max(0, Math.sin((Math.PI * (h - 6)) / 14));
}

export function isNight(min: number): boolean {
  const h = hourOf(min);
  return h < 6.5 || h >= 19.5;
}

export function isEvening(min: number): boolean {
  const h = hourOf(min);
  return h >= 18.5 && h < 23.5;
}

export interface PowerContext {
  /** Extra continuous load (laptop for remote work...) */
  extraW?: number;
  driving?: boolean;
  occupied?: boolean;
  sleeping?: boolean;
}

export interface FixtureContext {
  hour: number;
  occupied?: boolean;
  sleeping?: boolean;
  awning?: boolean;
  exterior?: boolean;
}

/** Shared with the renderer: switching a fixture on keeps it on while away. */
export function fixtureLit(settings: Pick<LightSettings, 'mode'> | undefined, ctx: FixtureContext): boolean {
  const mode = settings?.mode ?? 'auto';
  if (mode === 'off') return false;
  if (mode === 'on') return true;
  const hour = ((ctx.hour % 24) + 24) % 24;
  const dark = hour >= 18.5 || hour < 6.5;
  return dark && (ctx.exterior ? !!ctx.awning : !!ctx.occupied && !ctx.sleeping);
}

export function fixtureLoad(s: GameState, v: VehicleState, ctx: PowerContext = {}, hour = hourOf(s.time.minutes)): number {
  let watts = 0;
  for (const it of installedItems(s, v.id)) {
    const light = defOf(it).light;
    if (light && fixtureLit(it.light, { ...ctx, hour, awning: v.awning, exterior: light.kind === 'exterior' })) {
      watts += light.watts * (light.dimmable ? Math.max(0.1, Math.min(1, it.light?.dim ?? 1)) : 1);
    }
  }
  return watts;
}

export function setLight(s: GameState, vid: string, uid: string, settings: Partial<LightSettings>): Result {
  const it = s.items[uid];
  if (!it || !installedItems(s, vid).some((x) => x.uid === uid)) return fail('That fixture is not installed in this RV.');
  const light = defOf(it).light;
  if (!light) return fail('That item is not a light fixture.');
  if (settings.mode != null && !['auto', 'on', 'off'].includes(settings.mode)) return fail('Choose auto, on or off.');
  if ((settings.dim != null && !Number.isFinite(settings.dim)) || (settings.kelvin != null && !Number.isFinite(settings.kelvin))) return fail('Light settings must be finite numbers.');
  const next = { mode: 'auto' as const, dim: 1, kelvin: light.kelvin[0], ...it.light, ...settings };
  next.dim = light.dimmable ? Math.max(0.1, Math.min(1, next.dim)) : 1;
  next.kelvin = Math.max(light.kelvin[0], Math.min(light.kelvin[1], next.kelvin));
  if (!light.rgb) delete next.color;
  it.light = next;
  return ok();
}

export function setAllLights(s: GameState, vid: string, mode: LightSettings['mode']): Result {
  if (!['auto', 'on', 'off'].includes(mode)) return fail('Choose auto, on or off.');
  for (const it of installedItems(s, vid)) if (defOf(it).light) setLight(s, vid, it.uid, { mode });
  return ok();
}

export interface PowerStatus {
  loadW: number;
  solarW: number;
  chargeW: number;
  netW: number;
  shore: boolean;
  fridgeOn: boolean;
  fridgeMode: 'electric' | 'propane' | 'off' | 'none';
}

export function fridgeState(v: VehicleState, c: Capacities): PowerStatus['fridgeMode'] {
  if (!c.fridge) return 'none';
  if (c.fridge.mode === '3way') {
    if (v.hookups.power || v.generatorOn) return 'electric';
    if (v.propane > 0.01) return 'propane';
    return 'off';
  }
  if (c.fridge.mode === '120v' && !(v.hookups.power || v.generatorOn) && c.inverterW < c.fridge.minInverter) return 'off';
  if (v.hookups.power || v.generatorOn || v.batteryWh > 1 || v.engineOn) return 'electric';
  return 'off';
}

/** Instantaneous power picture (also used by the RV status UI). */
export function powerStatus(s: GameState, v: VehicleState, ctx: PowerContext = {}): PowerStatus {
  const c = capacities(s, v.id);
  const mul = difficulty(s).resourceMul;
  const t = s.time.minutes;
  let load = POWER.parasiticW;
  const fm = fridgeState(v, c);
  if (fm === 'electric' && c.fridge) {
    load += c.fridge.mode === '120v' ? c.fridge.watts / 0.88 : c.fridge.mode === '3way' ? (v.hookups.power || v.generatorOn ? 0 : c.fridge.watts) : c.fridge.watts;
  }
  load += fixtureLoad(s, v, ctx);
  // Existing LED retrofit kits retain their additional evening draw.
  if (ctx.occupied && isEvening(t) && !ctx.sleeping) load += c.lightsW;
  if (isNight(t) && c.fanW) load += c.fanW;
  if (c.inverterW) load += c.inverterIdleW;
  load += ctx.extraW ?? 0;
  load *= mul;
  const solar = c.solarW * sunFactor(t) * sunAt(v.pose.x, v.pose.z) * c.solarEfficiency;
  const shore = v.hookups.power;
  let charge = solar;
  if (ctx.driving && v.engineOn) charge += POWER.alternatorW;
  if (shore || (v.generatorOn && c.generatorW > 0)) {
    // Shore/generator power runs the loads directly and charges the battery.
    charge = Math.max(POWER.chargerW, c.chargerW) + solar;
    load = 0;
  }
  return { loadW: load, solarW: solar, chargeW: charge, netW: charge - load, shore, fridgeOn: fm !== 'off' && fm !== 'none', fridgeMode: fm };
}

/** Integrate electricity, propane, generator fuel and food spoilage over dt game minutes. */
export function utilitiesTick(s: GameState, v: VehicleState, dtMin: number, ctx: PowerContext): void {
  const c = capacities(s, v.id);
  const ps = powerStatus(s, v, ctx);
  const before = v.batteryWh;
  v.batteryWh = Math.max(0, Math.min(c.batteryWh, v.batteryWh + (ps.netW * dtMin) / 60));
  if (before > 1 && v.batteryWh <= 1 && !ps.shore) note(s, 'House battery is flat. Electrical appliances have shut off.', 'bad');

  // Propane: 3-way fridge on gas.
  if (ps.fridgeMode === 'propane' && c.fridge) {
    v.propane = Math.max(0, v.propane - (c.fridge.propaneKgPerDay * dtMin) / 1440);
    if (v.propane <= 0.001) note(s, 'Propane tank is empty. The fridge has stopped cooling.', 'bad');
  }
  // Generator burns fuel from the main tank.
  if (v.generatorOn) {
    if (c.generatorW <= 0 || v.fuel <= 0.5) {
      v.generatorOn = false;
      note(s, 'Generator shut down (no fuel or no generator).', 'warn');
    } else v.fuel = Math.max(0, v.fuel - (c.generatorLph * dtMin) / 60);
  }

  // Food spoilage: perishables lose shelf life unless in a working fridge.
  const fridgeOn = ps.fridgeOn;
  const coldComps = new Set(compartments(s, v.id).filter((x) => x.refrigerated).map((x) => x.id));
  let spoiledNow = 0;
  for (const uid in s.items) {
    const it = s.items[uid];
    if (it.spoiled || it.shelf == null) continue;
    const w = it.where;
    const inFridge = w.kind === 'stored' && w.vehicle === v.id && coldComps.has(w.comp) && fridgeOn;
    if (inFridge) continue;
    // a weak fridge (low condition) still slows spoilage
    it.shelf -= dtMin;
    if (it.shelf <= 0) {
      it.spoiled = true;
      spoiledNow++;
    }
  }
  if (spoiledNow) note(s, `${spoiledNow} perishable item${spoiledNow > 1 ? 's' : ''} spoiled. Keep fresh food in a powered fridge.`, 'warn');
}

export function propaneUse(s: GameState, v: VehicleState, kg: number): Result {
  if (v.propane < kg - 1e-6) return fail('Propane tank is empty. Refill it at a fuel station.');
  v.propane = Math.max(0, v.propane - kg * difficulty(s).resourceMul);
  return ok();
}

export const PROPANE_USE = PROPANE;

export function fridgeContents(s: GameState, v: VehicleState) {
  const c = capacities(s, v.id);
  if (!c.fridge) return [];
  return itemsInCompartment(s, v.id, `item:${c.fridge.uid}`);
}

export function foodItems(s: GameState, vid: string) {
  return Object.values(s.items).filter((i) => {
    const w = i.where;
    return w.kind === 'stored' && w.vehicle === vid && defOf(i).food && (i.servings ?? 0) > 0;
  });
}
