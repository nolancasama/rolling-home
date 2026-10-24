import * as THREE from 'three';
import { CAMPGROUNDS, NODES, PARKING, TRAILS, type RoadKind } from '../data/map';
import { localToWorld } from '../sim/geo';
import { EDGES, type RoadEdge } from '../world/roads';
import { roadProfile, terrainHeight } from '../world/terrain';
import { GeoBuilder, MAT } from './builder';

// Road ribbons (asphalt, shoulders, skirts), lane markings, intersections,
// parking pads, campsite pads and walking trails.

const ROAD_COL: Record<RoadKind, { top: string; shoulder: string; skirt: string }> = {
  highway: { top: '#4b4c50', shoulder: '#8f8574', skirt: '#8a7658' },
  mountain: { top: '#505055', shoulder: '#8b8171', skirt: '#7e6e56' },
  street: { top: '#5a5a5e', shoulder: '#b3aa98', skirt: '#9a8a70' },
  dirt: { top: '#a8875e', shoulder: '#9a7d55', skirt: '#8a704c' },
  track: { top: '#9a7a52', shoulder: '#7f8a4c', skirt: '#6e7a44' },
};

const SHOULDER: Record<RoadKind, number> = { highway: 1.2, mountain: 1.0, street: 2.4, dirt: 0.8, track: 0.5 };

function edgeFrame(e: RoadEdge, i: number): { x: number; z: number; rx: number; rz: number } {
  const n = e.xs.length;
  const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
  let tx = e.xs[b] - e.xs[a], tz = e.zs[b] - e.zs[a];
  const l = Math.hypot(tx, tz) || 1;
  tx /= l;
  tz /= l;
  return { x: e.xs[i], z: e.zs[i], rx: -tz, rz: tx };
}

/** Paved junction disc radius (covers shoulders) and how many roads meet there. */
function nodeInfo(nodeId: string): { r: number; degree: number } {
  let r = 0;
  let paved = 0;
  let degree = 0;
  for (const e of EDGES) {
    const ends = (e.def.from === nodeId ? 1 : 0) + (e.def.to === nodeId ? 1 : 0);
    if (!ends) continue;
    degree += ends;
    if (e.def.kind !== 'dirt' && e.def.kind !== 'track') {
      paved += ends;
      r = Math.max(r, e.def.width / 2 + 0.8);
    }
  }
  return { r: paved ? r : 0, degree };
}

export function buildRoads(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'roads';
  const surf = new GeoBuilder();
  const marks = new GeoBuilder();
  const nodeR: Record<string, number> = {};
  for (const n of NODES) nodeR[n.id] = nodeInfo(n.id).r;
  const up = 0.03;
  for (const e of EDGES) {
    const hs = roadProfile(e);
    const k = e.def.kind;
    const half = e.def.width / 2;
    const sh = SHOULDER[k];
    const col = ROAD_COL[k];
    const offs = [-(half + sh + 2.2), -(half + sh), -half, half, half + sh, half + sh + 2.2];
    // shoulders sit a hair below the asphalt so crossing roads never z-fight
    const ys = [-0.7, -0.015, 0, 0, -0.015, -0.7];
    const cols = [col.skirt, col.shoulder, col.top, col.shoulder, col.skirt];
    // Overlapping ribbons at junctions are fine: asphalt is coplanar with asphalt
    // (same color) and the lowered shoulders/skirts always lose the depth test.
    const rows: THREE.Vector3[][] = [];
    for (let i = 0; i < e.xs.length; i++) {
      const f = edgeFrame(e, i);
      rows.push(offs.map((o, j) => new THREE.Vector3(f.x + f.rx * o, hs[i] + up + ys[j], f.z + f.rz * o)));
    }
    for (let i = 0; i < rows.length - 1; i++) {
      for (let j = 0; j < 5; j++) {
        const a = rows[i][j], b = rows[i][j + 1], c = rows[i + 1][j + 1], d = rows[i + 1][j];
        // a(left,i) b(right,i) c(right,i+1) d(left,i+1): counter-clockwise from above
        surf.quad4(a, b, c, d, cols[j]);
      }
    }
    // lane markings
    const fromR = nodeR[e.def.from], toR = nodeR[e.def.to];
    const markH = up + 0.012;
    const addLine = (offset: number, color: string, dash: number, gap: number, width = 0.13) => {
      let s = fromR + 1;
      const end = e.length - toR - 1;
      while (s < end) {
        const s1 = Math.min(end, s + dash);
        addStrip(marks, e, hs, s, s1, offset, width, markH, color);
        s = s1 + gap;
      }
    };
    if (k === 'highway') {
      addLine(0, '#e8c14a', 3, 6);
      addLine(-half + 0.35, '#eeeeee', 1e6, 0);
      addLine(half - 0.35, '#eeeeee', 1e6, 0);
    } else if (k === 'mountain') {
      addLine(-0.12, '#e8c14a', 1e6, 0, 0.11);
      addLine(0.12, '#e8c14a', 1e6, 0, 0.11);
      addLine(-half + 0.3, '#eeeeee', 1e6, 0);
      addLine(half - 0.3, '#eeeeee', 1e6, 0);
    } else if (k === 'street') {
      addLine(0, '#e8c14a', 2.5, 4);
    }
  }
  // intersections / turnarounds
  for (const n of NODES) {
    const r = nodeR[n.id];
    if (!r) continue;
    let h = 0, c = 0;
    let color = ROAD_COL.street.top;
    for (const e of EDGES) {
      const hs = roadProfile(e);
      if (e.def.from === n.id) { h += hs[0]; c++; if (e.def.kind !== 'street') color = ROAD_COL[e.def.kind].top; }
      if (e.def.to === n.id) { h += hs[hs.length - 1]; c++; if (e.def.kind !== 'street') color = ROAD_COL[e.def.kind].top; }
    }
    h /= Math.max(1, c);
    const deadEnd = c === 1;
    disc(surf, n.x, h + up + 0.008, n.z, deadEnd ? Math.max(r, 8) : r, color);
  }
  const roads = new THREE.Mesh(surf.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  roads.receiveShadow = true;
  roads.name = 'road-surface';
  group.add(roads);
  const lines = new THREE.Mesh(marks.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  lines.receiveShadow = true;
  group.add(lines);
  group.add(buildPads());
  group.add(buildTrails());
  return group;
}

function addStrip(b: GeoBuilder, e: RoadEdge, hs: Float64Array, s0: number, s1: number, offset: number, width: number, up: number, color: string) {
  const step = 3;
  let s = s0;
  let prev: THREE.Vector3[] | null = null;
  while (true) {
    const p = sampleAt(e, hs, s);
    const l = new THREE.Vector3(p.x + p.rx * (offset - width / 2), p.h + up, p.z + p.rz * (offset - width / 2));
    const r = new THREE.Vector3(p.x + p.rx * (offset + width / 2), p.h + up, p.z + p.rz * (offset + width / 2));
    if (prev) b.quad4(prev[0], prev[1], r, l, color);
    prev = [l, r];
    if (s >= s1) break;
    s = Math.min(s1, s + step);
  }
}

function sampleAt(e: RoadEdge, hs: Float64Array, s: number) {
  const cum = e.cum;
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const t = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
  const fa = edgeFrame(e, lo), fb = edgeFrame(e, hi);
  return {
    x: fa.x + (fb.x - fa.x) * t, z: fa.z + (fb.z - fa.z) * t, h: hs[lo] + (hs[hi] - hs[lo]) * t,
    rx: fa.rx + (fb.rx - fa.rx) * t, rz: fa.rz + (fb.rz - fa.rz) * t,
  };
}

function disc(b: GeoBuilder, x: number, y: number, z: number, r: number, color: string) {
  const seg = 24;
  const c = new THREE.Vector3(x, y, z);
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const p0 = new THREE.Vector3(x + Math.cos(a0) * r, y, z + Math.sin(a0) * r);
    const p1 = new THREE.Vector3(x + Math.cos(a1) * r, y, z + Math.sin(a1) * r);
    b.tri(c, p1, p0, color);
  }
}

/** Terrain-following rectangle (w along local X, l along local Z). */
export function padMesh(b: GeoBuilder, cx: number, cz: number, w: number, l: number, rot: number, color: string, up = 0.05, cell = 2) {
  const nx = Math.max(1, Math.ceil(w / cell)), nz = Math.max(1, Math.ceil(l / cell));
  const pts: THREE.Vector3[][] = [];
  for (let j = 0; j <= nz; j++) {
    const row: THREE.Vector3[] = [];
    for (let i = 0; i <= nx; i++) {
      const lx = -w / 2 + (w * i) / nx, lz = -l / 2 + (l * j) / nz;
      const [x, z] = localToWorld(lx, lz, cx, cz, rot);
      row.push(new THREE.Vector3(x, terrainHeight(x, z) + up, z));
    }
    pts.push(row);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) b.quad4(pts[j][i], pts[j + 1][i], pts[j + 1][i + 1], pts[j][i + 1], color);
}

function stripe(b: GeoBuilder, cx: number, cz: number, rot: number, lx0: number, lz0: number, lx1: number, lz1: number, width: number, color: string) {
  const dx = lx1 - lx0, dz = lz1 - lz0;
  const len = Math.hypot(dx, dz);
  const nx = (-dz / len) * (width / 2), nz = (dx / len) * (width / 2);
  const corners = [
    [lx0 + nx, lz0 + nz], [lx1 + nx, lz1 + nz], [lx1 - nx, lz1 - nz], [lx0 - nx, lz0 - nz],
  ].map(([a, c]) => {
    const [x, z] = localToWorld(a, c, cx, cz, rot);
    return new THREE.Vector3(x, terrainHeight(x, z) + 0.075, z);
  });
  b.quad4(corners[0], corners[1], corners[2], corners[3], color);
}

const PAD_COLOR = { asphalt: '#55565a', gravel: '#a89a82', concrete: '#b8b4aa' } as const;

function buildPads(): THREE.Mesh {
  const b = new GeoBuilder();
  for (const pk of PARKING) {
    padMesh(b, pk.x, pk.z, pk.w, pk.l, pk.rot, PAD_COLOR[pk.surface]);
    if (pk.bays > 0) {
      // bays along the local X edge (+Z side): stalls run lengthwise in Z
      const bayW = pk.rv ? 4.6 : 3.2;
      const n = Math.min(pk.bays, Math.floor(pk.w / bayW));
      const depth = Math.min(pk.l * 0.42, pk.rv ? 12 : 6);
      for (let i = 0; i <= n; i++) {
        const lx = -pk.w / 2 + 1 + i * bayW;
        stripe(b, pk.x, pk.z, pk.rot, lx, -pk.l / 2 + 0.6, lx, -pk.l / 2 + 0.6 + depth, 0.12, '#e8e8e2');
      }
    }
  }
  for (const camp of CAMPGROUNDS) {
    for (const s of camp.sites) {
      const color = camp.kind === 'resort' ? '#5c5d61' : camp.kind === 'dispersed' ? '#b98a62' : camp.kind === 'truckstop' ? '#c2beb4' : '#a99a7c';
      if (camp.kind === 'dispersed' || camp.kind === 'hidden') continue;
      padMesh(b, s.x, s.z, s.width, s.length, s.heading, color, camp.kind === 'truckstop' ? 0.09 : 0.065);
      stripe(b, s.x, s.z, s.heading, -s.width / 2, -s.length / 2, -s.width / 2, s.length / 2, 0.12, '#e6e2d6');
      stripe(b, s.x, s.z, s.heading, s.width / 2, -s.length / 2, s.width / 2, s.length / 2, 0.12, '#e6e2d6');
    }
  }
  const m = new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  m.receiveShadow = true;
  m.name = 'pads';
  return m;
}

function buildTrails(): THREE.Mesh {
  const b = new GeoBuilder();
  for (const t of TRAILS) {
    const pts: [number, number][] = [];
    for (let i = 0; i < t.points.length - 1; i++) {
      const [ax, az] = t.points[i], [bx, bz] = t.points[i + 1];
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
      for (let k = 0; k < n; k++) pts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    pts.push(t.points[t.points.length - 1]);
    let prev: THREE.Vector3[] | null = null;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], c = pts[Math.min(pts.length - 1, i + 1)];
      let tx = c[0] - a[0], tz = c[1] - a[1];
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
      const [x, z] = pts[i];
      const w = t.width / 2;
      const L = new THREE.Vector3(x + tz * w, 0, z - tx * w);
      const R = new THREE.Vector3(x - tz * w, 0, z + tx * w);
      L.y = terrainHeight(L.x, L.z) + 0.06;
      R.y = terrainHeight(R.x, R.z) + 0.06;
      if (prev) b.quad4(prev[0], prev[1], R, L, '#a08060');
      prev = [L, R];
    }
  }
  const m = new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  m.receiveShadow = true;
  return m;
}

void MAT;
