import { ECONOMY } from '../data/config';
import { EVENTS } from '../data/content';
import { ANCHOR_BY_ID, CAMPGROUND_BY_ID, CAMPGROUNDS } from '../data/map';
import { PROCEDURES, type ProcMistake } from '../data/procedures';
import { charge, dayOf, fail, hourOf, journal, money, newItem, note, ok, price, weekdayOf, type Result } from './core';
import { dist } from './geo';
import { addMood, restore } from './needs';
import { rngFor } from './rng';
import { placeAt, vehicleAtAnchor } from './places';
import { bestCompartment } from './storage';
import type { GameState } from './types';
import { activeVehicle, capacities, defOf, hasTool, itemsInVehicle, vdef } from './vehicle';

// Fuel, water, dumping, propane, car wash, paid showers, food and leisure.

export interface Timed {
  minutes: number;
}

function anchorPrice(s: GameState, anchorId: string): number {
  return price(s, ANCHOR_BY_ID[anchorId]?.price ?? 0);
}

function guestAt(s: GameState, place: string): boolean {
  const r = s.reservation;
  if (!r) return false;
  return CAMPGROUND_BY_ID[r.camp]?.place === place;
}

function requireVehicleAt(s: GameState, anchorId: string, what: string): Result {
  const v = activeVehicle(s);
  if (!vehicleAtAnchor(v, anchorId)) return fail(`Bring your RV closer to the ${what}.`);
  return ok();
}

// ── fuel ──

export function fuelQuote(s: GameState, anchorId: string) {
  const v = activeVehicle(s);
  const cap = capacities(s, v.id).fuel;
  const per = anchorPrice(s, anchorId);
  const max = Math.max(0, cap - v.fuel);
  return { perLiter: per, maxLiters: max, current: v.fuel, capacity: cap, fullCost: Math.round(max * per * 100) / 100 };
}

export function refuel(s: GameState, anchorId: string, liters: number): Result<Timed & { cost: number }> {
  const at = requireVehicleAt(s, anchorId, 'pump');
  if (!at.ok) return at;
  const q = fuelQuote(s, anchorId);
  liters = Math.max(0, Math.min(q.maxLiters, liters));
  if (liters < 0.5) return fail('The tank is already full.');
  const cost = Math.round(liters * q.perLiter * 100) / 100;
  const paid = charge(s, cost, 'fuel', `Fuel ${liters.toFixed(1)} L`);
  if (!paid.ok) return paid;
  activeVehicle(s).fuel += liters;
  return ok({ minutes: 4 + liters / 25, cost });
}

// ── fresh water ──

export function waterQuote(s: GameState, anchorId: string) {
  const v = activeVehicle(s);
  const c = capacities(s, v.id);
  const fee = guestAt(s, ANCHOR_BY_ID[anchorId]?.place ?? '') ? 0 : anchorPrice(s, anchorId);
  return { current: v.fresh, capacity: c.fresh, fee, hose: hasTool(s, v.id, 'water_hose') };
}

export function fillWater(s: GameState, anchorId: string, target: number): Result<Timed & { added: number }> {
  const at = requireVehicleAt(s, anchorId, 'water fill');
  if (!at.ok) return at;
  const q = waterQuote(s, anchorId);
  if (!q.hose) return fail('You need a drinking-water hose to fill the tank.');
  const v = activeVehicle(s);
  target = Math.max(0, Math.min(q.capacity, target));
  const added = target - v.fresh;
  if (added > 0.5 && q.fee > 0) {
    const paid = charge(s, q.fee, 'services', 'Fresh water fill');
    if (!paid.ok) return paid;
  }
  v.fresh = target;
  return ok({ minutes: 3 + Math.abs(added) / 12, added });
}

/** Let fresh water out (to save weight). Not allowed on town streets. */
export function drainFresh(s: GameState, target: number): Result<Timed & { removed: number }> {
  const v = activeVehicle(s);
  const p = placeAt(v.pose.x, v.pose.z);
  if (p?.kind === 'town') return fail('Draining water on town streets is not allowed. Use a dump station or leave town.');
  target = Math.max(0, Math.min(v.fresh, target));
  const removed = v.fresh - target;
  if (removed < 0.5) return fail('Nothing to drain.');
  v.fresh = target;
  return ok({ minutes: 2 + removed / 15, removed });
}

export function pourJug(s: GameState, uid: string): Result<Timed & { liters: number }> {
  const it = s.items[uid];
  const v = activeVehicle(s);
  if (!it || !defOf(it).features?.waterJug) return fail('That is not a water jug.');
  const c = capacities(s, v.id);
  const room = c.fresh - v.fresh;
  const liters = Math.min(room, it.uses ?? 0);
  if (liters < 0.2) return fail(room < 0.2 ? 'The fresh tank is full.' : 'The jug is empty.');
  v.fresh += liters;
  it.uses = (it.uses ?? 0) - liters;
  if ((it.uses ?? 0) <= 0.05) delete s.items[uid];
  return ok({ minutes: 3, liters });
}

// ── dump station ──

export function dumpQuote(s: GameState, anchorId: string) {
  const v = activeVehicle(s);
  const c = capacities(s, v.id);
  const a = ANCHOR_BY_ID[anchorId];
  const fee = guestAt(s, a?.place ?? '') ? 0 : anchorPrice(s, anchorId);
  const cassetteOnly = c.toilet === 'cassette';
  return {
    gray: v.gray, black: v.black, grayCap: c.gray, blackCap: c.black, fee,
    needsKit: v.gray > 0.5 || (!cassetteOnly && v.black > 0.5), kit: hasTool(s, v.id, 'sewer_kit'), cassetteOnly,
  };
}

export function dumpCheck(s: GameState, anchorId: string): Result {
  const at = requireVehicleAt(s, anchorId, 'dump station');
  if (!at.ok) return at;
  const q = dumpQuote(s, anchorId);
  if (q.gray < 0.5 && q.black < 0.5) return fail('Both waste tanks are already empty.');
  if (q.needsKit && !q.kit) {
    if (q.cassetteOnly && q.black > 0.5) return ok();
    return fail('You need a sewer hose kit to dump the gray tank.');
  }
  return ok();
}

export function dump(s: GameState, anchorId: string): Result<Timed & { gray: number; black: number; fee: number }> {
  const chk = dumpCheck(s, anchorId);
  if (!chk.ok) return chk;
  const q = dumpQuote(s, anchorId);
  if (q.fee > 0) {
    const paid = charge(s, q.fee, 'services', 'Dump station fee');
    if (!paid.ok) return paid;
  }
  const v = activeVehicle(s);
  const gray = q.kit ? v.gray : 0;
  const black = v.black;
  v.black = 0;
  if (q.kit) v.gray = 0;
  restore(s, 'hygiene', -4);
  if (!q.kit && gray === 0 && v.gray > 0.5) note(s, 'You emptied the cassette, but the gray tank needs a sewer hose kit.', 'warn');
  return ok({ minutes: 6 + (gray + black) / 30, gray, black, fee: q.fee });
}

export function procedureLearned(s: GameState, procId: string): boolean {
  return (s.procedures[procId] ?? 0) > 0;
}

export function completeProcedure(s: GameState, procId: string): void {
  const first = !procedureLearned(s, procId);
  s.procedures[procId] = (s.procedures[procId] ?? 0) + 1;
  if (first) journal(s, 'tip', `Learned: ${PROCEDURES[procId]?.title ?? procId}. Next time you can do it quickly.`);
}

export function applyMistake(s: GameState, m: ProcMistake): void {
  if (m.hygiene) restore(s, 'hygiene', m.hygiene);
  if (m.mood) addMood(s, `oops_${m.step}`, 'Embarrassing mishap', m.mood, 3);
  if (m.toolDamage) {
    const v = activeVehicle(s);
    const tool = itemsInVehicle(s, v.id).find((i) => i.def === m.toolDamage);
    if (tool) tool.condition = Math.max(0.2, tool.condition - 0.15);
  }
  note(s, m.text, 'bad');
}

// ── propane ──

export function propaneQuote(s: GameState, anchorId: string) {
  const v = activeVehicle(s);
  const cap = capacities(s, v.id).propane;
  const per = anchorPrice(s, anchorId);
  const kg = Math.max(0, cap - v.propane);
  return { capacity: cap, current: v.propane, kg, perKg: per, cost: Math.round(kg * per * 100) / 100 };
}

export function refillPropane(s: GameState, anchorId: string): Result<Timed & { kg: number; cost: number }> {
  const at = requireVehicleAt(s, anchorId, 'propane station');
  if (!at.ok) return at;
  const q = propaneQuote(s, anchorId);
  if (q.capacity <= 0) return fail('This RV has no propane system. (Butane canisters are sold in shops.)');
  if (q.kg < 0.2) return fail('The propane tank is full.');
  const paid = charge(s, Math.max(5, q.cost), 'fuel', `Propane ${q.kg.toFixed(1)} kg`);
  if (!paid.ok) return paid;
  activeVehicle(s).propane = q.capacity;
  return ok({ minutes: 10, kg: q.kg, cost: Math.max(5, q.cost) });
}

// ── car wash ──

export function carWash(s: GameState, anchorId: string): Result<Timed> {
  const at = requireVehicleAt(s, anchorId, 'car wash');
  if (!at.ok) return at;
  const v = activeVehicle(s);
  if (v.dirt < 0.05) return fail('Your RV is already clean.');
  const cost = price(s, (ANCHOR_BY_ID[anchorId].price ?? 9) * (v.def === 'classc' ? 1.6 : 1));
  const paid = charge(s, cost, 'services', 'Car wash');
  if (!paid.ok) return paid;
  v.dirt = 0;
  addMood(s, 'clean_rv', 'Sparkling clean RV', 3, 12);
  return ok({ minutes: 15 });
}

// ── people services ──

export function showerQuote(s: GameState, anchorId: string): { price: number; free: boolean } {
  const a = ANCHOR_BY_ID[anchorId];
  const camp = a?.ref ? CAMPGROUND_BY_ID[a.ref] : undefined;
  const guest = !!camp && guestAt(s, camp.place);
  if (camp?.showers === 'free' && guest) return { price: 0, free: true };
  if (camp?.showers === 'free' && !guest) return { price: price(s, 8), free: false };
  return { price: price(s, a?.price ?? 5), free: false };
}

export function paidShower(s: GameState, anchorId: string): Result<Timed> {
  const q = showerQuote(s, anchorId);
  if (q.price > 0) {
    const paid = charge(s, q.price, 'services', 'Shower');
    if (!paid.ok) return paid;
  }
  restore(s, 'hygiene', 100);
  addMood(s, 'shower', 'Long hot shower', 6, 5);
  return ok({ minutes: 20 });
}

export function dinerMeal(s: GameState, anchorId: string): Result<Timed> {
  const cost = anchorPrice(s, anchorId) || price(s, 12);
  const paid = charge(s, cost, 'food', 'Diner meal');
  if (!paid.ok) return paid;
  restore(s, 'hunger', ECONOMY.dinerHunger);
  addMood(s, 'diner', 'Hot meal at the diner', 5, 5);
  return ok({ minutes: 45 });
}

export function rentCanoe(s: GameState, anchorId: string): Result<Timed> {
  const h = hourOf(s.time.minutes);
  if (h < 8 || h > 19) return fail('The canoe rental is open 8 AM to 7 PM.');
  const paid = charge(s, anchorPrice(s, anchorId), 'other', 'Canoe rental');
  if (!paid.ok) return paid;
  addMood(s, 'canoe', 'Paddled across the lake', ECONOMY.canoeMood, 10);
  return ok({ minutes: 75 });
}

export function goFishing(s: GameState): Result<Timed & { caught: boolean }> {
  const h = hourOf(s.time.minutes);
  if (h < 5 || h > 21) return fail('Too dark to fish.');
  const key = Number(s.flags.fishCount ?? 0);
  s.flags.fishCount = key + 1;
  const rng = rngFor(s.seed, 'fish', dayOf(s.time.minutes), key);
  const goodTime = h < 9 || h > 17;
  const caught = rng() < (goodTime ? 0.7 : 0.4);
  addMood(s, 'fishing', 'Quiet hour by the water', 6, 6);
  if (caught) {
    const v = activeVehicle(s);
    const fish = newItem(s, 'trout', { kind: 'carried' });
    const comp = bestCompartment(s, v.id, fish);
    if (comp) {
      fish.where = { kind: 'stored', vehicle: v.id, comp };
      note(s, 'You caught a trout! It is in your RV storage.', 'good');
    } else {
      delete s.items[fish.uid];
      note(s, 'You caught a trout, but had nowhere to keep it, so you let it go.', 'info');
    }
  } else note(s, 'Nothing biting today. Still, a peaceful hour.', 'info');
  return ok({ minutes: 60, caught });
}

export function activeEvent(s: GameState, x: number, z: number, radius = 60) {
  const wd = weekdayOf(s.time.minutes);
  const h = hourOf(s.time.minutes);
  return EVENTS.find((e) => e.weekday === wd && h >= e.startHour && h < e.endHour && dist(x, z, e.x, e.z) < radius) ?? null;
}

export function joinCampfire(s: GameState, x: number, z: number): Result<Timed> {
  const ev = activeEvent(s, x, z);
  if (!ev || ev.id !== 'campfire_night') {
    // own fire at a site with a fire ring
    const v = activeVehicle(s);
    const wood = itemsInVehicle(s, v.id).find((i) => defOf(i).features?.firewood);
    if (!wood) return fail('You need a firewood bundle for a campfire.');
    const camp = CAMPGROUNDS.find((c) => c.sites.some((st) => st.fireRing && dist(st.x, st.z, v.pose.x, v.pose.z) < 14));
    if (!camp) return fail('Campfires are only allowed in fire rings at campsites.');
    delete s.items[wood.uid];
    addMood(s, 'campfire', 'Evening by the campfire', 12, 8);
    return ok({ minutes: 90 });
  }
  const key = `${ev.id}:${dayOf(s.time.minutes)}`;
  if (!s.eventsVisited[key]) {
    s.eventsVisited[key] = s.time.minutes;
    journal(s, 'event', 'Joined Campfire Night at Pine Lake. Stories, songs and roasted marshmallows.');
  }
  addMood(s, 'campfire', 'Campfire Night with fellow travelers', 15, 10);
  return ok({ minutes: 90 });
}

export function visitMarket(s: GameState): void {
  const key = `farmers_market:${dayOf(s.time.minutes)}`;
  if (!s.eventsVisited[key]) {
    s.eventsVisited[key] = s.time.minutes;
    addMood(s, 'market', 'Browsed the farmers market', 6, 8);
    journal(s, 'event', 'Visited the Saturday Farmers Market in Mesa City.');
  }
}

export function lockerRent(s: GameState): Result {
  const cost = price(s, ECONOMY.lockerWeekly);
  if (s.locker && s.locker.paidUntilMin > s.time.minutes) return fail('Your locker is already paid up.');
  const paid = charge(s, cost, 'fees', 'Storage locker (1 week)');
  if (!paid.ok) return paid;
  s.locker = { paidUntilMin: s.time.minutes + 7 * 1440 };
  note(s, `Locker rented for a week (${money(cost)}). Rent renews weekly.`, 'money');
  return ok();
}

export function vehicleCapacityNote(s: GameState): string {
  const v = activeVehicle(s);
  return vdef(v).shortName;
}
