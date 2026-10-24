import type { ItemDef, Rect, VehicleDef } from '../data/types';
import { fail, ok, type Result } from './core';
import { bestCompartment, whyNoRoom } from './storage';
import type { GameState, ItemInstance } from './types';
import {
  capacities, compartmentById, defOf, floorItems, itemName, itemsInCompartment, mattressOn, slotUse, vdef, vehicleById,
} from './vehicle';

// Interior layout validation on the vehicle floor plan (vehicle-local meters,
// x across, z along). Rotations are quarter turns: rot 0 faces +Z (forward),
// 1 faces +X, 2 faces -Z, 3 faces -X.

const EPS = 0.004;
export const BODY_RADIUS = 0.2;

export interface LayoutItem {
  uid: string;
  def: string;
  x: number;
  z: number;
  rot: number;
}

export function footprint(def: ItemDef, x: number, z: number, rot: number): Rect {
  const [w, d] = def.floor!.footprint;
  const sx = rot % 2 === 0 ? w : d;
  const sz = rot % 2 === 0 ? d : w;
  return { x0: x - sx / 2, x1: x + sx / 2, z0: z - sz / 2, z1: z + sz / 2 };
}

export function facing(rot: number): [number, number] {
  return [[0, 1], [1, 0], [0, -1], [-1, 0]][((rot % 4) + 4) % 4] as [number, number];
}

export function accessZone(def: ItemDef, x: number, z: number, rot: number): Rect | null {
  const acc = def.floor?.access;
  if (!acc) return null;
  const fp = footprint(def, x, z, rot);
  const [aw, ad] = acc;
  const [fx, fz] = facing(rot);
  if (fz === 1) return { x0: x - aw / 2, x1: x + aw / 2, z0: fp.z1, z1: fp.z1 + ad };
  if (fz === -1) return { x0: x - aw / 2, x1: x + aw / 2, z0: fp.z0 - ad, z1: fp.z0 };
  if (fx === 1) return { x0: fp.x1, x1: fp.x1 + ad, z0: z - aw / 2, z1: z + aw / 2 };
  return { x0: fp.x0 - ad, x1: fp.x0, z0: z - aw / 2, z1: z + aw / 2 };
}

/** Point in front of the item where you stand to use it. */
export function usePoint(def: ItemDef, x: number, z: number, rot: number): [number, number] {
  const a = accessZone(def, x, z, rot);
  if (a) return [(a.x0 + a.x1) / 2, (a.z0 + a.z1) / 2];
  return [x, z];
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 - EPS && a.x1 > b.x0 + EPS && a.z0 < b.z1 - EPS && a.z1 > b.z0 + EPS;
}

export function inside(a: Rect, outer: Rect): boolean {
  return a.x0 >= outer.x0 - EPS && a.x1 <= outer.x1 + EPS && a.z0 >= outer.z0 - EPS && a.z1 <= outer.z1 + EPS;
}

export interface PlacementIssue {
  code: 'outside' | 'overlap' | 'door' | 'access' | 'blocked' | 'plumbing' | 'blacktank';
  text: string;
}

export function layoutOf(s: GameState, vid: string): LayoutItem[] {
  return floorItems(s, vid).map((it) => {
    const w = it.where as Extract<ItemInstance['where'], { kind: 'floor' }>;
    return { uid: it.uid, def: it.def, x: w.x, z: w.z, rot: w.rot };
  });
}

function defs(li: LayoutItem): ItemDef {
  return defOf({ def: li.def } as ItemInstance);
}

/** Checks one item against the floor plan and the rest of the layout (no path check). */
export function staticIssues(vd: VehicleDef, layout: LayoutItem[], item: LayoutItem): PlacementIssue[] {
  const out: PlacementIssue[] = [];
  const d = defs(item);
  const fp = footprint(d, item.x, item.z, item.rot);
  const flat = !!d.floor?.flat;
  const living = vd.interior.living;
  if (!inside(fp, living)) out.push({ code: 'outside', text: 'Must sit inside the living area (not the cab or outside the walls).' });
  if (d.floor?.plumbing && !vd.interior.plumbing.some((z) => inside(fp, z))) {
    out.push({ code: 'plumbing', text: 'Needs plumbing: place it fully inside a blue plumbing zone.' });
  }
  if (d.floor?.needsBlackTank && !vd.tanks.black) out.push({ code: 'blacktank', text: 'Needs a built-in black water tank, which this vehicle does not have.' });
  if (!flat && overlaps(fp, vd.interior.door.zone)) out.push({ code: 'door', text: 'Blocks the entry door.' });
  const myAcc = accessZone(d, item.x, item.z, item.rot);
  for (const other of layout) {
    if (other.uid === item.uid) continue;
    const od = defs(other);
    const ofp = footprint(od, other.x, other.z, other.rot);
    const oflat = !!od.floor?.flat;
    if (flat !== oflat) continue; // rugs lie under furniture
    if (overlaps(fp, ofp)) out.push({ code: 'overlap', text: `Overlaps ${od.name}.` });
    if (flat) continue;
    const oacc = accessZone(od, other.x, other.z, other.rot);
    if (oacc && overlaps(fp, oacc)) out.push({ code: 'access', text: `Blocks access to ${od.name}.` });
    if (myAcc && overlaps(myAcc, ofp)) out.push({ code: 'access', text: `${od.name} is in front of it: you could not use it.` });
  }
  if (myAcc && !inside(myAcc, { ...living, z1: vd.interior.cab.z1 })) out.push({ code: 'access', text: 'Its front faces a wall.' });
  return out;
}

const CELL = 0.05;

/** Grid flood fill from the door: which access zones (and the cab) can a person reach? */
export function reachability(vd: VehicleDef, layout: LayoutItem[]): { unreachable: Set<string>; cabReachable: boolean } {
  const living = vd.interior.living;
  const cab = vd.interior.cab;
  const x0 = Math.min(living.x0, cab.x0), x1 = Math.max(living.x1, cab.x1);
  const z0 = Math.min(living.z0, cab.z0), z1 = Math.max(living.z1, cab.z1);
  const nx = Math.ceil((x1 - x0) / CELL), nz = Math.ceil((z1 - z0) / CELL);
  const free = new Uint8Array(nx * nz);
  const bodies = layout.filter((l) => !defs(l).floor?.flat).map((l) => footprint(defs(l), l.x, l.z, l.rot));
  // cab seats occupy space
  bodies.push(seatRect(vd.interior.driverSeat), seatRect(vd.interior.passengerSeat));
  const r = BODY_RADIUS;
  for (let j = 0; j < nz; j++) {
    const cz = z0 + (j + 0.5) * CELL;
    for (let i = 0; i < nx; i++) {
      const cx = x0 + (i + 0.5) * CELL;
      const inLiving = cx >= living.x0 + r && cx <= living.x1 - r && cz >= living.z0 + r && cz <= living.z1;
      const inCab = cx >= cab.x0 + r && cx <= cab.x1 - r && cz >= cab.z0 && cz <= cab.z1 - r;
      if (!inLiving && !inCab) continue;
      let blocked = false;
      for (const b of bodies) {
        const dx = Math.max(b.x0 - cx, 0, cx - b.x1);
        const dz = Math.max(b.z0 - cz, 0, cz - b.z1);
        if (dx * dx + dz * dz < r * r - 1e-6) {
          blocked = true;
          break;
        }
      }
      if (!blocked) free[j * nx + i] = 1;
    }
  }
  const seen = new Uint8Array(nx * nz);
  const q: number[] = [];
  const dz = vd.interior.door.zone;
  for (let j = 0; j < nz; j++) {
    const cz = z0 + (j + 0.5) * CELL;
    for (let i = 0; i < nx; i++) {
      const cx = x0 + (i + 0.5) * CELL;
      if (free[j * nx + i] && cx >= dz.x0 && cx <= dz.x1 && cz >= dz.z0 && cz <= dz.z1) {
        seen[j * nx + i] = 1;
        q.push(j * nx + i);
      }
    }
  }
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    const i = c % nx, j = (c - i) / nx;
    const nb = [i > 0 ? c - 1 : -1, i < nx - 1 ? c + 1 : -1, j > 0 ? c - nx : -1, j < nz - 1 ? c + nx : -1];
    for (const n of nb) if (n >= 0 && free[n] && !seen[n]) { seen[n] = 1; q.push(n); }
  }
  const reach = (rc: Rect, pad = 0.12) => {
    for (let j = 0; j < nz; j++) {
      const cz = z0 + (j + 0.5) * CELL;
      if (cz < rc.z0 - pad || cz > rc.z1 + pad) continue;
      for (let i = 0; i < nx; i++) {
        const cx = x0 + (i + 0.5) * CELL;
        if (cx < rc.x0 - pad || cx > rc.x1 + pad) continue;
        if (seen[j * nx + i]) return true;
      }
    }
    return false;
  };
  const unreachable = new Set<string>();
  for (const l of layout) {
    const d = defs(l);
    const acc = accessZone(d, l.x, l.z, l.rot);
    if (acc && !reach(acc)) unreachable.add(l.uid);
  }
  const ds = vd.interior.driverSeat;
  const cabReachable = reach({ x0: ds.x - 0.45, x1: ds.x + 0.25, z0: ds.z - 0.6, z1: ds.z - 0.2 }, 0.2);
  return { unreachable, cabReachable };
}

function seatRect(p: { x: number; z: number }): Rect {
  return { x0: p.x - 0.26, x1: p.x + 0.26, z0: p.z - 0.25, z1: p.z + 0.3 };
}

export interface LayoutCheck {
  issues: Record<string, PlacementIssue[]>;
  cabBlocked: boolean;
  valid: boolean;
}

export function checkLayout(vd: VehicleDef, layout: LayoutItem[]): LayoutCheck {
  const issues: Record<string, PlacementIssue[]> = {};
  for (const l of layout) issues[l.uid] = staticIssues(vd, layout, l);
  const r = reachability(vd, layout);
  for (const uid of r.unreachable) issues[uid].push({ code: 'blocked', text: 'Cannot be reached from the door: the aisle is blocked.' });
  const valid = Object.values(issues).every((x) => x.length === 0) && r.cabReachable;
  return { issues, cabBlocked: !r.cabReachable, valid };
}

/** Validate a candidate placement of one item (new or moved) against the current layout. */
export function checkPlacement(s: GameState, vid: string, cand: LayoutItem): PlacementIssue[] {
  const vd = vdef(vehicleById(s, vid));
  const layout = layoutOf(s, vid).filter((l) => l.uid !== cand.uid);
  layout.push(cand);
  const res = checkLayout(vd, layout);
  const own = res.issues[cand.uid] ?? [];
  const extra: PlacementIssue[] = [];
  for (const l of layout) {
    if (l.uid === cand.uid) continue;
    for (const iss of res.issues[l.uid]) {
      if (iss.code === 'blocked') extra.push({ code: 'blocked', text: `Would block the way to ${defs(l).name}.` });
    }
  }
  if (res.cabBlocked) extra.push({ code: 'blocked', text: 'Would block the path to the driver’s seat.' });
  return [...own, ...dedupe(extra)];
}

function dedupe(list: PlacementIssue[]): PlacementIssue[] {
  const seen = new Set<string>();
  return list.filter((i) => (seen.has(i.text) ? false : (seen.add(i.text), true)));
}

// ── operations (furnishing mode works on the live state; time is paused) ──

export function placeItem(s: GameState, vid: string, uid: string, x: number, z: number, rot: number): Result {
  const it = s.items[uid];
  if (!it) return fail('Item not found.');
  const d = defOf(it);
  if (!d.floor) return fail(`${d.name} is not floor furniture.`);
  if (it.where.kind === 'stored' && it.where.vehicle !== vid) return fail('That item is not in this vehicle.');
  if (it.where.kind !== 'stored' && it.where.kind !== 'floor') return fail('Bring the item into the RV first.');
  const iss = checkPlacement(s, vid, { uid, def: it.def, x, z, rot: ((rot % 4) + 4) % 4 });
  if (iss.length) return fail(iss[0].text);
  // contents of storage furniture move with it; nothing to do (compartment id = item uid)
  it.where = { kind: 'floor', vehicle: vid, x, z, rot: ((rot % 4) + 4) % 4 };
  it.secured = undefined;
  return ok();
}

/** Move a floor item back into storage, relocating anything stored inside it. */
export function uninstall(s: GameState, vid: string, uid: string): Result {
  const it = s.items[uid];
  if (!it || it.where.kind !== 'floor') return fail('That item is not installed on the floor.');
  const d = defOf(it);
  const v = vehicleById(s, vid);
  if (d.features?.toilet?.kind === 'cassette' && v.black > 0.5) return fail('Empty the toilet cassette at a dump station first.');
  const own = `item:${uid}`;
  const contents = itemsInCompartment(s, vid, own);
  const prevWhere = it.where;
  // temporarily take it off the floor so its own compartment disappears
  it.where = { kind: 'carried' };
  const moved: [ItemInstance, ItemInstance['where']][] = [];
  const rollback = (msg: string) => {
    for (const [m, w] of moved) m.where = w;
    it.where = prevWhere;
    return fail(msg);
  };
  for (const c of contents) {
    const prev = c.where;
    c.where = { kind: 'carried' };
    const comp = bestCompartment(s, vid, c);
    if (!comp) {
      c.where = prev;
      return rollback(`No room for ${itemName(c)} from inside ${d.name}: ${whyNoRoom(s, vid, c)}`);
    }
    c.where = { kind: 'stored', vehicle: vid, comp };
    moved.push([c, prev]);
  }
  const mat = d.features?.bed?.usesMattress ? mattressOn(s, uid) : undefined;
  if (mat) {
    mat.where = { kind: 'carried' };
    const comp = bestCompartment(s, vid, mat);
    if (!comp) {
      mat.where = { kind: 'mattress', vehicle: vid, bed: uid };
      return rollback(`No room to store the ${defOf(mat).name.toLowerCase()}. Free up space first.`);
    }
    mat.where = { kind: 'stored', vehicle: vid, comp };
  }
  const comp = bestCompartment(s, vid, it);
  if (!comp) {
    if (mat) mat.where = { kind: 'mattress', vehicle: vid, bed: uid };
    return rollback(`No storage space for ${d.name}: ${whyNoRoom(s, vid, it)}`);
  }
  it.where = { kind: 'stored', vehicle: vid, comp };
  return ok();
}

export function installSlot(s: GameState, vid: string, uid: string): Result {
  const it = s.items[uid];
  if (!it) return fail('Item not found.');
  const d = defOf(it);
  if (!d.slot) return fail(`${d.name} is not a system component.`);
  if (it.where.kind !== 'stored' || it.where.vehicle !== vid) return fail('The item must be in this RV’s storage.');
  const vd = vdef(vehicleById(s, vid));
  const slot = vd.slots[d.slot.kind];
  if (!slot) return fail(`This vehicle has no ${d.slot.kind === 'generator' ? 'generator bay' : d.slot.kind + ' mount'}.`);
  const use = slotUse(s, vid, d.slot.kind);
  if (use.used + d.slot.size > use.capacity + 1e-6) {
    const unit = d.slot.kind === 'roof' ? ' m²' : '';
    return fail(`Not enough ${d.slot.kind} space: ${(use.capacity - use.used).toFixed(d.slot.kind === 'roof' ? 1 : 0)}${unit} free, needs ${d.slot.size}${unit}.`);
  }
  it.where = { kind: 'slot', vehicle: vid, slot: d.slot.kind };
  return ok();
}

export function uninstallSlot(s: GameState, vid: string, uid: string): Result {
  const it = s.items[uid];
  if (!it || it.where.kind !== 'slot') return fail('Not installed.');
  const prev = it.where;
  it.where = { kind: 'carried' };
  const comp = bestCompartment(s, vid, it);
  if (!comp) {
    it.where = prev;
    return fail(`No storage space for it: ${whyNoRoom(s, vid, it)}`);
  }
  it.where = { kind: 'stored', vehicle: vid, comp };
  const v = vehicleById(s, vid);
  const c = capacities(s, vid);
  v.batteryWh = Math.min(v.batteryWh, c.batteryWh);
  if (v.fresh > c.fresh) v.fresh = c.fresh;
  return ok();
}

export function swapMattress(s: GameState, vid: string, bedUid: string, mattressUid: string): Result {
  const bed = s.items[bedUid];
  const mat = s.items[mattressUid];
  if (!bed || !mat) return fail('Item not found.');
  const bf = defOf(bed).features?.bed;
  const mf = defOf(mat).features?.mattress;
  if (!bf?.usesMattress || !mf) return fail('That does not go together.');
  if (bf.mattressSize !== mf.size) return fail(`That is a ${mf.size}-size mattress; this bed takes ${bf.mattressSize}-size.`);
  const old = mattressOn(s, bedUid);
  const prevMat = mat.where;
  mat.where = { kind: 'mattress', vehicle: vid, bed: bedUid };
  if (old) {
    old.where = { kind: 'carried' };
    const comp = bestCompartment(s, vid, old);
    if (!comp) {
      old.where = { kind: 'mattress', vehicle: vid, bed: bedUid };
      mat.where = prevMat;
      return fail(`No room to store the old ${defOf(old).name.toLowerCase()} (${whyNoRoom(s, vid, old)}). Sell it at a shop, or free up space.`);
    }
    old.where = { kind: 'stored', vehicle: vid, comp };
  }
  return ok();
}

export function storedFurniture(s: GameState, vid: string): ItemInstance[] {
  return Object.values(s.items).filter((i) => i.where.kind === 'stored' && i.where.vehicle === vid && (defOf(i).floor || defOf(i).slot || defOf(i).features?.mattress));
}

export function describeCompartment(s: GameState, vid: string, comp: string): string {
  return compartmentById(s, vid, comp)?.name ?? comp;
}
