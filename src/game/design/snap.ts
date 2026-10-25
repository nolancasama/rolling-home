import type { ItemDef, Rect, VehicleDef } from '../../data/types';
import { clamp } from '../../sim/geo';

// Placement snapping in vehicle-local meters: a 5 cm grid, walls that grab
// wall-backed items and turn them to face the room, and edge magnets that
// line items up with their neighbors.

export const GRID = 0.05;
export const FINE = 0.01;
const MAGNET = 0.035;

export type WallSide = 'left' | 'right' | 'rear';

export function snap(v: number, step: number): number {
  return Math.round(v / step) * step;
}

/** Quarter turn that puts an item's back against a wall (its front faces the room). */
export function wallRot(side: WallSide): number {
  return side === 'left' ? 3 : side === 'right' ? 1 : 0;
}

export function nearestWall(vd: VehicleDef, x: number, z: number): { side: WallSide; dist: number } {
  const l = vd.interior.living;
  const options: { side: WallSide; dist: number }[] = [
    { side: 'left', dist: Math.abs(l.x1 - x) },
    { side: 'right', dist: Math.abs(x - l.x0) },
    { side: 'rear', dist: Math.abs(z - l.z0) },
  ];
  return options.sort((a, b) => a.dist - b.dist)[0];
}

/** Center an item flush against a wall at a position along it. `def` is resolved (rot 0 footprint). */
export function onWall(vd: VehicleDef, def: ItemDef, side: WallSide, along: number): { x: number; z: number; rot: number } {
  const l = vd.interior.living;
  const [w, d] = def.floor!.footprint;
  if (side === 'rear') return { x: clamp(along, l.x0 + w / 2, l.x1 - w / 2), z: l.z0 + d / 2, rot: 0 };
  const z = clamp(along, l.z0 + w / 2, l.z1 - w / 2);
  return side === 'left' ? { x: l.x1 - d / 2, z, rot: 3 } : { x: l.x0 + d / 2, z, rot: 1 };
}

export interface Magnet {
  dx: number;
  dz: number;
  /** Aligned lines to draw: x = const or z = const. */
  guides: { axis: 'x' | 'z'; at: number }[];
}

/** Pull a rect's edges onto nearby edges of the living area and other items (per axis). */
export function edgeMagnet(rect: Rect, others: Rect[], living: Rect, axes: ('x' | 'z')[] = ['x', 'z']): Magnet {
  const out: Magnet = { dx: 0, dz: 0, guides: [] };
  const pull = (mine: number[], targets: number[]) => {
    let best: { delta: number; at: number } | null = null;
    for (const m of mine) for (const t of targets) {
      const delta = t - m;
      if (Math.abs(delta) <= MAGNET && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at: t };
    }
    return best;
  };
  if (axes.includes('x')) {
    const b = pull([rect.x0, rect.x1], [living.x0, living.x1, ...others.flatMap((r) => [r.x0, r.x1])]);
    if (b) { out.dx = b.delta; out.guides.push({ axis: 'x', at: b.at }); }
  }
  if (axes.includes('z')) {
    const b = pull([rect.z0, rect.z1], [living.z0, living.z1, ...others.flatMap((r) => [r.z0, r.z1])]);
    if (b) { out.dz = b.delta; out.guides.push({ axis: 'z', at: b.at }); }
  }
  return out;
}

/** Clear distance from a rect to the nearest obstacle or wall on each side (for live dimensions). */
export function clearances(rect: Rect, others: Rect[], living: Rect): { dir: 'left' | 'right' | 'rear' | 'front'; from: number; to: number; at: number }[] {
  const zMid = (rect.z0 + rect.z1) / 2, xMid = (rect.x0 + rect.x1) / 2;
  const overlapZ = (r: Rect) => r.z0 < rect.z1 - 1e-3 && r.z1 > rect.z0 + 1e-3;
  const overlapX = (r: Rect) => r.x0 < rect.x1 - 1e-3 && r.x1 > rect.x0 + 1e-3;
  let left = living.x1, right = living.x0, rear = living.z0, front = living.z1;
  for (const r of others) {
    if (overlapZ(r)) {
      if (r.x0 >= rect.x1 - 1e-3) left = Math.min(left, r.x0);
      if (r.x1 <= rect.x0 + 1e-3) right = Math.max(right, r.x1);
    }
    if (overlapX(r)) {
      if (r.z1 <= rect.z0 + 1e-3) rear = Math.max(rear, r.z1);
      if (r.z0 >= rect.z1 - 1e-3) front = Math.min(front, r.z0);
    }
  }
  return [
    { dir: 'left', from: rect.x1, to: left, at: zMid },
    { dir: 'right', from: rect.x0, to: right, at: zMid },
    { dir: 'rear', from: rect.z0, to: rear, at: xMid },
    { dir: 'front', from: rect.z1, to: front, at: xMid },
  ];
}
