import {
  BUILDINGS, CAMPGROUNDS, CANYON, DECKS, HILLS, LAKE, MESAS, NODE_BY_ID, PARKING, PLACES, WORLD,
} from '../data/map';
import { clamp, dist, lerp, projectSegment, smoothstep, worldToLocal } from '../sim/geo';
import { fbm, ridged } from './noise';
import { EDGES, nearestRoad, type RoadEdge } from './roads';

// Pure terrain model. Heights live on a 4 m grid; heightAt() interpolates the
// exact triangles the renderer draws, so wheels and feet sit on the mesh.

export const GRID = 4;
export const NX = Math.round((WORLD.maxX - WORLD.minX) / GRID) + 1;
export const NZ = Math.round((WORLD.maxZ - WORLD.minZ) / GRID) + 1;

export const PLATEAU = { x: -250, z: -1150, r0: 420, r1: 1150, h: 120 };

export type Surface = 'asphalt' | 'concrete' | 'gravel' | 'dirt' | 'sand' | 'grass' | 'rock' | 'wood' | 'water';

export const SURFACE_GRIP: Record<Surface, number> = {
  asphalt: 1, concrete: 1, gravel: 0.82, dirt: 0.8, sand: 0.62, grass: 0.72, rock: 0.85, wood: 0.9, water: 0.3,
};
export const SURFACE_ROLL: Record<Surface, number> = {
  asphalt: 1, concrete: 1, gravel: 1.8, dirt: 2.2, sand: 4.5, grass: 3, rock: 2, wood: 1.2, water: 8,
};
export const SURFACE_ROUGH: Record<Surface, number> = {
  asphalt: 0.05, concrete: 0.05, gravel: 0.5, dirt: 0.6, sand: 0.4, grass: 0.55, rock: 0.8, wood: 0.2, water: 0,
};

// ── distance-to-road field (coarse) ──

const DF = 16;
const DNX = Math.ceil((WORLD.maxX - WORLD.minX) / DF) + 1;
const DNZ = Math.ceil((WORLD.maxZ - WORLD.minZ) / DF) + 1;
let roadDist: Float32Array | null = null;

function buildRoadDist(): Float32Array {
  const d = new Float32Array(DNX * DNZ).fill(1e6);
  for (const e of EDGES) {
    for (let i = 0; i < e.xs.length; i++) {
      const cx = Math.round((e.xs[i] - WORLD.minX) / DF);
      const cz = Math.round((e.zs[i] - WORLD.minZ) / DF);
      if (cx >= 0 && cz >= 0 && cx < DNX && cz < DNZ) d[cz * DNX + cx] = 0;
    }
  }
  const diag = DF * Math.SQRT2;
  for (let z = 0; z < DNZ; z++) {
    for (let x = 0; x < DNX; x++) {
      const i = z * DNX + x;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + DF);
      if (z > 0) {
        v = Math.min(v, d[i - DNX] + DF);
        if (x > 0) v = Math.min(v, d[i - DNX - 1] + diag);
        if (x < DNX - 1) v = Math.min(v, d[i - DNX + 1] + diag);
      }
      d[i] = v;
    }
  }
  for (let z = DNZ - 1; z >= 0; z--) {
    for (let x = DNX - 1; x >= 0; x--) {
      const i = z * DNX + x;
      let v = d[i];
      if (x < DNX - 1) v = Math.min(v, d[i + 1] + DF);
      if (z < DNZ - 1) {
        v = Math.min(v, d[i + DNX] + DF);
        if (x < DNX - 1) v = Math.min(v, d[i + DNX + 1] + diag);
        if (x > 0) v = Math.min(v, d[i + DNX - 1] + diag);
      }
      d[i] = v;
    }
  }
  return d;
}

export function roadDistance(x: number, z: number): number {
  if (!roadDist) roadDist = buildRoadDist();
  const fx = clamp((x - WORLD.minX) / DF, 0, DNX - 1.001);
  const fz = clamp((z - WORLD.minZ) / DF, 0, DNZ - 1.001);
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = fx - ix, tz = fz - iz;
  const a = roadDist[iz * DNX + ix], b = roadDist[iz * DNX + ix + 1];
  const c = roadDist[(iz + 1) * DNX + ix], dd = roadDist[(iz + 1) * DNX + ix + 1];
  return lerp(lerp(a, b, tx), lerp(c, dd, tx), tz);
}

export function plateauMask(x: number, z: number): number {
  const d = dist(x, z, PLATEAU.x, PLATEAU.z);
  return 1 - smoothstep(PLATEAU.r0, PLATEAU.r1, d);
}

function distToPolyline(x: number, z: number, pts: [number, number][]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const p = projectSegment(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (p.d2 < best) best = p.d2;
  }
  return Math.sqrt(best);
}

/** Natural terrain before flattening, lake and roads. */
export function baseHeight(x: number, z: number): number {
  const rd = roadDistance(x, z);
  const roadMask = smoothstep(26, 150, rd);
  let h = 3.2 * fbm(x / 240, z / 240, 3, 11) + 1.2 * fbm(x / 55, z / 55, 2, 23);
  const pm = plateauMask(x, z);
  h += PLATEAU.h * pm + pm * 5 * fbm(x / 130, z / 130, 3, 41);
  const dl = Math.hypot((x - LAKE.x) / 1.3, z - LAKE.z);
  const rim = smoothstep(330, 560, dl) * smoothstep(0.15, 0.6, pm);
  if (rim > 0) h += rim * roadMask * (35 + 125 * ridged(x / 300, z / 300, 4, 5));
  for (const m of MESAS) {
    const d = dist(x, z, m.x, m.z);
    if (d > m.r + 70) continue;
    const edge = m.r + 9 * fbm(x / 38, z / 38, 2, 61);
    const t = 1 - smoothstep(edge - 26, edge + 8, d);
    const terrace = 1 + 0.06 * Math.sin(t * 12);
    h += m.h * t * terrace;
  }
  for (const hl of HILLS) {
    const d = dist(x, z, hl.x, hl.z);
    if (d < hl.r) {
      const t = 1 - d / hl.r;
      h += hl.h * t * t * (3 - 2 * t);
    }
  }
  const cd = distToPolyline(x, z, CANYON.points);
  if (cd < CANYON.width) {
    const t = 1 - smoothstep(CANYON.width * 0.22, CANYON.width * 0.8, cd);
    h -= CANYON.depth * t * smoothstep(24, 80, rd) * (0.85 + 0.15 * fbm(x / 30, z / 30, 2, 71));
  }
  const ex = Math.max(WORLD.playMinX + 90 - x, x - (WORLD.playMaxX - 90), 0);
  const ez = Math.max(WORLD.playMinZ + 90 - z, z - (WORLD.playMaxZ - 90), 0);
  const e = Math.hypot(ex, ez);
  if (e > 0) h += Math.min(1, e / 240) * (80 + 150 * ridged(x / 340, z / 340, 4, 9));
  return h;
}

// ── Flatten zones ──

interface FlatZone {
  cx: number;
  cz: number;
  /** circle radius (rect: 0) */
  r: number;
  w: number;
  l: number;
  rot: number;
  blend: number;
  target: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

let zones: FlatZone[] | null = null;

function zoneWeight(zn: FlatZone, x: number, z: number): number {
  if (x < zn.minX || x > zn.maxX || z < zn.minZ || z > zn.maxZ) return 0;
  if (zn.r > 0) return 1 - smoothstep(zn.r, zn.r + zn.blend, dist(x, z, zn.cx, zn.cz));
  const [lx, lz] = worldToLocal(x, z, zn.cx, zn.cz, zn.rot);
  const dx = Math.max(Math.abs(lx) - zn.w / 2, 0);
  const dz = Math.max(Math.abs(lz) - zn.l / 2, 0);
  return 1 - smoothstep(0, zn.blend, Math.hypot(dx, dz));
}

function applyZones(x: number, z: number, h: number, upTo: number): number {
  const list = zones!;
  for (let i = 0; i < upTo; i++) {
    const w = zoneWeight(list[i], x, z);
    if (w > 0) h = lerp(h, list[i].target, w);
  }
  return h;
}

function buildZones(): FlatZone[] {
  const list: FlatZone[] = [];
  zones = list;
  const add = (zn: Omit<FlatZone, 'target' | 'minX' | 'maxX' | 'minZ' | 'maxZ'>) => {
    const ext = (zn.r > 0 ? zn.r : Math.hypot(zn.w, zn.l) / 2) + zn.blend;
    const full: FlatZone = {
      ...zn, target: 0, minX: zn.cx - ext, maxX: zn.cx + ext, minZ: zn.cz - ext, maxZ: zn.cz + ext,
    };
    full.target = applyZones(zn.cx, zn.cz, baseHeight(zn.cx, zn.cz), list.length);
    list.push(full);
  };
  for (const p of PLACES) {
    if (p.flatten) add({ cx: p.x, cz: p.z, r: p.flatten, w: 0, l: 0, rot: 0, blend: Math.min(40, p.flatten * 0.5) });
  }
  for (const pk of PARKING) add({ cx: pk.x, cz: pk.z, r: 0, w: pk.w + 3, l: pk.l + 3, rot: pk.rot, blend: 9 });
  for (const b of BUILDINGS) add({ cx: b.x, cz: b.z, r: 0, w: b.w + 4, l: b.d + 4, rot: b.rot, blend: 6 });
  for (const camp of CAMPGROUNDS) {
    for (const s of camp.sites) {
      if (!s.level) continue;
      add({ cx: s.x, cz: s.z, r: 0, w: s.width + 3, l: s.length + 3, rot: s.heading, blend: 6 });
    }
  }
  return list;
}

function lakeCarve(x: number, z: number, h: number): number {
  const q = ((x - LAKE.x) / LAKE.rx) ** 2 + ((z - LAKE.z) / LAKE.rz) ** 2;
  if (q > 1.5) return h;
  const shore = LAKE.level - 0.7;
  if (q <= 1) return Math.min(h, shore - 9 * (1 - q));
  return Math.min(h, lerp(shore, h, smoothstep(1, 1.5, q)));
}

/** Terrain after flatten zones and the lake (before road carving). */
function preRoadHeight(x: number, z: number): number {
  if (!zones) buildZones();
  return lakeCarve(x, z, applyZones(x, z, baseHeight(x, z), zones!.length));
}

// ── Road profiles ──

let profiles: Float64Array[] | null = null;

function buildProfiles(): Float64Array[] {
  const out: Float64Array[] = [];
  const nodeH: Record<string, number> = {};
  const nh = (id: string) => (nodeH[id] ??= preRoadHeight(NODE_BY_ID[id].x, NODE_BY_ID[id].z));
  for (const e of EDGES) {
    const n = e.xs.length;
    const raw = new Float64Array(n);
    for (let i = 0; i < n; i++) raw[i] = preRoadHeight(e.xs[i], e.zs[i]);
    const W = e.def.kind === 'street' ? 4 : 12;
    const sm = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let k = Math.max(0, i - W); k <= Math.min(n - 1, i + W); k++) { s += raw[k]; c++; }
      sm[i] = s / c;
    }
    const a = nh(e.def.from), b = nh(e.def.to);
    for (let i = 0; i < n; i++) {
      const wa = 1 - smoothstep(0, 30, e.cum[i]);
      const wb = 1 - smoothstep(0, 30, e.length - e.cum[i]);
      sm[i] = lerp(lerp(sm[i], a, wa), b, wb);
    }
    const grade = e.def.kind === 'highway' ? 0.06 : e.def.kind === 'mountain' ? 0.085 : 0.1;
    sm[0] = a;
    sm[n - 1] = b;
    // Endpoints stay pinned; interior samples are clamped toward both ends.
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < n - 1; i++) {
        const ds = e.cum[i] - e.cum[i - 1];
        sm[i] = clamp(sm[i], sm[i - 1] - grade * ds, sm[i - 1] + grade * ds);
      }
      for (let i = n - 2; i >= 1; i--) {
        const ds = e.cum[i + 1] - e.cum[i];
        sm[i] = clamp(sm[i], sm[i + 1] - grade * ds, sm[i + 1] + grade * ds);
      }
    }
    out.push(sm);
  }
  return out;
}

export function roadProfile(e: RoadEdge): Float64Array {
  if (!profiles) profiles = buildProfiles();
  return profiles[e.index];
}

export function profileAt(e: RoadEdge, along: number): number {
  const hs = roadProfile(e);
  const cum = e.cum;
  const a = clamp(along, 0, e.length);
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= a) lo = mid;
    else hi = mid;
  }
  const t = (a - cum[lo]) / (cum[hi] - cum[lo] || 1);
  return lerp(hs[lo], hs[hi], t);
}

// ── Final height grid ──

let heights: Float32Array | null = null;

function computeVertex(x: number, z: number): number {
  let h = preRoadHeight(x, z);
  const hit = nearestRoad(x, z, 30);
  if (hit) {
    const half = hit.edge.def.width / 2;
    const rh = profileAt(hit.edge, hit.along);
    const inner = half + 2.4;
    const band = 10 + Math.min(18, Math.abs(h - rh) * 0.8);
    if (hit.dist < inner + band) {
      const w = 1 - smoothstep(inner, inner + band, hit.dist);
      h = lerp(h, rh - 0.24, w);
      if (hit.dist < inner) h = Math.min(h, rh - 0.24);
    }
  }
  return h;
}

export function buildHeights(): Float32Array {
  if (heights) return heights;
  if (!zones) buildZones();
  if (!profiles) profiles = buildProfiles();
  const hs = new Float32Array(NX * NZ);
  for (let j = 0; j < NZ; j++) {
    const z = WORLD.minZ + j * GRID;
    for (let i = 0; i < NX; i++) hs[j * NX + i] = computeVertex(WORLD.minX + i * GRID, z);
  }
  heights = hs;
  return hs;
}

export function gridHeight(i: number, j: number): number {
  const hs = heights ?? buildHeights();
  return hs[clamp(j, 0, NZ - 1) * NX + clamp(i, 0, NX - 1)];
}

/** Height of the rendered terrain triangles at (x, z). */
export function terrainHeight(x: number, z: number): number {
  const hs = heights ?? buildHeights();
  const fx = clamp((x - WORLD.minX) / GRID, 0, NX - 1.0001);
  const fz = clamp((z - WORLD.minZ) / GRID, 0, NZ - 1.0001);
  const i = Math.floor(fx), j = Math.floor(fz);
  const tx = fx - i, tz = fz - j;
  const h00 = hs[j * NX + i], h10 = hs[j * NX + i + 1];
  const h01 = hs[(j + 1) * NX + i], h11 = hs[(j + 1) * NX + i + 1];
  if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
  return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
}

// ── Ground queries for physics/audio ──

export interface Ground {
  y: number;
  surface: Surface;
  road: RoadEdge | null;
}

const PAD_SURF: Record<string, Surface> = { asphalt: 'asphalt', gravel: 'gravel', concrete: 'concrete' };

export function padAt(x: number, z: number): (typeof PARKING)[number] | null {
  for (const pk of PARKING) {
    if (Math.abs(x - pk.x) > pk.w + pk.l || Math.abs(z - pk.z) > pk.w + pk.l) continue;
    const [lx, lz] = worldToLocal(x, z, pk.x, pk.z, pk.rot);
    if (Math.abs(lx) <= pk.w / 2 && Math.abs(lz) <= pk.l / 2) return pk;
  }
  return null;
}

export function deckAt(x: number, z: number): (typeof DECKS)[number] | null {
  for (const d of DECKS) if (Math.abs(x - d.x) <= d.w / 2 && Math.abs(z - d.z) <= d.l / 2) return d;
  return null;
}

export function isLake(x: number, z: number): boolean {
  const q = ((x - LAKE.x) / LAKE.rx) ** 2 + ((z - LAKE.z) / LAKE.rz) ** 2;
  return q < 1.08 && terrainHeight(x, z) < LAKE.level - 0.25;
}

export function naturalSurface(x: number, z: number, y: number): Surface {
  const pm = plateauMask(x, z);
  if (pm > 0.35) return 'grass';
  for (const m of MESAS) if (dist(x, z, m.x, m.z) < m.r + 10) return 'rock';
  if (y < -20) return 'rock';
  return 'sand';
}

export function groundAt(x: number, z: number): Ground {
  const deck = deckAt(x, z);
  if (deck) return { y: deck.y, surface: 'wood', road: null };
  const hit = nearestRoad(x, z, 12);
  if (hit && hit.dist <= hit.edge.def.width / 2 + 1.2) {
    const k = hit.edge.def.kind;
    return {
      y: profileAt(hit.edge, hit.along),
      surface: k === 'dirt' || k === 'track' ? 'dirt' : hit.dist > hit.edge.def.width / 2 ? 'gravel' : 'asphalt',
      road: hit.edge,
    };
  }
  const y = terrainHeight(x, z);
  const pad = padAt(x, z);
  if (pad) return { y: y + 0.05, surface: PAD_SURF[pad.surface], road: null };
  if (isLake(x, z)) return { y, surface: 'water', road: null };
  return { y, surface: naturalSurface(x, z, y), road: null };
}

/** Is a spot free of roads, pads, buildings, sites and water? (prop scattering) */
export function isOpenGround(x: number, z: number, margin: number): boolean {
  if (roadDistance(x, z) < 6 + margin) {
    const hit = nearestRoad(x, z, 14 + margin);
    if (hit && hit.dist < hit.edge.def.width / 2 + 3 + margin) return false;
  }
  for (const pk of PARKING) {
    const [lx, lz] = worldToLocal(x, z, pk.x, pk.z, pk.rot);
    if (Math.abs(lx) <= pk.w / 2 + margin + 2 && Math.abs(lz) <= pk.l / 2 + margin + 2) return false;
  }
  for (const b of BUILDINGS) {
    if (Math.abs(x - b.x) > 40 || Math.abs(z - b.z) > 40) continue;
    const [lx, lz] = worldToLocal(x, z, b.x, b.z, b.rot);
    if (Math.abs(lx) <= b.w / 2 + margin + 3 && Math.abs(lz) <= b.d / 2 + margin + 4) return false;
  }
  for (const camp of CAMPGROUNDS) {
    for (const s of camp.sites) {
      if (Math.abs(x - s.x) > 30 || Math.abs(z - s.z) > 30) continue;
      const [lx, lz] = worldToLocal(x, z, s.x, s.z, s.heading);
      if (Math.abs(lx) <= s.width / 2 + margin + 3 && Math.abs(lz) <= s.length / 2 + margin + 3) return false;
    }
  }
  const q = ((x - LAKE.x) / LAKE.rx) ** 2 + ((z - LAKE.z) / LAKE.rz) ** 2;
  if (q < 1.12) return false;
  if (deckAt(x, z)) return false;
  return true;
}

export function terrainReady(): boolean {
  return heights != null;
}
