// 2D collision in the x/z plane with height ranges. Static colliders live in a
// spatial grid; dynamic ones (vehicles, traffic) are a small list.

export interface BoxCollider {
  kind: 'box';
  id: number;
  x: number;
  z: number;
  hw: number;
  hd: number;
  rot: number;
  c: number;
  s: number;
  y0: number;
  y1: number;
  tag: string;
  ref?: unknown;
}

export interface CircleCollider {
  kind: 'circle';
  id: number;
  x: number;
  z: number;
  r: number;
  y0: number;
  y1: number;
  tag: string;
  ref?: unknown;
}

export type Collider = BoxCollider | CircleCollider;

const CELL = 16;
const key = (cx: number, cz: number) => (cx + 4096) * 8192 + (cz + 4096);

export interface Contact {
  nx: number;
  nz: number;
  depth: number;
  other: Collider;
}

let nextId = 1;

export class CollisionWorld {
  private cells = new Map<number, Collider[]>();
  dynamic: Collider[] = [];
  count = 0;

  private insert(c: Collider) {
    const ext = c.kind === 'box' ? Math.hypot(c.hw, c.hd) : c.r;
    for (let cx = Math.floor((c.x - ext) / CELL); cx <= Math.floor((c.x + ext) / CELL); cx++) {
      for (let cz = Math.floor((c.z - ext) / CELL); cz <= Math.floor((c.z + ext) / CELL); cz++) {
        const k = key(cx, cz);
        let l = this.cells.get(k);
        if (!l) this.cells.set(k, (l = []));
        l.push(c);
      }
    }
    this.count++;
  }

  addBox(x: number, z: number, hw: number, hd: number, rot: number, y0: number, y1: number, tag: string, ref?: unknown): BoxCollider {
    const c: BoxCollider = { kind: 'box', id: nextId++, x, z, hw, hd, rot, c: Math.cos(rot), s: Math.sin(rot), y0, y1, tag, ref };
    this.insert(c);
    return c;
  }

  addCircle(x: number, z: number, r: number, y0: number, y1: number, tag: string, ref?: unknown): CircleCollider {
    const c: CircleCollider = { kind: 'circle', id: nextId++, x, z, r, y0, y1, tag, ref };
    this.insert(c);
    return c;
  }

  removeStatic(c: Collider) {
    for (const l of this.cells.values()) {
      const i = l.indexOf(c);
      if (i >= 0) l.splice(i, 1);
    }
  }

  static makeBox(x: number, z: number, hw: number, hd: number, rot: number, y0: number, y1: number, tag: string, ref?: unknown): BoxCollider {
    return { kind: 'box', id: nextId++, x, z, hw, hd, rot, c: Math.cos(rot), s: Math.sin(rot), y0, y1, tag, ref };
  }

  static moveBox(b: BoxCollider, x: number, z: number, rot: number, y0: number, y1: number) {
    b.x = x;
    b.z = z;
    b.rot = rot;
    b.c = Math.cos(rot);
    b.s = Math.sin(rot);
    b.y0 = y0;
    b.y1 = y1;
  }

  query(x: number, z: number, r: number, out: Collider[] = []): Collider[] {
    out.length = 0;
    const seen = new Set<number>();
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
      for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) {
        const l = this.cells.get(key(cx, cz));
        if (!l) continue;
        for (const c of l) {
          if (seen.has(c.id)) continue;
          seen.add(c.id);
          out.push(c);
        }
      }
    }
    for (const c of this.dynamic) out.push(c);
    return out;
  }

  /** Push a circle out of everything it overlaps (a few iterations). */
  resolveCircle(x: number, z: number, r: number, y0: number, y1: number, ignore?: (c: Collider) => boolean): { x: number; z: number; hit: Collider | null } {
    let hit: Collider | null = null;
    const list = this.query(x, z, r + 6);
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (const c of list) {
        if (c.y1 < y0 || c.y0 > y1) continue;
        if (ignore && ignore(c)) continue;
        const p = circleContact(x, z, r, c);
        if (p) {
          x += p.nx * p.depth;
          z += p.nz * p.depth;
          hit = c;
          moved = true;
        }
      }
      if (!moved) break;
    }
    return { x, z, hit };
  }

  /** Contacts between an oriented box and the world. */
  boxContacts(x: number, z: number, hw: number, hd: number, rot: number, y0: number, y1: number, ignore?: (c: Collider) => boolean): Contact[] {
    const out: Contact[] = [];
    const me = CollisionWorld.makeBox(x, z, hw, hd, rot, y0, y1, 'probe');
    for (const c of this.query(x, z, Math.hypot(hw, hd) + 8)) {
      if (c.y1 < y0 || c.y0 > y1) continue;
      if (ignore && ignore(c)) continue;
      const p = c.kind === 'box' ? boxBox(me, c) : boxCircle(me, c);
      if (p) out.push({ ...p, other: c });
    }
    return out;
  }

  /** Is a point inside any collider (camera clipping, placement)? */
  pointBlocked(x: number, z: number, y: number, margin = 0): Collider | null {
    for (const c of this.query(x, z, margin + 4)) {
      if (y < c.y0 || y > c.y1) continue;
      if (c.kind === 'circle') {
        if (Math.hypot(x - c.x, z - c.z) < c.r + margin) return c;
      } else {
        const dx = x - c.x, dz = z - c.z;
        const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
        if (Math.abs(lx) < c.hw + margin && Math.abs(lz) < c.hd + margin) return c;
      }
    }
    return null;
  }
}

/** Local frame of a box: local X axis = (c, -s), local Z axis = (s, c) in world. */
function toLocal(b: BoxCollider, x: number, z: number): [number, number] {
  const dx = x - b.x, dz = z - b.z;
  return [dx * b.c - dz * b.s, dx * b.s + dz * b.c];
}

function toWorldDir(b: BoxCollider, lx: number, lz: number): [number, number] {
  return [lx * b.c + lz * b.s, -lx * b.s + lz * b.c];
}

export function circleContact(x: number, z: number, r: number, c: Collider): { nx: number; nz: number; depth: number } | null {
  if (c.kind === 'circle') {
    const dx = x - c.x, dz = z - c.z;
    const d = Math.hypot(dx, dz);
    const min = r + c.r;
    if (d >= min) return null;
    if (d < 1e-6) return { nx: 1, nz: 0, depth: min };
    return { nx: dx / d, nz: dz / d, depth: min - d };
  }
  const [lx, lz] = toLocal(c, x, z);
  const qx = Math.max(-c.hw, Math.min(c.hw, lx));
  const qz = Math.max(-c.hd, Math.min(c.hd, lz));
  const dx = lx - qx, dz = lz - qz;
  const d2 = dx * dx + dz * dz;
  if (d2 > r * r) return null;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    const [nx, nz] = toWorldDir(c, dx / d, dz / d);
    return { nx, nz, depth: r - d };
  }
  // center inside the box: push out along the nearest face
  const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
  if (px < pz) {
    const [nx, nz] = toWorldDir(c, Math.sign(lx) || 1, 0);
    return { nx, nz, depth: px + r };
  }
  const [nx, nz] = toWorldDir(c, 0, Math.sign(lz) || 1);
  return { nx, nz, depth: pz + r };
}

function boxBox(a: BoxCollider, b: BoxCollider): { nx: number; nz: number; depth: number } | null {
  const axes: [number, number][] = [
    [a.c, -a.s], [a.s, a.c], [b.c, -b.s], [b.s, b.c],
  ];
  let best = Infinity;
  let bx = 0, bz = 0;
  const dx = a.x - b.x, dz = a.z - b.z;
  for (const [ax, az] of axes) {
    const ra = a.hw * Math.abs(a.c * ax - a.s * az) + a.hd * Math.abs(a.s * ax + a.c * az);
    const rb = b.hw * Math.abs(b.c * ax - b.s * az) + b.hd * Math.abs(b.s * ax + b.c * az);
    const dist = dx * ax + dz * az;
    const overlap = ra + rb - Math.abs(dist);
    if (overlap <= 0) return null;
    if (overlap < best) {
      best = overlap;
      const sg = dist >= 0 ? 1 : -1;
      bx = ax * sg;
      bz = az * sg;
    }
  }
  return { nx: bx, nz: bz, depth: best };
}

function boxCircle(a: BoxCollider, c: CircleCollider): { nx: number; nz: number; depth: number } | null {
  const p = circleContact(c.x, c.z, c.r, a);
  if (!p) return null;
  // normal pushes the circle out of the box; the box moves the opposite way
  return { nx: -p.nx, nz: -p.nz, depth: p.depth };
}
