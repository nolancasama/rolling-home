import { SHOPS } from '../data/content';
import { itemDef } from '../data/items';
import { COVERINGS, MATERIALS, materialDef } from '../data/materials';
import type { Finish, ItemConfig, SlotKind, SurfaceKind, WindowTreatment } from '../data/types';
import { charge, earn, fail, journal, money, newItem, ok, type Result } from './core';
import { normalizeConfig } from './families';
import { coveringArea, surfaceGeometry } from './finishes';
import { checkLayout, doorFitIssue, layoutOf, setItemState, type PlacementIssue } from './furnish';
import { vehicleAnchors } from './places';
import { bestCompartment, canStore, storageSummary, whyNoRoom } from './storage';
import type { GameState, ItemInstance, LightSettings } from './types';
import { powerStatus, setLight as changeLight } from './utilities';
import { defOf, itemName, itemsInCompartment, mattressOn, slotUse, vdef, vehicleById } from './vehicle';
import { computeWeight, type WeightReport } from './weight';

export interface Draft { vid: string; base: GameState; s: GameState; undo: string[]; redo: string[] }
export type Place = { kind?: 'floor'; x: number; z: number; rot: number; y?: number } | { kind?: 'slot'; slot: SlotKind };
export type Removal = 'store' | 'sell' | 'discard';
export type FinishTarget = { surface: string } | { uid: string; slot: string } | { window: string; layer: 'fabric' | 'fabric2' | 'valance' };
const copy = <T>(value: T): T => structuredClone(value);
const snapshot = (s: GameState) => JSON.stringify({ items: s.items, vehicles: s.vehicles, uidCounter: s.uidCounter });
function restore(d: Draft, json: string): void { Object.assign(d.s, JSON.parse(json)); }
function push(stack: string[], value: string): void { stack.push(value); if (stack.length > 200) stack.shift(); }

export function begin(s: GameState, vid: string): Draft {
  vehicleById(s, vid);
  return { vid, base: copy(s), s: copy(s), undo: [], redo: [] };
}

/** One reversible edit, including its UID allocations. Failures never leave partial changes. */
export function edit<T extends object>(d: Draft, action: () => Result<T>): Result<T> {
  const before = snapshot(d.s);
  try {
    const r = action();
    if (!r.ok) restore(d, before);
    else { push(d.undo, before); d.redo.length = 0; }
    return r;
  } catch (error) {
    restore(d, before);
    return fail(error instanceof Error ? error.message : 'Invalid design edit.');
  }
}
export function undo(d: Draft): Result {
  const prev = d.undo.pop(); if (prev === undefined) return fail('Nothing to undo.');
  push(d.redo, snapshot(d.s)); restore(d, prev); return ok();
}
export function redo(d: Draft): Result {
  const next = d.redo.pop(); if (next === undefined) return fail('Nothing to redo.');
  push(d.undo, snapshot(d.s)); restore(d, next); return ok();
}

function vehicleItem(d: Draft, uid: string): ItemInstance | undefined {
  const it = d.s.items[uid];
  return it && 'vehicle' in it.where && it.where.vehicle === d.vid ? it : undefined;
}
const installed = (it: ItemInstance) => ['floor', 'slot', 'mattress'].includes(it.where.kind);
function validateTouched(d: Draft, uids: string[]): Result {
  const vd = vdef(vehicleById(d.s, d.vid));
  const layout = layoutOf(d.s, d.vid), check = checkLayout(vd, layout, d.s, d.vid);
  for (const uid of uids) {
    const it = d.s.items[uid];
    if (it.where.kind === 'floor') {
      if (![it.where.x, it.where.z, it.where.rot, it.where.y ?? 0].every(Number.isFinite) || !Number.isInteger(it.where.rot)) return fail('Placement coordinates must be finite and rotation a quarter turn.');
      const issue = check.issues[uid]?.find(i => i.severity === 'block');
      if (issue) return fail(issue.text);
    } else if (it.where.kind === 'slot') {
      const slot = defOf(it).slot;
      if (!slot || slot.kind !== it.where.slot) return fail('That component does not fit this system slot.');
      const use = slotUse(d.s, d.vid, slot.kind);
      if (use.used > use.capacity + 1e-6) return fail(`Not enough ${slot.kind} space: capacity ${use.capacity}, needs ${use.used}.`);
    }
  }
  return ok();
}
function place(d: Draft, it: ItemInstance, p: Place): Result {
  if ('slot' in p) {
    if (!defOf(it).slot || defOf(it).slot!.kind !== p.slot) return fail('That component does not fit this system slot.');
    it.where = { kind: 'slot', vehicle: d.vid, slot: p.slot };
  } else {
    if (!defOf(it).floor) return fail('That item cannot be placed on the floor plan.');
    it.where = { kind: 'floor', vehicle: d.vid, x: p.x, z: p.z, rot: ((p.rot % 4) + 4) % 4, ...(p.y === undefined ? {} : { y: p.y }) };
  }
  return validateTouched(d, [it.uid]);
}
export function addFromCatalog(d: Draft, defId: string, p: Place, opts: Pick<ItemInstance, 'config' | 'finish' | 'state' | 'light'> = {}): Result<{ uid: string }> {
  return edit(d, () => {
    const def = itemDef(defId), vd = vdef(vehicleById(d.s, d.vid));
    const it = newItem(d.s, defId, { kind: 'carried' }, copy(opts));
    if (def.family) it.config = normalizeConfig(def, opts.config, vd.interior.ceilingY - vd.interior.floorY);
    if (opts.state && !def.floor?.states?.some(st => st.id === opts.state)) return fail('That state is not available.');
    const door = doorFitIssue(vd, defOf(it), d.s.gameType === 'creative' && !!d.s.creativeRelaxed);
    if (door?.severity === 'block') return fail(door.text);
    const r = place(d, it, p); if (!r.ok) return r;
    for (const [slot, finish] of Object.entries(opts.finish ?? {})) { const r = finishItem(d, { uid: it.uid, slot }, finish); if (!r.ok) return r; }
    if (opts.light) { const r = changeLight(d.s, d.vid, it.uid, opts.light); if (!r.ok) return r; }
    return ok({ uid: it.uid });
  });
}
export function placeOwned(d: Draft, uid: string, p: Place): Result {
  return edit(d, () => {
    const it = vehicleItem(d, uid);
    if (!it || it.where.kind !== 'stored') return fail('The item must be in this vehicle’s storage.');
    return place(d, it, p);
  });
}
export function moveItems(d: Draft, moves: { uid: string; x: number; z: number; rot?: number; y?: number }[]): Result {
  return edit(d, () => {
    if (!moves.length || new Set(moves.map(m => m.uid)).size !== moves.length) return fail('Choose distinct installed items to move.');
    for (const m of moves) {
      const it = vehicleItem(d, m.uid);
      if (!it || it.where.kind !== 'floor') return fail('That item is not installed on this floor plan.');
      Object.assign(it.where, { x: m.x, z: m.z }, m.rot === undefined ? {} : { rot: ((m.rot % 4) + 4) % 4 }, m.y === undefined ? {} : { y: m.y });
    }
    return validateTouched(d, moves.map(m => m.uid));
  });
}
export function rotate(d: Draft, uid: string, dir = 1): Result {
  const it = vehicleItem(d, uid);
  if (!it || it.where.kind !== 'floor') return fail('That item is not installed on this floor plan.');
  return moveItems(d, [{ uid, x: it.where.x, z: it.where.z, rot: it.where.rot + dir }]);
}

/** Internal removal for a larger transaction (blueprint apply). */
export function removeItem(d: Draft, uid: string): Result {
  const it = vehicleItem(d, uid);
  if (!it || !installed(it)) return fail('That item is not installed in this vehicle.');
  if (defOf(it).features?.toilet?.kind === 'cassette' && vehicleById(d.s, d.vid).black > 0.5) return fail('Empty the toilet cassette at a dump station first.');
  const children = [...itemsInCompartment(d.s, d.vid, `item:${uid}`)];
  const mattress = mattressOn(d.s, uid); if (mattress) children.push(mattress);
  it.where = { kind: 'removed', vehicle: d.vid, sell: true };
  for (const child of children) {
    child.where = { kind: 'carried' };
    const comp = bestCompartment(d.s, d.vid, child);
    if (!comp) return fail(`No room for ${itemName(child)} from inside ${itemName(it)}: ${whyNoRoom(d.s, d.vid, child)}`);
    child.where = { kind: 'stored', vehicle: d.vid, comp };
  }
  if (!d.base.items[uid]) { delete d.s.items[uid]; return ok(); }
  const comp = bestCompartment(d.s, d.vid, it);
  if (comp) it.where = { kind: 'stored', vehicle: d.vid, comp };
  return ok();
}
export function remove(d: Draft, uid: string): Result { return edit(d, () => removeItem(d, uid)); }
export function setRemoval(d: Draft, uid: string, disposition: Removal): Result {
  return edit(d, () => {
    const it = vehicleItem(d, uid), base = d.base.items[uid];
    if (!it || !base || installed(it)) return fail('That owned item has not been removed.');
    if (!['store', 'sell', 'discard'].includes(disposition)) return fail('Choose store, sell or discard.');
    if (disposition === 'store') {
      const comp = bestCompartment(d.s, d.vid, it);
      if (!comp) return fail(`No storage space for ${itemName(it)}: ${whyNoRoom(d.s, d.vid, it)}`);
      it.where = { kind: 'stored', vehicle: d.vid, comp };
    } else it.where = { kind: 'removed', vehicle: d.vid, sell: disposition === 'sell' };
    return ok();
  });
}

export function validFinish(f: Finish, kinds?: SurfaceKind[]): boolean {
  const mat = f && MATERIALS[f.mat];
  return !!mat && (!kinds || kinds.some(k => mat.surfaces.includes(k))) &&
    [f.scale, f.plankW, f.plankL].every(n => n === undefined || Number.isFinite(n) && n > 0) &&
    (f.rot === undefined || f.rot === 0 || f.rot === 90) &&
    (f.roughness === undefined || Number.isFinite(f.roughness) && f.roughness >= 0 && f.roughness <= 1) &&
    (f.offset === undefined || Array.isArray(f.offset) && f.offset.length === 2 && f.offset.every(Number.isFinite));
}
function finishItem(d: Draft, target: FinishTarget, finish: Finish): Result {
  const v = vehicleById(d.s, d.vid), vd = vdef(v);
  if ('surface' in target) {
    const surface = vd.interior.surfaces.find(s => s.id === target.surface);
    if (!surface || !validFinish(finish, [surface.kind])) return fail('Invalid finish for that surface.');
    v.custom.surfaces[target.surface] = copy(finish);
  } else if ('uid' in target) {
    const it = vehicleItem(d, target.uid), slot = it && defOf(it).slots?.find(s => s.id === target.slot);
    if (!it || !slot || !validFinish(finish, slot.surfaces)) return fail('Invalid finish for that item slot.');
    (it.finish ??= {})[target.slot] = copy(finish);
  } else {
    const t = v.custom.windows[target.window];
    if (!t || !['fabric', 'fabric2', 'valance'].includes(target.layer) || !validFinish(finish, ['window'])) return fail('Invalid window finish.');
    t[target.layer] = copy(finish);
  }
  return ok();
}
export function setFinish(d: Draft, target: FinishTarget, finish: Finish): Result { return edit(d, () => finishItem(d, target, finish)); }
export function validTreatment(t: WindowTreatment): boolean {
  return !!t && !!COVERINGS[t.type] && validFinish(t.fabric, ['window']) &&
    (!t.fabric2 || validFinish(t.fabric2, ['window'])) && (!t.valance || validFinish(t.valance, ['window'])) &&
    ['white', 'black', 'brass', 'chrome', 'wood'].includes(t.hardware) && ['inside', 'outside'].includes(t.mount) &&
    Number.isFinite(t.open) && t.open >= 0 && t.open <= 1 &&
    (t.layer === undefined || ['day', 'night'].includes(t.layer)) && (t.length === undefined || ['sill', 'long'].includes(t.length));
}
export function setWindow(d: Draft, windowId: string, treatment: WindowTreatment): Result {
  return edit(d, () => {
    const v = vehicleById(d.s, d.vid), win = vdef(v).interior.windows.find(w => w.id === windowId && !w.door);
    if (!win || !validTreatment(treatment)) return fail('Invalid window treatment.');
    v.custom.windows[windowId] = copy(treatment); return ok();
  });
}
export function setLight(d: Draft, uid: string, settings: Partial<LightSettings>): Result { return edit(d, () => changeLight(d.s, d.vid, uid, settings)); }
export function setState(d: Draft, uid: string, state: string): Result {
  return edit(d, () => { const r = setItemState(d.s, d.vid, uid, state); return r.ok ? validateTouched(d, [uid]) : r; });
}
export function setConfig(d: Draft, uid: string, config: ItemConfig): Result {
  return edit(d, () => {
    const it = vehicleItem(d, uid);
    if (!it || d.base.items[uid]) return fail('Only unpurchased items can be configured.');
    const def = itemDef(it.def), vd = vdef(vehicleById(d.s, d.vid));
    if (!def.family) return fail('That item is not configurable.');
    it.config = normalizeConfig(def, config, vd.interior.ceilingY - vd.interior.floorY);
    const door = doorFitIssue(vd, defOf(it), d.s.gameType === 'creative' && !!d.s.creativeRelaxed);
    return door?.severity === 'block' ? fail(door.text) : validateTouched(d, [uid]);
  });
}
export function swapMattress(d: Draft, bedUid: string, mattressDefOrUid: string): Result {
  return edit(d, () => {
    const bed = vehicleItem(d, bedUid), bf = bed && defOf(bed).features?.bed;
    if (!bed || bed.where.kind !== 'floor' || !bf?.usesMattress) return fail('That bed does not take a mattress.');
    let mat = vehicleItem(d, mattressDefOrUid);
    if (mat && mat.where.kind !== 'stored') return fail('The mattress must be in this vehicle’s storage.');
    if (!mat) mat = newItem(d.s, mattressDefOrUid, { kind: 'carried' });
    const mf = defOf(mat).features?.mattress;
    if (!mf || mf.size !== bf.mattressSize) return fail(`This bed takes a ${bf.mattressSize}-size mattress.`);
    const old = mattressOn(d.s, bedUid);
    mat.where = { kind: 'mattress', vehicle: d.vid, bed: bedUid };
    if (old) { const r = removeItem(d, old.uid); if (!r.ok) return r; }
    return ok();
  });
}

export interface RenovationContext { atShop: boolean; atService: boolean }
export function renovationContext(s: GameState, vid = s.vehicleId): RenovationContext {
  const v = vehicleById(s, vid);
  const atShop = vehicleAnchors(v, 'shop').some(a => !!a.ref && SHOPS[a.ref]?.kind === 'rv');
  return { atShop, atService: atShop || vehicleAnchors(v, 'mechanic').length > 0 };
}
export interface RenovationLine { kind: 'item' | 'install' | 'remove' | 'surface' | 'refinish' | 'covering' | 'delivery' | 'labor' | 'sale'; label: string; amount: number; minutes: number; ref: string }
export interface RenovationIssue { code: string; text: string; severity: PlacementIssue['severity']; uid?: string; surface?: string }
export interface RenovationSummary {
  lines: RenovationLine[]; goods: number; labor: number; delivery: number; sales: number; total: number;
  minutes: number; diyMinutes: number; proMinutes: number; proCost: number;
  weightBefore: WeightReport; weightAfter: WeightReport;
  storageBefore: ReturnType<typeof storageSummary>; storageAfter: ReturnType<typeof storageSummary>;
  nightLoadBefore: number; nightLoadAfter: number; issues: RenovationIssue[];
  removed: { uid: string; name: string; disposition: Removal; value: number }[];
  changed: boolean; canCommit: boolean; reason?: string;
}
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const cents = (n: number) => Math.round(n * 100) / 100 || 0;
function category(it: ItemInstance): string { return defOf(it).family?.id === 'cabinet' ? 'cabinet' : defOf(it).category; }
function installMinutes(it: ItemInstance): number {
  const def = defOf(it);
  if (def.floor?.plumbing) return 120;
  if (def.floor?.propane) return 60;
  return ({ cabinet: 35, appliance: 45, fixture: 15, system: 40, mattress: 2, furniture: 10 } as Record<string, number>)[category(it)] ?? 0;
}
const laborCategory = (it: ItemInstance) => ['cabinet', 'appliance', 'fixture', 'system'].includes(category(it));
function slotArea(it: ItemInstance, slot: string): number {
  const def = defOf(it), [w, depth] = def.floor?.footprint ?? def.dims, h = def.floor?.height ?? def.dims[2];
  if (slot === 'upholstery' || def.slots?.find(s => s.id === slot)?.surfaces.includes('upholstery')) return 2 * (w * depth + w * h) * 0.6;
  if (slot === 'fronts' || slot === 'front') return w * h;
  if (slot === 'counter' || slot === 'top') return w * depth;
  return 2 * (w * h + depth * h);
}
function handleCount(it: ItemInstance): number {
  const def = itemDef(it.def), c = normalizeConfig(def, it.config);
  const front = c.front ?? 'doors';
  return (front === 'open' || front === 'drawers' ? 0 : c.doors ?? ((c.w ?? 0.6) <= 0.5 ? 1 : def.family?.type === 'upper' ? Math.ceil((c.w ?? 0.8) / 0.5) : 2)) +
    (front === 'drawers' || front === 'mixed' ? c.drawers ?? 4 : 0);
}
function nightLoad(s: GameState, vid: string): number {
  const preview = copy(s); preview.time.minutes = Math.floor(s.time.minutes / 1440) * 1440 + 22 * 60;
  const v = vehicleById(preview, vid); v.hookups.power = false; v.generatorOn = false;
  return powerStatus(preview, v, { occupied: true }).loadW;
}

export function summary(d: Draft, ctx: RenovationContext & { pro: boolean }): RenovationSummary {
  const lines: RenovationLine[] = [], removed: RenovationSummary['removed'] = [], issues: RenovationIssue[] = [];
  const vd = vdef(vehicleById(d.s, d.vid)), v = vehicleById(d.s, d.vid), bv = vehicleById(d.base, d.vid);
  const add = (kind: RenovationLine['kind'], label: string, amount: number, minutes: number, ref: string) => lines.push({ kind, label, amount: cents(amount), minutes, ref });
  for (const it of Object.values(d.s.items)) {
    if (!('vehicle' in it.where) || it.where.vehicle !== d.vid) continue;
    const base = d.base.items[it.uid];
    if (!base && it.where.kind !== 'removed') {
      add('item', itemName(it), defOf(it).price, 0, it.uid);
      if (installed(it)) add('install', `Install ${itemName(it)}`, 0, installMinutes(it), it.uid);
    } else if (base && installed(it)) {
      const moved = !same(base.where, it.where);
      if (moved && laborCategory(it)) add('install', `Install / relocate ${itemName(it)}`, 0, installMinutes(it), it.uid);
      if (moved && it.where.kind === 'mattress') add('install', `Fit ${itemName(it)}`, 0, 2, it.uid);
    }
    if (base && (installed(base) && !installed(it) || it.where.kind === 'removed')) {
      const disposition: Removal = it.where.kind === 'removed' ? it.where.sell ? 'sell' : 'discard' : 'store';
      const value = Math.round(defOf(base).price * 0.3 * base.condition);
      removed.push({ uid: it.uid, name: itemName(it), disposition, value });
      if (installed(base) && laborCategory(base)) add('remove', `Remove ${itemName(it)}`, 0, installMinutes(base) * 0.5, it.uid);
      if (disposition === 'sell') add('sale', `Sell ${itemName(it)}`, -value, 0, it.uid);
    }
    if (it.where.kind === 'removed') continue;
    for (const slot of defOf(it).slots ?? []) {
      const initial = base?.finish?.[slot.id] ?? slot.default, finish = it.finish?.[slot.id] ?? slot.default;
      if (same(initial, finish)) continue;
      const area = slotArea(it, slot.id), handles = handleCount(it);
      add('refinish', `${itemName(it)}: ${slot.label}`, slot.id === 'handles' ? handles * 6 : area * materialDef(finish.mat).pricePerM2, slot.id === 'handles' ? handles * 2 : area * 40, it.uid);
    }
  }
  for (const surface of vd.interior.surfaces) {
    const finish = v.custom.surfaces[surface.id] ?? surface.factory;
    if (same(finish, bv.custom.surfaces[surface.id] ?? surface.factory)) continue;
    const area = surfaceGeometry(vd, surface).area, mat = materialDef(finish.mat);
    add('surface', surface.name, area * mat.pricePerM2, area * mat.laborPerM2, surface.id);
  }
  for (const window of vd.interior.windows.filter(w => !w.door)) {
    const t = v.custom.windows[window.id], initial = bv.custom.windows[window.id];
    if (!t) continue;
    const physical = (t: WindowTreatment | undefined) => t && { ...t, open: undefined, layer: undefined };
    if (same(physical(t), physical(initial))) continue;
    const spec = COVERINGS[t.type], span = window.a1 - window.a0;
    add('covering', `${window.id}: ${spec.name}`, spec.basePrice + spec.pricePerM2 * coveringArea(window, t) + (t.valance ? 25 + 15 * span : 0), spec.laborMin + (t.valance ? 10 : 0), window.id);
  }
  const layout = checkLayout(vd, layoutOf(d.s, d.vid), d.s, d.vid);
  for (const [uid, list] of Object.entries(layout.issues)) for (const issue of list) issues.push({ ...issue, uid });
  issues.push(...layout.general);
  if (layout.cabBlocked) issues.push({ code: 'blocked', severity: 'block', text: 'The path to the driver’s seat is blocked.' });
  for (const it of Object.values(d.s.items)) {
    if (!('vehicle' in it.where) || it.where.vehicle !== d.vid) continue;
    if (it.where.kind === 'stored') { const r = canStore(d.s, d.vid, it.where.comp, it); if (!r.ok) issues.push({ code: 'storage', severity: 'block', text: r.reason, uid: it.uid }); }
    if (it.where.kind === 'slot') { const use = slotUse(d.s, d.vid, it.where.slot); if (use.used > use.capacity) issues.push({ code: 'slot', severity: 'block', text: `Not enough ${it.where.slot} space.`, uid: it.uid }); }
    if (!d.base.items[it.uid] && installed(it)) { const door = doorFitIssue(vd, defOf(it), d.s.gameType === 'creative' && !!d.s.creativeRelaxed); if (door) issues.push({ ...door, uid: it.uid }); }
  }
  const weightBefore = computeWeight(d.base, d.vid), weightAfter = computeWeight(d.s, d.vid);
  for (const text of weightAfter.messages) issues.push({ code: 'weight', text, severity: 'warn' });
  const goods = cents(lines.filter(l => ['item', 'surface', 'refinish', 'covering'].includes(l.kind)).reduce((n, l) => n + l.amount, 0));
  const sales = cents(-lines.filter(l => l.kind === 'sale').reduce((n, l) => n + l.amount, 0));
  const diyMinutes = lines.reduce((n, l) => n + l.minutes, 0), proMinutes = diyMinutes * 0.35, proCost = cents(diyMinutes / 60 * 70);
  const delivery = goods > 0 && !ctx.atShop ? cents(Math.max(15, goods * 0.08)) : 0, labor = ctx.pro ? proCost : 0;
  if (delivery) add('delivery', 'Delivery', delivery, 0, d.vid);
  if (ctx.pro) add('labor', 'Professional installation', proCost, 0, d.vid);
  const creative = d.s.gameType === 'creative', total = creative ? 0 : cents(goods + labor + delivery - sales), minutes = creative ? 0 : ctx.pro ? proMinutes : diyMinutes;
  const reason = issues.find(i => i.severity === 'block')?.text ?? (ctx.pro && !ctx.atService ? 'Professional installation requires a mechanic or RV supply shop.' : !creative && d.s.cash < total - 1e-6 ? `Not enough cash: ${money(total)} needed, you have ${money(d.s.cash)}.` : undefined);
  return { lines, goods, labor, delivery, sales, total, minutes, diyMinutes, proMinutes, proCost, weightBefore, weightAfter,
    storageBefore: storageSummary(d.base, d.vid), storageAfter: storageSummary(d.s, d.vid), nightLoadBefore: nightLoad(d.base, d.vid), nightLoadAfter: nightLoad(d.s, d.vid),
    issues, removed, changed: snapshot(d.base) !== snapshot(d.s), canCommit: !reason, reason };
}

export function commit(real: GameState, d: Draft, choice: { pro: boolean }): Result<{ cost: number; minutes: number; activity: 'labor' | 'idle' }> {
  if (snapshot(real) !== snapshot(d.base)) return fail('The vehicle or inventory changed since this design began. Begin a new design.');
  const reviewDraft = { ...d, s: { ...d.s, cash: real.cash, gameType: real.gameType } };
  const review = summary(reviewDraft, { ...renovationContext(real, d.vid), ...choice });
  if (!review.canCommit) return fail(review.reason!);
  const next = copy(real);
  next.items = copy(d.s.items); next.vehicles = copy(d.s.vehicles); next.uidCounter = d.s.uidCounter;
  for (const [uid, it] of Object.entries(next.items)) if (it.where.kind === 'removed') delete next.items[uid];
  const label = `Renovation: ${review.lines.filter(l => !['sale', 'delivery', 'labor'].includes(l.kind)).slice(0, 3).map(l => l.label).join(', ') || 'layout changes'}`;
  if (next.gameType !== 'creative') earn(next, review.sales, 'sale', 'Renovation sales');
  const paid = charge(next, next.gameType === 'creative' ? 0 : cents(review.goods + review.delivery + review.labor), 'equipment', label);
  if (!paid.ok) return paid;
  journal(next, 'event', `${label}. ${money(review.total)}, ${Math.round(review.minutes)} min.`);
  Object.assign(real, next);
  return ok({ cost: review.total, minutes: review.minutes, activity: choice.pro ? 'idle' : 'labor' });
}

export { applyBlueprint } from './blueprints';
