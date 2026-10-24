// Small 2D geometry helpers (x/z plane). Rotation follows three.js
// rotation.y: local (lx, lz) → world (lx·cosθ + lz·sinθ, −lx·sinθ + lz·cosθ),
// so local +Z (forward) maps to (sinθ, cosθ).

export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function dist(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export function angleDiff(a: number, b: number): number {
  return wrapAngle(a - b);
}

export function localToWorld(lx: number, lz: number, ox: number, oz: number, rot: number): [number, number] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [ox + lx * c + lz * s, oz - lx * s + lz * c];
}

export function worldToLocal(wx: number, wz: number, ox: number, oz: number, rot: number): [number, number] {
  const dx = wx - ox;
  const dz = wz - oz;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [dx * c - dz * s, dx * s + dz * c];
}

/** w = extent along local X, l = extent along local Z. */
export function inRotRect(
  px: number, pz: number, cx: number, cz: number, w: number, l: number, rot: number, margin = 0,
): boolean {
  const [lx, lz] = worldToLocal(px, pz, cx, cz, rot);
  return Math.abs(lx) <= w / 2 + margin && Math.abs(lz) <= l / 2 + margin;
}

export interface SegProj {
  t: number;
  x: number;
  z: number;
  d2: number;
}

export function projectSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): SegProj {
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz;
  let t = len2 > 1e-9 ? ((px - ax) * vx + (pz - az) * vz) / len2 : 0;
  t = clamp(t, 0, 1);
  const x = ax + vx * t;
  const z = az + vz * t;
  const dx = px - x;
  const dz = pz - z;
  return { t, x, z, d2: dx * dx + dz * dz };
}

export function headingOf(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}
