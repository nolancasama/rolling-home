import type { ItemConfig, ItemDef, Rect, VehicleDef } from '../data/types';
import { itemDef } from '../data/items';
import { resolveDef } from './families';
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
  y?: number;
  config?: ItemConfig;
  state?: string;
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
  code: 'outside' | 'overlap' | 'door' | 'access' | 'blocked' | 'plumbing' | 'blacktank' | 'wall' | 'window' | 'headroom' | 'doorfit' | 'gas' | 'deploy' | 'power' | 'mixedbattery';
  severity: 'block' | 'warn';
  text: string;
}

export function layoutOf(s: GameState, vid: string): LayoutItem[] {
  return floorItems(s, vid).map((it) => {
    const w = it.where as Extract<ItemInstance['where'], { kind: 'floor' }>;
    return { uid: it.uid, def: it.def, x: w.x, z: w.z, rot: w.rot, y: w.y, config: it.config, state: it.state };
  });
}

function defs(li: LayoutItem): ItemDef {
  return resolveDef(itemDef(li.def), li);
}

export function itemElevation(vd: VehicleDef, item: LayoutItem): number {
  const floor = defs(item).floor!;
  if (floor.mount === 'ceiling') return vd.interior.ceilingY - vd.interior.floorY - floor.height;
  if (floor.mount === 'wall') return item.y ?? floor.elevation ?? 0;
  return 0;
}

function standingObstacle(vd: VehicleDef, item: LayoutItem): boolean {
  const d = defs(item);
  const y = itemElevation(vd, item);
  return !d.floor?.flat && y < 1.75 && y + d.floor!.height > 0;
}

/** Flat-packed furniture is assembled inside; other purchases need an actual entry opening. */
export function doorFitIssue(vd: VehicleDef, def: ItemDef, relaxed = false): PlacementIssue | null {
  if (def.floor?.flatpack) return null;
  const [a, b] = [...def.dims].sort((x, y) => x - y);
  if (vd.interior.openings.some((o) => (a <= o.w && b <= o.h) || (a <= o.h && b <= o.w))) return null;
  const opening = vd.interior.openings[0];
  return { code: 'doorfit', severity: relaxed ? 'warn' : 'block', text: `${def.name} cannot fit through the ${opening?.name ?? 'entry door'}${opening ? ` (${opening.w.toFixed(2)} × ${opening.h.toFixed(2)} m)` : ''}.` };
}

function backWall(vd: VehicleDef, item: LayoutItem, tolerance: number): 'left' | 'right' | 'rear' | null {
  const fp = footprint(defs(item), item.x, item.z, item.rot);
  const living = vd.interior.living;
  const rot = ((item.rot % 4) + 4) % 4;
  if (rot === 3 && Math.abs(fp.x1 - living.x1) <= tolerance + EPS) return 'left';
  if (rot === 1 && Math.abs(fp.x0 - living.x0) <= tolerance + EPS) return 'right';
  if (rot === 0 && Math.abs(fp.z0 - living.z0) <= tolerance + EPS) return 'rear';
  return null;
}

export interface FreeWallSpan {
  a0: number;
  a1: number;
  length: number;
  before?: string;
  after?: string;
}

/** Along-wall coordinates are z on side walls and x on the rear; heights are above the floor. */
export function freeWallSpan(s: GameState, vid: string, side: 'left' | 'right' | 'rear', at: number, y0: number, y1: number): FreeWallSpan {
  const vd = vdef(vehicleById(s, vid));
  const living = vd.interior.living;
  const start = side === 'rear' ? living.x0 : living.z0;
  const end = side === 'rear' ? living.x1 : living.z1;
  const point = Math.max(start, Math.min(end, at));
  const bottom = Math.min(y0, y1), top = Math.max(y0, y1);
  const inBand = (low: number, high: number) => Math.min(top, high) - Math.max(bottom, low) > EPS;
  const occupied: { a0: number; a1: number; name: string }[] = [];
  const add = (a0: number, a1: number, name: string) => {
    const lo = Math.max(start, a0), hi = Math.min(end, a1);
    if (hi > lo) occupied.push({ a0: lo, a1: hi, name });
  };
  for (const item of layoutOf(s, vid)) {
    const d = defs(item), fp = footprint(d, item.x, item.z, item.rot);
    const y = itemElevation(vd, item);
    if (!inBand(y, y + d.floor!.height)) continue;
    // Any footprint touching the wall occupies it, regardless of which way its front faces.
    const touches = side === 'left' ? Math.abs(fp.x1 - living.x1) <= 0.03 + EPS
      : side === 'right' ? Math.abs(fp.x0 - living.x0) <= 0.03 + EPS
        : Math.abs(fp.z0 - living.z0) <= 0.03 + EPS;
    if (touches) add(side === 'rear' ? fp.x0 : fp.z0, side === 'rear' ? fp.x1 : fp.z1, d.name);
  }
  for (const window of vd.interior.windows) {
    if (window.side === side && inBand(window.y0 - vd.interior.floorY, window.y1 - vd.interior.floorY)) {
      add(window.a0, window.a1, `Window ${window.id}`);
    }
  }
  const door = vd.interior.door, opening = vd.interior.openings.find((entry) => entry.name === 'entry door') ?? vd.interior.openings[0];
  if (door.side === side && inBand(0, opening?.h ?? 1.95)) add(door.z0, door.z1, opening?.name ?? 'entry door');
  // A point in an obstruction has no free interval. Boundary points may start/end a free span.
  const covering = occupied.find((entry) => point > entry.a0 + EPS && point < entry.a1 - EPS);
  if (covering) return { a0: point, a1: point, length: 0, before: covering.name, after: covering.name };
  let a0 = start, a1 = end;
  let before: string | undefined, after: string | undefined;
  for (const entry of occupied) {
    if (entry.a1 <= point + EPS && entry.a1 >= a0) { a0 = entry.a1; before = entry.name; }
    if (entry.a0 >= point - EPS && entry.a0 <= a1) { a1 = entry.a0; after = entry.name; }
  }
  return { a0, a1, length: Math.max(0, a1 - a0), ...(before ? { before } : {}), ...(after ? { after } : {}) };
}

/** Checks one item against the floor plan and the rest of the layout (no path check). */
export function staticIssues(vd: VehicleDef, layout: LayoutItem[], item: LayoutItem, s?: GameState, vid?: string): PlacementIssue[] {
  const out: PlacementIssue[] = [];
  const d = defs(item);
  const fp = footprint(d, item.x, item.z, item.rot);
  const flat = !!d.floor?.flat;
  const living = vd.interior.living;
  const y = itemElevation(vd, item), top = y + d.floor!.height;
  const clearance = vd.interior.ceilingY - vd.interior.floorY;
  const relaxed = s?.gameType === 'creative' && s.creativeRelaxed;
  const issue = (code: PlacementIssue['code'], text: string, warn = false) => out.push({ code, text, severity: warn || (relaxed && ['plumbing', 'blacktank', 'gas', 'doorfit'].includes(code)) ? 'warn' : 'block' });
  if (!inside(fp, living)) issue('outside', 'Must sit inside the living area (not the cab or outside the walls).');
  if (d.floor?.plumbing && !vd.interior.plumbing.some((z) => inside(fp, z))) {
    issue('plumbing', 'Needs plumbing: place it fully inside a blue plumbing zone.');
  }
  if (d.floor?.needsBlackTank && !vd.tanks.black) issue('blacktank', 'Needs a built-in black water tank, which this vehicle does not have.');
  if (d.floor?.propane && !vd.interior.gas.some((zone) => inside(fp, zone))) issue('gas', 'Needs a gas line: place it fully inside a gas zone.');
  if (!flat && y < 1.95 && top > 0 && overlaps(fp, vd.interior.door.zone)) issue('door', 'Blocks the entry door.');
  if (y < -EPS || top > clearance + 0.01) issue('headroom', `Too tall: needs ${top.toFixed(2)} m, the ceiling is ${clearance.toFixed(2)} m above the floor.`);
  if (d.floor?.mount === 'wall') {
    const [min, max] = d.floor.elevationRange ?? [0, 'clearance'];
    if (y < min - EPS || y > (max === 'clearance' ? clearance - d.floor.height : max) + EPS) issue('headroom', `Mount between ${min.toFixed(2)} m and ${(max === 'clearance' ? clearance - d.floor.height : max).toFixed(2)} m above the floor.`);
  }
  const wall = backWall(vd, item, d.floor?.mount === 'wall' ? 0.015 : 0.03);
  if ((d.floor?.againstWall || d.floor?.mount === 'wall') && !wall) issue('wall', 'The back must touch a wall and face into the room.');
  if (wall) for (const win of vd.interior.windows) {
    if (win.side !== wall) continue;
    const a0 = wall === 'rear' ? fp.x0 : fp.z0, a1 = wall === 'rear' ? fp.x1 : fp.z1;
    const span = Math.min(a1, win.a1) - Math.max(a0, win.a0);
    const sill = win.y0 - vd.interior.floorY, winTop = win.y1 - vd.interior.floorY;
    if ((d.floor?.mount === 'wall' && span > EPS && Math.min(top, winTop) - Math.max(y, sill) > 0.02) ||
        (d.floor?.mount !== 'wall' && span > 0.05 && top > sill + 0.35)) issue('window', `Would cover window ${win.id}.`);
  }
  const myAcc = accessZone(d, item.x, item.z, item.rot);
  for (const other of layout) {
    if (other.uid === item.uid) continue;
    const od = defs(other);
    const ofp = footprint(od, other.x, other.z, other.rot);
    const oflat = !!od.floor?.flat;
    if (flat !== oflat) continue; // rugs lie under furniture
    const oy = itemElevation(vd, other), otop = oy + od.floor!.height;
    if (overlaps(fp, ofp) && Math.min(top, otop) - Math.max(y, oy) > 0.01) issue('overlap', `Overlaps ${od.name}.`);
    if (flat) continue;
    const oacc = accessZone(od, other.x, other.z, other.rot);
    if (oacc && standingObstacle(vd, item) && (oy < 1 || top > 1) && overlaps(fp, oacc)) issue('access', `Blocks access to ${od.name}.`);
    if (myAcc && standingObstacle(vd, other) && (y < 1 || otop > 1) && overlaps(myAcc, ofp)) issue('access', `${od.name} is in front of it: you could not use it.`);
  }
  if (myAcc && !inside(myAcc, { ...living, z1: vd.interior.cab.z1 })) issue('access', 'Its front faces a wall.');
  if (d.floor?.ac && s) {
    const vehicle = layoutVehicleId(s, vd, layout, vid);
    const inverter = Object.values(s.items).filter((it) => it.where.kind === 'slot' && it.where.vehicle === vehicle).reduce((max, it) => Math.max(max, defOf(it).features?.inverter?.watts ?? 0), 0);
    if (inverter < d.floor.ac.minInverter) issue('power', `Needs 120 V: runs only on shore power or the generator unless you install an inverter of at least ${d.floor.ac.minInverter.toLocaleString('en-US')} W.`, true);
  }
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
  const bodies = layout.filter((l) => standingObstacle(vd, l)).map((l) => footprint(defs(l), l.x, l.z, l.rot));
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
    // High storage can be reached across low furniture from the aisle, one body diameter beyond its zone.
    if (acc && !reach(acc, itemElevation(vd, l) >= 1 ? BODY_RADIUS * 2 : 0.12)) unreachable.add(l.uid);
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
  general: PlacementIssue[];
  cabBlocked: boolean;
  valid: boolean;
}

export function checkLayout(vd: VehicleDef, layout: LayoutItem[], s?: GameState, vid?: string): LayoutCheck {
  const issues: Record<string, PlacementIssue[]> = {};
  const general: PlacementIssue[] = [];
  const vehicle = s ? layoutVehicleId(s, vd, layout, vid) : vid;
  for (const l of layout) {
    issues[l.uid] = staticIssues(vd, layout, l, s, vehicle);
    const states = defs(l).floor?.states;
    const current = states?.find((state) => state.id === l.state) ?? states?.[0];
    for (const state of states ?? []) {
      if (state.id === current?.id) continue;
      const candidate = stateCandidate(l, state.id);
      const collision = staticIssues(vd, layout, candidate, s, vehicle).find((issue) => ['outside', 'overlap', 'door', 'headroom'].includes(issue.code));
      if (collision) issues[l.uid].push({ code: 'deploy', severity: 'warn', text: deploymentText(collision) });
    }
  }
  if (s) {
    const batteries = Object.values(s.items).filter((inst) => inst.where.kind === 'slot' && inst.where.vehicle === vehicle && !!defOf(inst).features?.battery);
    if (batteries.some((inst) => inst.def.startsWith('agm')) && batteries.some((inst) => inst.def.startsWith('lithium'))) {
      general.push({ code: 'mixedbattery', severity: 'warn', text: 'Mixing AGM and lithium shortens battery life.' });
    }
  }
  const r = reachability(vd, layout);
  for (const uid of r.unreachable) issues[uid].push({ code: 'blocked', severity: 'block', text: 'Cannot be reached from the door: the aisle is blocked.' });
  const valid = [...Object.values(issues).flat(), ...general].every((issue) => issue.severity !== 'block') && r.cabReachable;
  return { issues, general, cabBlocked: !r.cabReachable, valid };
}

/** Legacy callers can infer the instance from their layout; drafts pass it explicitly. */
function layoutVehicleId(s: GameState, vd: VehicleDef, layout: LayoutItem[], vid?: string): string | undefined {
  if (vid) return vid;
  for (const item of layout) {
    const where = s.items[item.uid]?.where;
    if (where && 'vehicle' in where) return where.vehicle;
  }
  return s.vehicles.some((vehicle) => vehicle.id === s.vehicleId && vehicle.def === vd.id) ? s.vehicleId : undefined;
}

function deploymentText(issue: PlacementIssue): string {
  if (issue.code === 'overlap') return `Unfolded, it would hit the ${issue.text.slice('Overlaps '.length)}`;
  if (issue.code === 'door') return 'Unfolded, it would block the entry door.';
  if (issue.code === 'outside') return 'Unfolded, it would hit a wall.';
  return issue.text;
}

function stateCandidate(item: LayoutItem, state: string): LayoutItem {
  const current = defs(item);
  const candidate = { ...item, state };
  if (current.floor?.againstWall) {
    // Hinged wall furniture opens into the room while its mounting edge stays fixed.
    const depthChange = defs(candidate).floor!.footprint[1] - current.floor.footprint[1];
    const [fx, fz] = facing(item.rot);
    candidate.x += fx * depthChange / 2;
    candidate.z += fz * depthChange / 2;
  }
  return candidate;
}

/** State changes only require bodily clearance; access zones are checked when arranging furniture. */
export function setItemState(s: GameState, vid: string, uid: string, stateId: string): Result {
  const inst = s.items[uid];
  if (!inst || inst.where.kind !== 'floor' || inst.where.vehicle !== vid) return fail('That item is not installed in this vehicle.');
  const states = defOf(inst).floor?.states;
  if (!states?.some((state) => state.id === stateId)) return fail('That state is not available.');
  const vd = vdef(vehicleById(s, vid));
  const layout = layoutOf(s, vid);
  const candidate = stateCandidate(layout.find((entry) => entry.uid === uid)!, stateId);
  const collision = staticIssues(vd, layout, candidate, s, vid).find((issue) => ['outside', 'overlap', 'door', 'headroom'].includes(issue.code));
  if (collision) return fail(deploymentText(collision));
  inst.state = stateId;
  inst.where.x = candidate.x;
  inst.where.z = candidate.z;
  return ok();
}

/** Validate a candidate placement of one item (new or moved) against the current layout. */
export function checkPlacement(s: GameState, vid: string, cand: LayoutItem): PlacementIssue[] {
  const vd = vdef(vehicleById(s, vid));
  const layout = layoutOf(s, vid).filter((l) => l.uid !== cand.uid);
  layout.push(cand);
  const res = checkLayout(vd, layout, s, vid);
  const own = res.issues[cand.uid] ?? [];
  const inst = s.items[cand.uid];
  if (!inst || !('vehicle' in inst.where) || inst.where.vehicle !== vid) {
    const entry = doorFitIssue(vd, defs(cand), s.gameType === 'creative' && !!s.creativeRelaxed);
    if (entry) own.push(entry);
  }
  const extra: PlacementIssue[] = [];
  for (const l of layout) {
    if (l.uid === cand.uid) continue;
    for (const iss of res.issues[l.uid]) {
      if (iss.code === 'blocked') extra.push({ code: 'blocked', severity: 'block', text: `Would block the way to ${defs(l).name}.` });
    }
  }
  if (res.cabBlocked) extra.push({ code: 'blocked', severity: 'block', text: 'Would block the path to the driver’s seat.' });
  return [...own, ...dedupe(extra)];
}

function dedupe(list: PlacementIssue[]): PlacementIssue[] {
  const seen = new Set<string>();
  return list.filter((i) => (seen.has(i.text) ? false : (seen.add(i.text), true)));
}

// ── operations (furnishing mode works on the live state; time is paused) ──

export function placeItem(s: GameState, vid: string, uid: string, x: number, z: number, rot: number, y?: number): Result {
  const it = s.items[uid];
  if (!it) return fail('Item not found.');
  const d = defOf(it);
  if (!d.floor) return fail(`${d.name} is not floor furniture.`);
  if (it.where.kind === 'stored' && it.where.vehicle !== vid) return fail('That item is not in this vehicle.');
  if (it.where.kind !== 'stored' && it.where.kind !== 'floor') return fail('Bring the item into the RV first.');
  const elevation = y ?? (it.where.kind === 'floor' ? it.where.y : undefined);
  const candidate = { uid, def: it.def, x, z, rot: ((rot % 4) + 4) % 4, y: elevation, config: it.config, state: it.state };
  const iss = checkPlacement(s, vid, candidate).filter((issue) => issue.severity === 'block');
  if (iss.length) return fail(iss[0].text);
  // contents of storage furniture move with it; nothing to do (compartment id = item uid)
  it.where = { kind: 'floor', vehicle: vid, x, z, rot: ((rot % 4) + 4) % 4, y: itemElevation(vdef(vehicleById(s, vid)), candidate) };
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
