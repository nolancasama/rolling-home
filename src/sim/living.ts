import { POWER, PROPANE, TIME, WATER } from '../data/config';
import { fail, hourOf, note, ok, type Result } from './core';
import { sleepModifier } from './camping';
import { addMood, restore } from './needs';
import { placeAt } from './places';
import type { GameState, ItemInstance } from './types';
import { applyWater, checkWater, foodItems, propaneUse } from './utilities';
import { activeVehicle, capacities, defOf, hasTool, itemsInVehicle } from './vehicle';

// Daily life inside the RV. Every function checks real resources first and
// returns minutes for the caller to advance time.

export interface Timed {
  minutes: number;
}

export function hasKitchenware(s: GameState): boolean {
  const v = activeVehicle(s);
  return itemsInVehicle(s, v.id).some((i) => i.def === 'kitchenware' && i.where.kind === 'stored');
}

export function butaneCanister(s: GameState): ItemInstance | undefined {
  const v = activeVehicle(s);
  return itemsInVehicle(s, v.id).find((i) => defOf(i).features?.butane && (i.uses ?? 0) > 0);
}

export function edibleFoods(s: GameState): ItemInstance[] {
  const v = activeVehicle(s);
  return foodItems(s, v.id).sort((a, b) => Number(!!a.spoiled) - Number(!!b.spoiled));
}

export function stoveCheck(s: GameState, minutes: number): Result {
  const v = activeVehicle(s);
  const c = capacities(s, v.id);
  if (!c.stove) return fail('There is no working stove in this RV.');
  if (c.stove === 'butane' && !butaneCanister(s)) return fail('Out of butane. Buy a canister at a shop.');
  if (c.stove === 'propane' && v.propane < PROPANE.perMealKg) return fail('The propane tank is empty. Refill it at a fuel station.');
  if (c.stove === 'induction') {
    const shore = v.hookups.power || v.generatorOn;
    const wh = (POWER.inductionW * minutes) / 60;
    if (!shore) {
      if (c.inverterW < POWER.inductionW) return fail('Induction needs shore power or a 2000 W inverter.');
      if (v.batteryWh < wh) return fail(`Not enough battery for induction cooking (${Math.round(wh)} Wh needed).`);
    }
  }
  return ok();
}

export function cookCheck(s: GameState, uid: string): Result {
  const it = s.items[uid];
  const f = it ? defOf(it).food : undefined;
  if (!it || !f) return fail('Choose something to cook.');
  if (it.spoiled) return fail(`The ${defOf(it).name.toLowerCase()} has spoiled.`);
  if ((it.servings ?? 0) <= 0) return fail('Nothing left.');
  if (f.kind !== 'cook') return fail('That does not need cooking. Just eat it.');
  const v = activeVehicle(s);
  const c = capacities(s, v.id);
  if (!c.sink) return fail('You need a galley with a sink to cook and wash up.');
  if (!hasKitchenware(s)) return fail('You need pots, pans and dishes to cook.');
  const st = stoveCheck(s, f.cookMinutes ?? 20);
  if (!st.ok) return st;
  return checkWater(s, v, { fresh: WATER.cook.fresh, gray: WATER.cook.gray }, 'cooking and washing up');
}

export function cook(s: GameState, uid: string): Result<Timed> {
  const chk = cookCheck(s, uid);
  if (!chk.ok) return chk;
  const v = activeVehicle(s);
  const c = capacities(s, v.id);
  const it = s.items[uid];
  const d = defOf(it);
  const f = d.food!;
  const minutes = (f.cookMinutes ?? 20) + 8;
  if (c.stove === 'butane') {
    const can = butaneCanister(s)!;
    can.uses = (can.uses ?? 1) - 1;
    if ((can.uses ?? 0) <= 0) {
      delete s.items[can.uid];
      note(s, 'Used up a butane canister.', 'info');
    }
  } else if (c.stove === 'propane') propaneUse(s, v, PROPANE.perMealKg);
  else if (c.stove === 'induction' && !(v.hookups.power || v.generatorOn)) {
    v.batteryWh = Math.max(0, v.batteryWh - (POWER.inductionW * (f.cookMinutes ?? 20)) / 60);
  }
  applyWater(s, v, { fresh: WATER.cook.fresh, gray: WATER.cook.gray });
  it.servings = (it.servings ?? 1) - 1;
  if ((it.servings ?? 0) <= 0) delete s.items[uid];
  restore(s, 'hunger', f.hunger);
  addMood(s, 'meal', 'Good home-cooked meal', (f.mood ?? 0) + 3, 5);
  return ok({ minutes });
}

export function eat(s: GameState, uid: string): Result<Timed> {
  const it = s.items[uid];
  const f = it ? defOf(it).food : undefined;
  if (!it || !f) return fail('Choose something to eat.');
  if (it.spoiled) return fail('That has spoiled. Throw it out.');
  if ((it.servings ?? 0) <= 0) return fail('Nothing left.');
  let hunger = f.hunger;
  let minutes = 6;
  if (f.kind === 'cook') {
    hunger *= it.def === 'canned_chili' ? 0.7 : 0.45;
    addMood(s, 'cold_meal', 'Cold dinner from the package', -3, 3);
  } else {
    addMood(s, 'snack', f.kind === 'ready' ? 'Decent meal' : 'Tasty snack', f.mood ?? 1, 2);
    minutes = f.kind === 'ready' ? 15 : 4;
  }
  restore(s, 'hunger', hunger);
  it.servings = (it.servings ?? 1) - 1;
  if ((it.servings ?? 0) <= 0) delete s.items[uid];
  return ok({ minutes });
}

export function discard(s: GameState, uid: string): Result {
  if (!s.items[uid]) return fail('Item not found.');
  delete s.items[uid];
  return ok();
}

// ── sleep ──

export interface SleepPlan {
  minutes: number;
  quality: number;
  bed: string;
  reasons: string[];
}

export function sleepPlan(s: GameState, nap: boolean): SleepPlan {
  const v = activeVehicle(s);
  const c = capacities(s, v.id);
  const now = s.time.minutes;
  let minutes = 60;
  if (!nap) {
    const h = hourOf(now);
    const wake = TIME.wakeHour;
    minutes = ((wake - h + 24) % 24) * 60;
    if (minutes < 180) minutes += 24 * 60; // going to bed just before wake time sleeps a full night
    if (minutes > 14 * 60) minutes = Math.max(180, minutes - 24 * 60);
  }
  const reasons: string[] = [];
  let q = c.bestBed.quality;
  if (q <= 0) {
    q = 0.35;
    reasons.push('No bed: sleeping on the floor');
  }
  const mod = sleepModifier(s);
  q *= mod.mul;
  reasons.push(...mod.reasons);
  if (s.player.needs.hunger < 15) {
    q *= 0.85;
    reasons.push('Hungry');
  }
  if (s.player.needs.hygiene < 15) {
    q *= 0.95;
    reasons.push('Feeling grimy');
  }
  return { minutes: Math.round(minutes), quality: Math.max(0.2, q), bed: c.bestBed.name, reasons };
}

// ── bathroom ──

export function rvShowerCheck(s: GameState): Result {
  const v = activeVehicle(s);
  const c = capacities(s, v.id);
  if (!c.shower) return fail('This RV has no shower. Campgrounds and truck stops have them.');
  return checkWater(s, v, { fresh: c.shower.liters, gray: c.shower.liters }, 'a shower');
}

export function rvShower(s: GameState): Result<Timed & { hot: boolean }> {
  const chk = rvShowerCheck(s);
  if (!chk.ok) return chk;
  const v = activeVehicle(s);
  const c = capacities(s, v.id);
  const sh = c.shower!;
  let hot = false;
  if (v.hookups.power || v.generatorOn) hot = true;
  else if (sh.heater === 'propane' && v.propane >= PROPANE.perShowerKg) {
    propaneUse(s, v, PROPANE.perShowerKg);
    hot = true;
  }
  applyWater(s, v, { fresh: sh.liters, gray: sh.liters });
  restore(s, 'hygiene', 100);
  if (hot) addMood(s, 'shower', 'Hot shower', 5, 4);
  else addMood(s, 'shower', 'Freezing shower (no hot water)', -4, 3);
  return ok({ minutes: 15, hot });
}

export function outdoorShowerCheck(s: GameState): Result {
  const v = activeVehicle(s);
  const c = capacities(s, v.id);
  if (!c.outdoorShower) return fail('You need an outdoor shower kit.');
  const p = placeAt(v.pose.x, v.pose.z);
  if (p?.kind === 'town') return fail('Not in town, please.');
  return checkWater(s, v, { fresh: 10 }, 'an outdoor shower');
}

export function outdoorShower(s: GameState): Result<Timed> {
  const chk = outdoorShowerCheck(s);
  if (!chk.ok) return chk;
  const v = activeVehicle(s);
  applyWater(s, v, { fresh: 10 });
  restore(s, 'hygiene', 80);
  addMood(s, 'shower', 'Rinsed off under the open sky', 3, 3);
  return ok({ minutes: 12 });
}

export function toiletCheck(s: GameState): Result {
  const v = activeVehicle(s);
  const c = capacities(s, v.id);
  if (!c.toilet) return fail('This RV has no toilet.');
  if (c.toilet === 'composting') return ok();
  return checkWater(s, v, { fresh: WATER.toilet.fresh, black: WATER.toilet.black }, 'flushing');
}

export function useToilet(s: GameState): Result<Timed> {
  const chk = toiletCheck(s);
  if (!chk.ok) return chk;
  const v = activeVehicle(s);
  const c = capacities(s, v.id);
  if (c.toilet !== 'composting') applyWater(s, v, { fresh: WATER.toilet.fresh, black: WATER.toilet.black });
  addMood(s, 'relief', 'Relieved', 1, 1);
  return ok({ minutes: 4 });
}

export function washCheck(s: GameState): Result {
  const v = activeVehicle(s);
  if (!capacities(s, v.id).sink) return fail('There is no sink.');
  return checkWater(s, v, { fresh: WATER.wash.fresh, gray: WATER.wash.gray }, 'washing up');
}

export function washUp(s: GameState): Result<Timed> {
  const chk = washCheck(s);
  if (!chk.ok) return chk;
  applyWater(s, activeVehicle(s), { fresh: WATER.wash.fresh, gray: WATER.wash.gray });
  restore(s, 'hygiene', 14);
  return ok({ minutes: 5 });
}

// ── leisure ──

export function hobby(s: GameState, uid: string): Result<Timed> {
  const it = s.items[uid];
  const a = it ? defOf(it).features?.activity : undefined;
  if (!it || !a) return fail('Nothing to do with that.');
  addMood(s, `hobby_${a.kind}`, a.kind === 'guitar' ? 'Played some music' : 'Lost in a good book', a.mood, 6);
  return ok({ minutes: a.minutes });
}

export function relax(s: GameState, outside: boolean): Result<Timed> {
  addMood(s, 'relax', outside ? 'Sat outside watching the world' : 'Put my feet up', outside ? 5 : 3, 4);
  return ok({ minutes: 30 });
}

export function hasLaptop(s: GameState): boolean {
  const v = activeVehicle(s);
  return itemsInVehicle(s, v.id).some((i) => defOf(i).features?.laptop && i.where.kind === 'stored');
}

export function toolPresent(s: GameState, tool: string): boolean {
  return hasTool(s, activeVehicle(s).id, tool);
}
