import { SHOPS, type StockEntry } from '../data/content';
import { itemDef } from '../data/items';
import { VEHICLES } from '../data/vehicles';
import type { ItemDef, VehicleId } from '../data/types';
import { ANCHOR_BY_ID, PARKING } from '../data/map';
import { charge, difficulty, earn, fail, journal, money, newItem, note, ok, price, type Result } from './core';
import { complete } from './objectives';
import { bestCompartment, canStore, LOCKER_LITERS, lockerUse, whyNoRoom } from './storage';
import type { GameState, ItemInstance, VehicleState } from './types';
import {
  activeVehicle, compartmentById, compartments, defOf, installedItems, itemKg, itemLiters, itemsInVehicle, mattressOn,
  overallCondition, vdef,
} from './vehicle';
import { computeWeight, type WeightStatus } from './weight';
import { dFromZ } from '../data/vehicles';
import { setupNewVehicle } from './newgame';

// Shops: buying with full storage + weight checks, selling, and the dealership.

export interface ShopLine {
  entry: StockEntry;
  def: ItemDef;
  price: number;
  condition: number;
  remaining: number | null;
}

export function shopPrice(s: GameState, shopId: string, entry: StockEntry): number {
  const shop = SHOPS[shopId];
  return price(s, itemDef(entry.item).price * shop.priceMul * (entry.priceMul ?? 1));
}

export function shopLines(s: GameState, shopId: string): ShopLine[] {
  const shop = SHOPS[shopId];
  return shop.stock.map((entry) => {
    const sold = s.usedSold[`${shopId}:${entry.item}`] ?? 0;
    return {
      entry, def: itemDef(entry.item), price: shopPrice(s, shopId, entry), condition: entry.condition ?? 1,
      remaining: entry.qty != null ? Math.max(0, entry.qty - sold) : null,
    };
  });
}

export interface PurchasePreview {
  ok: boolean;
  reason?: string;
  price: number;
  cashAfter: number;
  comp: string | null;
  compName?: string;
  /** Mattress too bulky to store: offer to install directly on this bed. */
  installBed?: string;
  oldMattress?: { uid: string; name: string; storedIn: string | null; tradeIn: number };
  weightBefore: number;
  weightAfter: number;
  payloadAfter: number;
  status: WeightStatus;
  warnings: string[];
}

function tempItem(s: GameState, defId: string, condition: number): ItemInstance {
  return newItem(s, defId, { kind: 'carried' }, { condition });
}

function dropTemp(s: GameState, inst: ItemInstance, counter: number) {
  delete s.items[inst.uid];
  s.uidCounter = counter;
}

export function previewPurchase(s: GameState, shopId: string, itemId: string, compOverride?: string): PurchasePreview {
  const v = activeVehicle(s);
  const line = shopLines(s, shopId).find((l) => l.entry.item === itemId);
  const before = computeWeight(s, v.id);
  const base: PurchasePreview = {
    ok: false, price: line?.price ?? 0, cashAfter: s.cash - (line?.price ?? 0), comp: null, weightBefore: before.total,
    weightAfter: before.total, payloadAfter: before.payloadLeft, status: before.status, warnings: [],
  };
  if (!line) return { ...base, reason: 'Not sold here.' };
  if (line.remaining === 0) return { ...base, reason: 'Sold out.' };
  if (s.cash < line.price) return { ...base, reason: `Not enough cash (${money(line.price)} needed, you have ${money(s.cash)}).` };
  const counter = s.uidCounter;
  const inst = tempItem(s, itemId, line.condition);
  const kg = itemKg(inst);
  let comp: string | null = null;
  let installBed: string | undefined;
  let oldMattress: PurchasePreview['oldMattress'];
  let d = vdef(v).shellD;
  if (compOverride) {
    const chk = canStore(s, v.id, compOverride, inst);
    if (!chk.ok) {
      dropTemp(s, inst, counter);
      return { ...base, reason: chk.reason };
    }
    comp = compOverride;
  } else comp = bestCompartment(s, v.id, inst);
  if (comp) d = compartmentById(s, v.id, comp)!.d;
  else {
    const mf = line.def.features?.mattress;
    if (mf) {
      const bed = installedItems(s, v.id).find((b) => b.where.kind === 'floor' && defOf(b).features?.bed?.mattressSize === mf.size);
      if (bed && bed.where.kind === 'floor') {
        installBed = bed.uid;
        d = dFromZ(vdef(v), bed.where.z);
        const old = mattressOn(s, bed.uid);
        if (old) {
          old.where = { kind: 'carried' };
          const oc = bestCompartment(s, v.id, old);
          old.where = { kind: 'mattress', vehicle: v.id, bed: bed.uid };
          oldMattress = { uid: old.uid, name: defOf(old).name, storedIn: oc, tradeIn: oc ? 0 : Math.round(defOf(old).price * 0.15 * old.condition) };
        }
      }
    }
  }
  if (!comp && !installBed) {
    const why = whyNoRoom(s, v.id, inst);
    dropTemp(s, inst, counter);
    return { ...base, reason: why };
  }
  dropTemp(s, inst, counter);
  const minus = oldMattress && !oldMattress.storedIn ? [oldMattress.uid] : [];
  const after = computeWeight(s, v.id, { extra: [{ label: line.def.name, cat: 'belongings', kg, d }], exclude: minus });
  const warnings: string[] = [];
  if (after.worstFraction > 0) warnings.push(`After this purchase: ${after.messages.join('; ')}.`);
  if (line.def.food?.perishable && comp && !compartmentById(s, v.id, comp)!.refrigerated) {
    warnings.push('No fridge space: this will spoil without refrigeration.');
  }
  return {
    ok: true, price: line.price, cashAfter: s.cash - line.price + (oldMattress?.tradeIn ?? 0), comp,
    compName: comp ? compartmentById(s, v.id, comp)!.name : undefined, installBed, oldMattress,
    weightBefore: before.total, weightAfter: after.total, payloadAfter: after.payloadLeft, status: after.status, warnings,
  };
}

export interface BuyOptions {
  comp?: string;
  /** Required when the purchase would exceed a weight rating. */
  confirmOverweight?: boolean;
}

export function buy(s: GameState, shopId: string, itemId: string, opts: BuyOptions = {}): Result<{ uid: string }> {
  const pv = previewPurchase(s, shopId, itemId, opts.comp);
  if (!pv.ok) return fail(pv.reason ?? 'Cannot buy that.');
  if ((pv.status === 'over' || pv.status === 'refuse') && !opts.confirmOverweight) {
    return fail(`This would overload your RV (${pv.warnings[0] ?? 'over a rating'}). Confirm to buy anyway.`);
  }
  const line = shopLines(s, shopId).find((l) => l.entry.item === itemId)!;
  const paid = charge(s, line.price, categoryFor(line.def), `${SHOPS[shopId].name}: ${line.def.name}`);
  if (!paid.ok) return paid;
  const v = activeVehicle(s);
  const inst = newItem(s, itemId, { kind: 'carried' }, { condition: line.condition });
  if (pv.comp) {
    const info = compartmentById(s, v.id, pv.comp)!;
    inst.where = { kind: 'stored', vehicle: v.id, comp: pv.comp };
    if (!info.secure) inst.secured = false;
  } else if (pv.installBed) {
    const old = mattressOn(s, pv.installBed);
    if (old && pv.oldMattress) {
      if (pv.oldMattress.storedIn) old.where = { kind: 'stored', vehicle: v.id, comp: pv.oldMattress.storedIn };
      else {
        delete s.items[old.uid];
        earn(s, pv.oldMattress.tradeIn, 'sale', `Trade-in: ${pv.oldMattress.name}`);
      }
    }
    inst.where = { kind: 'mattress', vehicle: v.id, bed: pv.installBed };
    note(s, `${line.def.name} installed on your bed.`, 'good');
  }
  if (line.entry.qty != null) s.usedSold[`${shopId}:${itemId}`] = (s.usedSold[`${shopId}:${itemId}`] ?? 0) + 1;
  if (line.def.category === 'grocery') complete(s, 'groceries');
  const upgrade = ['furniture', 'appliance', 'system', 'mattress', 'outdoor'].includes(line.def.category);
  if (upgrade && s.jobs.completed > 0) complete(s, 'upgrade');
  else if (upgrade) s.flags.boughtUpgradeEarly = true;
  return ok({ uid: inst.uid });
}

function categoryFor(def: ItemDef) {
  if (def.category === 'grocery') return 'groceries' as const;
  return 'equipment' as const;
}

export function sellValue(s: GameState, shopId: string, inst: ItemInstance): number {
  const shop = SHOPS[shopId];
  if (!shop.buys) return 0;
  const d = defOf(inst);
  if (d.sellable === false || inst.cargo) return 0;
  if (d.food) return 0;
  return Math.round(d.price * shop.buys * inst.condition);
}

export function sellableItems(s: GameState): ItemInstance[] {
  const v = activeVehicle(s);
  return itemsInVehicle(s, v.id).filter((i) => i.where.kind === 'stored' && !i.cargo && defOf(i).sellable !== false && !defOf(i).food);
}

export function sell(s: GameState, shopId: string, uid: string): Result<{ amount: number }> {
  const inst = s.items[uid];
  if (!inst) return fail('Item not found.');
  if (inst.where.kind !== 'stored') return fail('Uninstall it first (furnishing mode), then sell it from storage.');
  const val = sellValue(s, shopId, inst);
  if (val <= 0) return fail('The shop will not buy that.');
  // anything stored inside? stored items are never containers (only floor items have storage)
  delete s.items[uid];
  earn(s, val, 'sale', `Sold ${defOf(inst).name} to ${SHOPS[shopId].name}`);
  return ok({ amount: val });
}

// ── locker ──

export function toLocker(s: GameState, uid: string): Result {
  const inst = s.items[uid];
  if (!inst || inst.where.kind !== 'stored') return fail('Only stored items can go in the locker.');
  if (!s.locker || s.locker.paidUntilMin <= s.time.minutes) return fail('Rent the locker first.');
  if (inst.cargo) return fail('Delivery cargo must stay with you.');
  if (lockerUse(s) + itemLiters(inst) > LOCKER_LITERS) return fail('The locker is full.');
  inst.where = { kind: 'locker' };
  inst.secured = undefined;
  return ok();
}

export function fromLocker(s: GameState, uid: string): Result {
  const inst = s.items[uid];
  if (!inst || inst.where.kind !== 'locker') return fail('Not in the locker.');
  const v = activeVehicle(s);
  inst.where = { kind: 'carried' };
  const comp = bestCompartment(s, v.id, inst);
  if (!comp) {
    inst.where = { kind: 'locker' };
    return fail(whyNoRoom(s, v.id, inst));
  }
  const info = compartmentById(s, v.id, comp)!;
  inst.where = { kind: 'stored', vehicle: v.id, comp };
  if (!info.secure) inst.secured = false;
  return ok();
}

// ── dealership ──

export function tradeInValue(s: GameState, v: VehicleState = activeVehicle(s)): number {
  const d = vdef(v);
  const cond = overallCondition(s, v.id);
  let val = d.price * (0.32 + 0.43 * cond) * (0.85 + 0.15 * v.body);
  const defaultIds = new Set(d.defaults.map((x) => x.item));
  for (const it of installedItems(s, v.id)) if (!defaultIds.has(it.def)) val += defOf(it).price * 0.45 * it.condition;
  return Math.round(val / 50) * 50;
}

export function vehicleQuote(s: GameState, defId: VehicleId) {
  const p = Math.round(price(s, VEHICLES[defId].price) / 50) * 50;
  const t = tradeInValue(s);
  return { price: p, tradeIn: t, net: p - t };
}

export function buyVehicle(s: GameState, defId: VehicleId): Result {
  const old = activeVehicle(s);
  if (old.def === defId) return fail('You already own this model.');
  const q = vehicleQuote(s, defId);
  if (s.cash < q.net) return fail(`You need ${money(q.net)} after your trade-in (${money(q.tradeIn)}).`);
  if (q.net > 0) {
    const paid = charge(s, q.net, 'vehicle', `${VEHICLES[defId].name} (after ${money(q.tradeIn)} trade-in)`);
    if (!paid.ok) return paid;
  } else earn(s, -q.net, 'vehicle', `Trade-in difference for ${VEHICLES[defId].name}`);
  const lot = PARKING.find((p) => p.id === 'mc_lot')!;
  const nv = setupNewVehicle(s, defId, { x: lot.x, z: lot.z, heading: Math.PI });
  nv.fuel = Math.min(nv.fuel, VEHICLES[defId].tanks.fuel.liters * 0.5);
  // Move belongings (not the old vehicle's installed equipment) into the new RV.
  const overflow: string[] = [];
  for (const it of itemsInVehicle(s, old.id)) {
    if (it.where.kind !== 'stored') continue;
    it.where = { kind: 'carried' };
    const comp = bestCompartment(s, nv.id, it);
    if (comp) {
      const info = compartments(s, nv.id).find((c) => c.id === comp)!;
      it.where = { kind: 'stored', vehicle: nv.id, comp };
      it.secured = info.secure ? undefined : false;
    } else {
      it.where = { kind: 'locker' };
      overflow.push(defOf(it).name);
    }
  }
  if (overflow.length) {
    if (!s.locker || s.locker.paidUntilMin < s.time.minutes) s.locker = { paidUntilMin: s.time.minutes + 7 * 1440 };
    note(s, `${overflow.length} item(s) did not fit and went to your storage locker (first week free).`, 'warn');
  }
  for (const it of itemsInVehicle(s, old.id)) delete s.items[it.uid];
  s.vehicles = s.vehicles.filter((x) => x.id !== old.id);
  s.vehicleId = nv.id;
  s.reservation = null;
  const door = ANCHOR_BY_ID.mc_dealer_door;
  s.player.pos = { x: door.x, z: door.z + 4, yaw: 0 };
  s.player.mode = 'explore';
  journal(s, 'event', `Traded in the ${vdef(old).shortName} for a ${VEHICLES[defId].name}.`);
  note(s, `Your new ${VEHICLES[defId].shortName} is parked in the dealer lot.`, 'good');
  void difficulty;
  return ok();
}
