import { NPCS } from '../data/content';
import { CAMP } from '../data/config';
import { CAMPGROUND_BY_ID, type CampgroundDef, type SiteDef } from '../data/map';
import { charge, dayOf, fail, hourOf, journal, money, note, ok, price, weekdayOf, type Result } from './core';
import { dist } from './geo';
import { addMood } from './needs';
import { rngFor } from './rng';
import { siteOfVehicle, stayOf } from './places';
import { bestCompartment, looseUnsecured, whyNoRoom } from './storage';
import type { GameState } from './types';
import { activeVehicle, capacities, defOf, hasTool, itemName, vdef } from './vehicle';
import { computeWeight, type WeightReport } from './weight';

// Campgrounds, reservations, hookups and the pre-trip check.

export function npcSitesToday(s: GameState): Record<string, string> {
  const wd = weekdayOf(s.time.minutes);
  const out: Record<string, string> = {};
  for (const id in NPCS) {
    const stop = NPCS[id].week[wd];
    if (stop?.site) out[stop.site] = id;
  }
  return out;
}

const OCCUPANCY: Record<string, number> = { pine_cg: 0.35, mesa_resort: 0.4, coyote_lot: 0.34, redrock_flats: 0.15, hidden_site: 0 };

/** Sites taken by other campers today (deterministic per day). */
export function occupiedSites(s: GameState, campId: string): Record<string, string> {
  const camp = CAMPGROUND_BY_ID[campId];
  const out: Record<string, string> = {};
  const npc = npcSitesToday(s);
  const day = dayOf(s.time.minutes);
  const wd = weekdayOf(s.time.minutes);
  const rate = (OCCUPANCY[campId] ?? 0.3) + (wd >= 4 ? 0.15 : 0);
  const rng = rngFor(s.seed, 'occupancy', campId, day);
  const v = activeVehicle(s);
  const mine = siteOfVehicle(v);
  for (const site of camp.sites) {
    const r = rng();
    if (npc[site.id]) out[site.id] = NPCS[npc[site.id]].name;
    else if (r < rate) out[site.id] = 'camper';
    if (mine && mine.site.id === site.id) delete out[site.id];
    if (s.reservation && s.reservation.camp === campId && s.reservation.site === site.id) delete out[site.id];
  }
  return out;
}

export interface SiteOption {
  site: SiteDef;
  available: boolean;
  fits: boolean;
  reason?: string;
  price: number;
}

export function siteOptions(s: GameState, campId: string): SiteOption[] {
  const camp = CAMPGROUND_BY_ID[campId];
  const v = activeVehicle(s);
  const len = vdef(v).dims.length;
  const occ = occupiedSites(s, campId);
  return camp.sites.map((site) => {
    const fits = len <= site.maxLength + 1e-6;
    const taken = occ[site.id];
    const mineRes = s.reservation?.camp === campId && s.reservation.site === site.id;
    let reason: string | undefined;
    if (!fits) reason = `Max vehicle length ${site.maxLength} m (yours is ${len} m)`;
    else if (taken && !mineRes) reason = taken === 'camper' ? 'Occupied' : `Occupied by ${taken}`;
    return { site, available: fits && (!taken || mineRes), fits, reason, price: price(s, camp.pricePerNight) };
  });
}

export function checkoutMinFor(s: GameState, nights: number): number {
  const now = s.time.minutes;
  const day0 = Math.floor(now / 1440);
  const base = hourOf(now) < 6 ? day0 - 1 : day0;
  return (base + nights) * 1440 + 11 * 60;
}

export function reserve(s: GameState, campId: string, siteId: string, nights: number): Result {
  const camp = CAMPGROUND_BY_ID[campId];
  if (!camp || camp.free) return fail('This place does not take reservations.');
  nights = Math.max(1, Math.min(14, Math.round(nights)));
  const opt = siteOptions(s, campId).find((o) => o.site.id === siteId);
  if (!opt) return fail('Unknown site.');
  if (!opt.available) return fail(opt.reason ?? 'Site unavailable.');
  if (s.reservation && s.reservation.camp === campId && s.reservation.site === siteId) {
    const paid = charge(s, opt.price * nights, 'campsite', `${camp.name} site ${siteId}: +${nights} night(s)`);
    if (!paid.ok) return paid;
    s.reservation.checkoutMin += nights * 1440;
    s.reservation.nights += nights;
    note(s, `Extended your stay at site ${siteId} by ${nights} night(s).`, 'money');
    return ok();
  }
  const paid = charge(s, opt.price * nights, 'campsite', `${camp.name} site ${siteId} (${nights} night${nights > 1 ? 's' : ''})`);
  if (!paid.ok) return paid;
  s.reservation = { camp: campId, site: siteId, checkoutMin: checkoutMinFor(s, nights), nights };
  journal(s, 'event', `Reserved site ${siteId} at ${camp.name} for ${nights} night(s).`);
  note(s, `Site ${siteId} is yours. Drive in and park on the pad.`, 'good');
  return ok();
}

/** Called when the clock passes 11:00. */
export function checkoutTick(s: GameState): void {
  const r = s.reservation;
  if (!r || r.checkoutMin > s.time.minutes) return;
  const v = activeVehicle(s);
  const hit = siteOfVehicle(v);
  const camp = CAMPGROUND_BY_ID[r.camp];
  if (hit && hit.camp.id === r.camp && hit.site.id === r.site) {
    // Still here after check-out: the campground charges another night.
    const p = price(s, camp.pricePerNight);
    s.cash = Math.round((s.cash - p) * 100) / 100;
    s.tx.push({ t: s.time.minutes, amount: -p, category: 'campsite', label: `${camp.name}: stayed past check-out` });
    s.stats.today.spent += p;
    r.checkoutMin += 1440;
    r.nights += 1;
    note(s, `You stayed past check-out. ${camp.name} charged another night (${money(p)}).`, 'money');
  } else {
    s.reservation = null;
  }
}

export function inReservedSite(s: GameState): { camp: CampgroundDef; site: SiteDef } | null {
  const r = s.reservation;
  if (!r) return null;
  const v = activeVehicle(s);
  const hit = siteOfVehicle(v);
  if (hit && hit.camp.id === r.camp && hit.site.id === r.site && hit.inside) return hit;
  return null;
}

export type HookupKind = 'power' | 'water' | 'sewer';

const TOOL_FOR: Record<HookupKind, string> = { power: 'power_cord', water: 'water_hose', sewer: 'sewer_kit' };
const TOOL_NAME: Record<HookupKind, string> = { power: 'shore power cord', water: 'drinking-water hose', sewer: 'sewer hose kit' };

export function canConnect(s: GameState, kind: HookupKind): Result {
  const v = activeVehicle(s);
  if (v.hookups[kind]) return fail('Already connected.');
  const here = inReservedSite(s);
  if (!here) {
    const hit = siteOfVehicle(v);
    if (hit && !hit.camp.free) return fail('You need to reserve this site at the campground office first.');
    if (hit && !hit.inside) return fail('Park fully on the pad (straight, within the site) first.');
    return fail('Hookups are only available at a reserved campsite.');
  }
  const site = here.site;
  if (kind === 'power' && !site.power) return fail('This site has no power hookup.');
  if (kind === 'water' && !site.water) return fail('This site has no water hookup.');
  if (kind === 'sewer' && !site.sewer) return fail('This site has no sewer hookup.');
  if (!hasTool(s, v.id, TOOL_FOR[kind])) return fail(`You need a ${TOOL_NAME[kind]} in the RV.`);
  return ok();
}

export function connect(s: GameState, kind: HookupKind): Result {
  const chk = canConnect(s, kind);
  if (!chk.ok) return chk;
  const v = activeVehicle(s);
  v.hookups[kind] = true;
  if (kind === 'sewer') v.gray = 0;
  return ok();
}

export function disconnect(s: GameState, kind: HookupKind): void {
  activeVehicle(s).hookups[kind] = false;
}

export function canLevel(s: GameState): Result {
  const v = activeVehicle(s);
  if (v.levelled) return fail('Already level.');
  const hit = siteOfVehicle(v);
  const stay = stayOf(s, v);
  if (hit?.site.level || stay.kind === 'reserved') return fail('This pad is already level.');
  if (!hasTool(s, v.id, 'leveling_blocks')) return fail('You need leveling blocks.');
  return ok();
}

export function level(s: GameState): Result {
  const chk = canLevel(s);
  if (!chk.ok) return chk;
  activeVehicle(s).levelled = true;
  return ok();
}

export function setAwning(s: GameState, open: boolean): Result {
  const v = activeVehicle(s);
  if (!capacities(s, v.id).awning) return fail('This RV has no awning.');
  v.awning = open;
  if (open) addMood(s, 'awning', 'Shady patio', 2, 10);
  return ok();
}

// ── outdoor items ──

export function placeOutdoor(s: GameState, uid: string, x: number, z: number, rot: number): Result {
  const it = s.items[uid];
  if (!it || !defOf(it).features?.outdoor) return fail('That item cannot be set up outside.');
  const v = activeVehicle(s);
  if (dist(x, z, v.pose.x, v.pose.z) > 18) return fail('Set it up near your RV.');
  it.where = { kind: 'outdoor', x, z, rot };
  if (s.player.carrying?.kind === 'item' && s.player.carrying.uid === uid) s.player.carrying = null;
  return ok();
}

export function packOutdoor(s: GameState, uid: string): Result {
  const it = s.items[uid];
  if (!it) return fail('Item not found.');
  const v = activeVehicle(s);
  const comp = bestCompartment(s, v.id, it);
  if (!comp) return fail(whyNoRoom(s, v.id, it));
  it.where = { kind: 'stored', vehicle: v.id, comp };
  return ok();
}

export function outdoorItemsNear(s: GameState, r = 40) {
  const v = activeVehicle(s);
  return Object.values(s.items).filter((i) => i.where.kind === 'outdoor' && dist(i.where.x, i.where.z, v.pose.x, v.pose.z) < r);
}

// ── pre-trip ──

export interface PretripIssue {
  id: string;
  label: string;
  minutes: number;
  fixable: boolean;
  reason?: string;
}

export interface Pretrip {
  issues: PretripIssue[];
  weight: WeightReport;
  refuse: boolean;
}

export function pretrip(s: GameState): Pretrip {
  const v = activeVehicle(s);
  const issues: PretripIssue[] = [];
  if (v.hookups.power) issues.push({ id: 'power', label: 'Shore power cord is plugged in', minutes: 2, fixable: true });
  if (v.hookups.water) issues.push({ id: 'water', label: 'Water hose is connected', minutes: 2, fixable: true });
  if (v.hookups.sewer) issues.push({ id: 'sewer', label: 'Sewer hose is connected', minutes: 3, fixable: true });
  if (v.awning) issues.push({ id: 'awning', label: 'Awning is extended', minutes: 2, fixable: true });
  if (v.levelled) issues.push({ id: 'blocks', label: 'Leveling blocks are under the wheels', minutes: 3, fixable: true });
  if (v.generatorOn) issues.push({ id: 'generator', label: 'Generator is running', minutes: 1, fixable: true });
  for (const it of outdoorItemsNear(s)) {
    const comp = bestCompartment(s, v.id, it);
    issues.push({
      id: `out:${it.uid}`, label: `${itemName(it)} is still outside`, minutes: 1, fixable: !!comp,
      reason: comp ? undefined : whyNoRoom(s, v.id, it),
    });
  }
  const loose = looseUnsecured(s, v.id);
  if (loose.length) {
    const straps = hasTool(s, v.id, 'straps');
    issues.push({
      id: 'loose', label: `${loose.length} loose item${loose.length > 1 ? 's' : ''} not strapped down`, minutes: Math.min(10, loose.length),
      fixable: straps, reason: straps ? undefined : 'You need cargo straps to secure loose items (or move them into closed storage).',
    });
  }
  const weight = computeWeight(s, v.id);
  if (weight.status === 'over') {
    issues.push({ id: 'weight', label: `Overloaded: ${weight.messages.join('; ')}`, minutes: 0, fixable: false, reason: 'You can drive, but braking, handling and fuel use will suffer.' });
  }
  return { issues, weight, refuse: weight.status === 'refuse' };
}

/** Resolve all fixable pre-trip issues. Returns game minutes spent. */
export function packUp(s: GameState): { minutes: number; left: PretripIssue[] } {
  const v = activeVehicle(s);
  const p = pretrip(s);
  let minutes = 0;
  const left: PretripIssue[] = [];
  for (const iss of p.issues) {
    if (!iss.fixable) {
      left.push(iss);
      continue;
    }
    minutes += iss.minutes;
    if (iss.id === 'power' || iss.id === 'water' || iss.id === 'sewer') v.hookups[iss.id] = false;
    else if (iss.id === 'awning') v.awning = false;
    else if (iss.id === 'blocks') v.levelled = false;
    else if (iss.id === 'generator') v.generatorOn = false;
    else if (iss.id === 'loose') for (const it of looseUnsecured(s, v.id)) it.secured = true;
    else if (iss.id.startsWith('out:')) {
      const r = packOutdoor(s, iss.id.slice(4));
      if (!r.ok) left.push({ ...iss, fixable: false, reason: r.reason });
    }
  }
  return { minutes, left };
}

export function sleepModifier(s: GameState): { mul: number; reasons: string[] } {
  const v = activeVehicle(s);
  const stay = stayOf(s, v);
  const reasons: string[] = [];
  let mul = 1;
  if (stay.camp?.noisy) {
    mul *= CAMP.noisySleep;
    reasons.push('Idling trucks all night');
  }
  if (stay.kind === 'town' || stay.kind === 'unpaid_site') {
    mul *= CAMP.streetSleep;
    reasons.push(stay.kind === 'town' ? 'Street parking: noisy and nervous' : 'Worried about being asked to leave');
  }
  const hit = siteOfVehicle(v);
  const levelGround = (hit?.site.level ?? false) || stay.kind === 'reserved' || stay.kind === 'overnight_lot' || stay.kind === 'town';
  if (!levelGround && !v.levelled) {
    mul *= CAMP.unlevelSleep;
    reasons.push('Sleeping on a slope');
  }
  if (capacities(s, v.id).fanW > 0 && stay.camp?.place !== 'pl_camp') mul *= 1.05;
  return { mul, reasons };
}
