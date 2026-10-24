import { fail, ok, type Result } from './core';
import type { GameState, ItemInstance } from './types';
import {
  compartmentById, compartments, compartmentUse, defOf, itemKg, itemLiters, itemLongest, itemName, itemsInCompartment,
  type CompartmentInfo,
} from './vehicle';

// Physical storage rules: volume, weight and opening size per compartment.

export const LOCKER_LITERS = 3000;

function fmt(n: number): string {
  return n >= 10 ? Math.round(n).toString() : n.toFixed(1);
}

export function canStoreIn(s: GameState, vid: string, comp: CompartmentInfo, inst: ItemInstance): Result {
  if (comp.hostUid === inst.uid) return fail('An item cannot be stored inside itself.');
  const d = defOf(inst);
  if (comp.refrigerated && d.category !== 'grocery' && !inst.cargo?.refrigerated) {
    return fail(`Only food goes in the ${comp.name.toLowerCase()}.`);
  }
  if (inst.cargo?.refrigerated && !comp.refrigerated) return fail(`${itemName(inst)} must be kept refrigerated.`);
  const long = itemLongest(inst);
  if (long > comp.maxDim + 0.005) {
    return fail(`${itemName(inst)} (${long.toFixed(2)} m long) does not fit through the ${comp.name.toLowerCase()} opening (${comp.maxDim.toFixed(2)} m).`);
  }
  let { liters, kg } = compartmentUse(s, vid, comp.id);
  const w = inst.where;
  if (w.kind === 'stored' && w.vehicle === vid && w.comp === comp.id) {
    liters -= itemLiters(inst);
    kg -= itemKg(inst);
  }
  const L = itemLiters(inst);
  const K = itemKg(inst);
  if (liters + L > comp.liters + 0.01) {
    return fail(`Not enough room in ${comp.name}: needs ${fmt(L)} L, ${fmt(Math.max(0, comp.liters - liters))} L free.`);
  }
  if (kg + K > comp.maxKg + 0.01) {
    return fail(`${comp.name} weight limit: ${fmt(kg + K)} kg would exceed its ${comp.maxKg} kg rating.`);
  }
  return ok();
}

export function canStore(s: GameState, vid: string, compId: string, inst: ItemInstance): Result {
  const comp = compartmentById(s, vid, compId);
  if (!comp) return fail('That storage space no longer exists.');
  return canStoreIn(s, vid, comp, inst);
}

/** Preferred compartment order for an item (the player can always override). */
export function rankCompartments(s: GameState, vid: string, inst: ItemInstance): CompartmentInfo[] {
  const d = defOf(inst);
  const perishable = !!d.food?.perishable || !!inst.cargo?.refrigerated;
  const heavy = itemKg(inst) > 18;
  const score = (c: CompartmentInfo): number => {
    let sc = 0;
    if (perishable) sc += c.refrigerated ? 100 : 0;
    else if (c.refrigerated) sc -= 100;
    if (d.category === 'grocery' && c.hostUid && !c.refrigerated) sc += 30;
    if (c.secure) sc += 20;
    if (heavy && !c.high && c.exterior) sc += 15;
    if (heavy && c.high) sc -= 40;
    if (c.high) sc -= 10;
    if (inst.cargo && c.exterior && !c.high) sc += 12;
    if (c.id === 'cab') sc -= 5;
    return sc;
  };
  return compartments(s, vid).slice().sort((a, b) => score(b) - score(a));
}

export function bestCompartment(s: GameState, vid: string, inst: ItemInstance): string | null {
  for (const c of rankCompartments(s, vid, inst)) if (canStoreIn(s, vid, c, inst).ok) return c.id;
  return null;
}

/** Why an item fits nowhere (first meaningful reason). */
export function whyNoRoom(s: GameState, vid: string, inst: ItemInstance): string {
  const reasons = rankCompartments(s, vid, inst).map((c) => canStoreIn(s, vid, c, inst));
  const r = reasons.find((x) => !x.ok && !x.reason.startsWith('Only food'));
  return r && !r.ok ? r.reason : 'No storage space can hold it.';
}

export function moveToCompartment(s: GameState, uid: string, vid: string, compId: string): Result {
  const inst = s.items[uid];
  if (!inst) return fail('Item not found.');
  const chk = canStore(s, vid, compId, inst);
  if (!chk.ok) return chk;
  const comp = compartmentById(s, vid, compId)!;
  inst.where = { kind: 'stored', vehicle: vid, comp: compId };
  inst.secured = comp.secure ? undefined : false;
  return ok();
}

export function lockerUse(s: GameState): number {
  let L = 0;
  for (const uid in s.items) if (s.items[uid].where.kind === 'locker') L += itemLiters(s.items[uid]);
  return L;
}

export function lockerItems(s: GameState): ItemInstance[] {
  return Object.values(s.items).filter((i) => i.where.kind === 'locker');
}

export function looseUnsecured(s: GameState, vid: string): ItemInstance[] {
  const out: ItemInstance[] = [];
  for (const c of compartments(s, vid)) {
    if (c.secure) continue;
    for (const it of itemsInCompartment(s, vid, c.id)) if (!it.secured) out.push(it);
  }
  return out;
}

export function storageSummary(s: GameState, vid: string): { liters: number; used: number; kgUsed: number } {
  let liters = 0, used = 0, kgUsed = 0;
  for (const c of compartments(s, vid)) {
    const u = compartmentUse(s, vid, c.id);
    liters += c.liters;
    used += u.liters;
    kgUsed += u.kg;
  }
  return { liters, used, kgUsed };
}
