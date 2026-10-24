import { NODES, NODE_BY_ID, ROADS, type RoadDef } from '../data/map';
import { dist, projectSegment } from '../sim/geo';

// Pure road network model: smoothed polylines, spatial lookup and routing.

export interface RoadEdge {
  def: RoadDef;
  index: number;
  xs: Float64Array;
  zs: Float64Array;
  /** Cumulative world length at each sample. */
  cum: Float64Array;
  length: number;
  /** Fictional kilometers for this edge (length × compression). */
  km: number;
}

const SAMPLE = 3;

function catmull(p: [number, number][], samplesPerSeg: number): [number, number][] {
  const out: [number, number][] = [];
  const n = p.length;
  const get = (i: number) => p[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    // centripetal parameterization
    const t0 = 0;
    const t1 = t0 + Math.sqrt(Math.max(1e-6, dist(p0[0], p0[1], p1[0], p1[1])));
    const t2 = t1 + Math.sqrt(Math.max(1e-6, dist(p1[0], p1[1], p2[0], p2[1])));
    const t3 = t2 + Math.sqrt(Math.max(1e-6, dist(p2[0], p2[1], p3[0], p3[1])));
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = t1 + ((t2 - t1) * s) / samplesPerSeg;
      const pt: [number, number] = [0, 0];
      for (let k = 0; k < 2; k++) {
        const A1 = ((t1 - t) / (t1 - t0)) * p0[k] + ((t - t0) / (t1 - t0)) * p1[k];
        const A2 = ((t2 - t) / (t2 - t1)) * p1[k] + ((t - t1) / (t2 - t1)) * p2[k];
        const A3 = ((t3 - t) / (t3 - t2)) * p2[k] + ((t - t2) / (t3 - t2)) * p3[k];
        const B1 = ((t2 - t) / (t2 - t0)) * A1 + ((t - t0) / (t2 - t0)) * A2;
        const B2 = ((t3 - t) / (t3 - t1)) * A2 + ((t - t1) / (t3 - t1)) * A3;
        pt[k] = ((t2 - t) / (t2 - t1)) * B1 + ((t - t1) / (t2 - t1)) * B2;
      }
      out.push(pt);
    }
  }
  out.push(p[n - 1]);
  return out;
}

function resample(dense: [number, number][], step: number): [number, number][] {
  const out: [number, number][] = [dense[0]];
  let carry = 0;
  for (let i = 0; i < dense.length - 1; i++) {
    const [ax, az] = dense[i];
    const [bx, bz] = dense[i + 1];
    const seg = dist(ax, az, bx, bz);
    let pos = step - carry;
    while (pos <= seg) {
      const t = pos / seg;
      out.push([ax + (bx - ax) * t, az + (bz - az) * t]);
      pos += step;
    }
    carry = seg - (pos - step);
  }
  const last = dense[dense.length - 1];
  const prev = out[out.length - 1];
  if (dist(prev[0], prev[1], last[0], last[1]) > step * 0.35) out.push(last);
  else out[out.length - 1] = last;
  return out;
}

function buildEdge(def: RoadDef, index: number): RoadEdge {
  const a = NODE_BY_ID[def.from];
  const b = NODE_BY_ID[def.to];
  const ctrl: [number, number][] = [[a.x, a.z], ...def.via, [b.x, b.z]];
  const pts = ctrl.length > 2 ? resample(catmull(ctrl, 24), SAMPLE) : resample(ctrl, SAMPLE);
  const xs = new Float64Array(pts.length);
  const zs = new Float64Array(pts.length);
  const cum = new Float64Array(pts.length);
  for (let i = 0; i < pts.length; i++) {
    xs[i] = pts[i][0];
    zs[i] = pts[i][1];
    if (i > 0) cum[i] = cum[i - 1] + dist(xs[i - 1], zs[i - 1], xs[i], zs[i]);
  }
  const length = cum[pts.length - 1];
  return { def, index, xs, zs, cum, length, km: (length * def.compression) / 1000 };
}

export const EDGES: RoadEdge[] = ROADS.map(buildEdge);
export const EDGE_BY_ID: Record<string, RoadEdge> = Object.fromEntries(EDGES.map((e) => [e.def.id, e]));

// ── Spatial hash over edge segments ──

const CELL = 40;
const grid = new Map<number, number[]>(); // key → list of (edgeIndex << 16 | segIndex)

function key(cx: number, cz: number): number {
  return (cx + 1000) * 4096 + (cz + 1000);
}

for (const e of EDGES) {
  const pad = e.def.width / 2 + 2;
  for (let i = 0; i < e.xs.length - 1; i++) {
    const x0 = Math.min(e.xs[i], e.xs[i + 1]) - pad, x1 = Math.max(e.xs[i], e.xs[i + 1]) + pad;
    const z0 = Math.min(e.zs[i], e.zs[i + 1]) - pad, z1 = Math.max(e.zs[i], e.zs[i + 1]) + pad;
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const k = key(cx, cz);
        let list = grid.get(k);
        if (!list) grid.set(k, (list = []));
        list.push(e.index * 65536 + i);
      }
    }
  }
}

export interface RoadHit {
  edge: RoadEdge;
  seg: number;
  t: number;
  x: number;
  z: number;
  dist: number;
  /** World distance along the edge. */
  along: number;
  /** Signed lateral offset: + = left of travel direction. */
  side: number;
}

/** Nearest road point within maxDist (searches neighbouring cells). */
export function nearestRoad(x: number, z: number, maxDist = 30, filter?: (e: RoadEdge) => boolean): RoadHit | null {
  let best: RoadHit | null = null;
  let bestD2 = maxDist * maxDist;
  const r = Math.ceil(maxDist / CELL);
  const cx0 = Math.floor(x / CELL);
  const cz0 = Math.floor(z / CELL);
  const seen = new Set<number>();
  for (let cx = cx0 - r; cx <= cx0 + r; cx++) {
    for (let cz = cz0 - r; cz <= cz0 + r; cz++) {
      const list = grid.get(key(cx, cz));
      if (!list) continue;
      for (const code of list) {
        if (seen.has(code)) continue;
        seen.add(code);
        const e = EDGES[Math.floor(code / 65536)];
        if (filter && !filter(e)) continue;
        const i = code % 65536;
        const p = projectSegment(x, z, e.xs[i], e.zs[i], e.xs[i + 1], e.zs[i + 1]);
        if (p.d2 < bestD2) {
          bestD2 = p.d2;
          const dx = e.xs[i + 1] - e.xs[i];
          const dz = e.zs[i + 1] - e.zs[i];
          // left of travel for heading (sin,cos) is local +X → (cos, -sin) of heading... use cross product
          const cross = dx * (z - p.z) - dz * (x - p.x);
          best = {
            edge: e, seg: i, t: p.t, x: p.x, z: p.z, dist: Math.sqrt(p.d2),
            along: e.cum[i] + (e.cum[i + 1] - e.cum[i]) * p.t,
            side: cross > 0 ? -Math.sqrt(p.d2) : Math.sqrt(p.d2),
          };
        }
      }
    }
  }
  return best;
}

export function pointAlong(e: RoadEdge, along: number): { x: number; z: number; dx: number; dz: number } {
  const a = Math.max(0, Math.min(e.length, along));
  let lo = 0, hi = e.cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (e.cum[mid] <= a) lo = mid;
    else hi = mid;
  }
  const seg = e.cum[hi] - e.cum[lo] || 1;
  const t = (a - e.cum[lo]) / seg;
  const dx = (e.xs[hi] - e.xs[lo]) / seg;
  const dz = (e.zs[hi] - e.zs[lo]) / seg;
  return { x: e.xs[lo] + (e.xs[hi] - e.xs[lo]) * t, z: e.zs[lo] + (e.zs[hi] - e.zs[lo]) * t, dx, dz };
}

/** Time/distance compression at a world point (driving). Towns and off-road = base 6×. */
export function compressionAt(x: number, z: number): number {
  const hit = nearestRoad(x, z, 25);
  if (!hit) return 6;
  return hit.edge.def.compression;
}

// ── Graph + routing ──

export interface Adj { edge: RoadEdge; to: string; forward: boolean }

const ADJ: Record<string, Adj[]> = {};
for (const n of NODES) ADJ[n.id] = [];
for (const e of EDGES) {
  if (e.def.loop) continue; // loops are destinations themselves, not through-routes
  ADJ[e.def.from].push({ edge: e, to: e.def.to, forward: true });
  ADJ[e.def.to].push({ edge: e, to: e.def.from, forward: false });
}

export interface RouteStep {
  edge: RoadEdge;
  forward: boolean;
  /** World distance range on this edge used by the route. */
  from: number;
  to: number;
}

export interface Route {
  steps: RouteStep[];
  /** World polyline of the full route. */
  points: [number, number][];
  worldLength: number;
  km: number;
  /** Game minutes at typical speeds. */
  minutes: number;
  /** Highway/mountain edges used (for assisted-travel exploration checks). */
  majorEdges: string[];
  destNode: string;
}

function edgeCostMinutes(e: RoadEdge, worldLen: number): number {
  const km = (worldLen * e.def.compression) / 1000;
  return (km * 1000) / e.def.speed / 60;
}

export interface RouteOptions {
  vehicleWidth: number;
  /** Discoveries that reveal hidden roads. */
  revealed?: Record<string, boolean>;
}

/** Dijkstra from an arbitrary world position to a node. */
export function routeTo(x: number, z: number, destNode: string, opts: RouteOptions): Route | null {
  const usable = (e: RoadEdge) =>
    (e.def.maxWidth == null || opts.vehicleWidth <= e.def.maxWidth) &&
    (!e.def.hiddenUntil || !!opts.revealed?.[e.def.hiddenUntil]);
  const start = nearestRoad(x, z, 400, (e) => usable(e) && !e.def.loop) ?? nearestRoad(x, z, 1200, (e) => usable(e) && !e.def.loop);
  if (!start) return null;

  const distTo: Record<string, number> = {};
  const prev: Record<string, { node: string | null; adj: Adj | null; startForward?: boolean }> = {};
  const open = new Set<string>();
  // Virtual start: both ends of the current edge.
  const se = start.edge;
  const toFrom = edgeCostMinutes(se, start.along);
  const toTo = edgeCostMinutes(se, se.length - start.along);
  distTo[se.def.from] = toFrom;
  prev[se.def.from] = { node: null, adj: null, startForward: false };
  distTo[se.def.to] = Math.min(distTo[se.def.to] ?? Infinity, toTo);
  if (toTo <= (distTo[se.def.to] ?? Infinity)) prev[se.def.to] = { node: null, adj: null, startForward: true };
  open.add(se.def.from);
  open.add(se.def.to);

  const done = new Set<string>();
  while (open.size) {
    let cur = '';
    let best = Infinity;
    for (const n of open) if (distTo[n] < best) { best = distTo[n]; cur = n; }
    open.delete(cur);
    if (cur === destNode) break;
    done.add(cur);
    for (const adj of ADJ[cur] ?? []) {
      if (!usable(adj.edge) || done.has(adj.to)) continue;
      const nd = best + edgeCostMinutes(adj.edge, adj.edge.length);
      if (nd < (distTo[adj.to] ?? Infinity)) {
        distTo[adj.to] = nd;
        prev[adj.to] = { node: cur, adj };
        open.add(adj.to);
      }
    }
  }
  if (distTo[destNode] == null) return null;

  // Reconstruct.
  const steps: RouteStep[] = [];
  let n: string = destNode;
  let guard = 0;
  while (guard++ < 200) {
    const p = prev[n];
    if (!p) break;
    if (p.node == null) {
      // first partial step on the start edge
      if (p.startForward) steps.unshift({ edge: se, forward: true, from: start.along, to: se.length });
      else steps.unshift({ edge: se, forward: false, from: start.along, to: 0 });
      break;
    }
    const adj = p.adj!;
    steps.unshift({ edge: adj.edge, forward: adj.forward, from: adj.forward ? 0 : adj.edge.length, to: adj.forward ? adj.edge.length : 0 });
    n = p.node;
  }
  // Special case: destination is an endpoint of the start edge and we are on it.
  const points: [number, number][] = [];
  let worldLength = 0;
  let km = 0;
  let minutes = 0;
  const majorEdges: string[] = [];
  for (const s of steps) {
    const a = Math.min(s.from, s.to), b = Math.max(s.from, s.to);
    const seg: [number, number][] = [];
    const p0 = pointAlong(s.edge, a);
    seg.push([p0.x, p0.z]);
    for (let i = 0; i < s.edge.cum.length; i++) {
      if (s.edge.cum[i] > a && s.edge.cum[i] < b) seg.push([s.edge.xs[i], s.edge.zs[i]]);
    }
    const p1 = pointAlong(s.edge, b);
    seg.push([p1.x, p1.z]);
    if (!s.forward) seg.reverse();
    if (points.length) seg.shift();
    points.push(...seg);
    const len = b - a;
    worldLength += len;
    km += (len * s.edge.def.compression) / 1000;
    minutes += edgeCostMinutes(s.edge, len);
    if ((s.edge.def.kind === 'highway' || s.edge.def.kind === 'mountain') && !majorEdges.includes(s.edge.def.id)) {
      majorEdges.push(s.edge.def.id);
    }
  }
  return { steps, points, worldLength, km, minutes, majorEdges, destNode };
}

/** Next maneuver along a route polyline from the closest point to (x, z). */
export function nextManeuver(route: Route, x: number, z: number): { index: number; distance: number; turn: 'left' | 'right' | 'straight' | 'arrive'; remaining: number; remainingKm: number } {
  const pts = route.points;
  let bi = 0;
  let bd = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const p = projectSegment(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (p.d2 < bd) { bd = p.d2; bi = i; }
  }
  // remaining distance
  let remaining = dist(x, z, pts[bi + 1][0], pts[bi + 1][1]);
  for (let i = bi + 1; i < pts.length - 1; i++) remaining += dist(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
  // find the next significant turn (> 35° within 40 m window)
  let acc = dist(x, z, pts[bi + 1][0], pts[bi + 1][1]);
  for (let i = bi + 1; i < pts.length - 2; i++) {
    const ax = pts[i][0] - pts[i - 1][0], az = pts[i][1] - pts[i - 1][1];
    const j = Math.min(pts.length - 1, i + 6);
    const bx = pts[j][0] - pts[i][0], bz = pts[j][1] - pts[i][1];
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    if (la > 0.1 && lb > 0.1) {
      const cos = (ax * bx + az * bz) / (la * lb);
      if (cos < Math.cos((40 * Math.PI) / 180)) {
        const cross = ax * bz - az * bx;
        const totalKm = route.km * (remaining / Math.max(1, route.worldLength));
        return { index: i, distance: acc, turn: cross > 0 ? 'right' : 'left', remaining, remainingKm: totalKm };
      }
    }
    acc += dist(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (acc > 900) break;
  }
  const totalKm = route.km * (remaining / Math.max(1, route.worldLength));
  return { index: pts.length - 1, distance: remaining, turn: remaining < 40 ? 'arrive' : 'straight', remaining, remainingKm: totalKm };
}
