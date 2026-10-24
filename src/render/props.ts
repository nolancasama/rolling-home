import * as THREE from 'three';
import { EVENTS } from '../data/content';
import {
  ANCHORS, CAMPGROUNDS, DECKS, GATES, NODE_BY_ID, PLACES, WORLD, type AnchorDef,
} from '../data/map';
import { localToWorld } from '../sim/geo';
import { cellRandom, fbm } from '../world/noise';
import { EDGES, nearestRoad, routeTo } from '../world/roads';
import { isOpenGround, plateauMask, roadProfile, terrainHeight } from '../world/terrain';
import type { CollisionWorld } from '../game/collision';
import { GeoBuilder, MAT, shade } from './builder';
import { glowTexture, signAtlas } from './textures';

// Instanced vegetation and rocks plus merged town/camp furniture.

export interface PropsView {
  group: THREE.Group;
  lampHeads: THREE.InstancedMesh;
  lampMat: THREE.MeshStandardMaterial;
  lampPools: THREE.InstancedMesh;
  market: THREE.Group;
  campfire: THREE.Group;
  /** Instanced vegetation and rock tiles (distance-culled each frame). */
  tiles: THREE.InstancedMesh[];
}

function pineGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0, 1.0, 0, 0.22, 2.0, '#6a4a32', 8, 0, 0, 0, 0.16);
  const greens = ['#3f6a44', '#36603e', '#2f5838'];
  [[2.1, 2.4, 3.6], [3.6, 1.9, 3.2], [5.0, 1.35, 2.8], [6.2, 0.8, 2.0]].forEach(([y, r, h], i) => b.cone(0, y, 0, r, h, greens[i % 3], 8, i * 0.4));
  return b.build();
}

function aspenGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0, 1.8, 0, 0.16, 3.6, '#e8e2d4', 8, 0, 0, 0, 0.11);
  b.sphere(0, 4.4, 0, 1.6, 1.9, 1.6, '#ffffff', 1);
  b.sphere(0.7, 3.7, 0.4, 1.1, 1.2, 1.1, '#f2f2f2', 1);
  b.sphere(-0.6, 3.9, -0.5, 1.0, 1.1, 1.0, '#e8e8e8', 1);
  return b.build();
}

function saguaroGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const g = '#5f8a4a';
  b.cyl(0, 2.4, 0, 0.32, 4.8, g, 12);
  b.sphere(0, 4.8, 0, 0.32, 0.3, 0.32, g, 1);
  b.cyl(0.62, 2.2, 0, 0.2, 0.9, g, 8, 0, Math.PI / 2);
  b.cyl(1.0, 3.0, 0, 0.21, 1.7, g, 8);
  b.sphere(1.0, 3.85, 0, 0.21, 0.2, 0.21, g, 1);
  b.cyl(-0.55, 2.9, 0, 0.18, 0.8, g, 8, 0, Math.PI / 2);
  b.cyl(-0.9, 3.5, 0, 0.18, 1.3, g, 8);
  b.sphere(-0.9, 4.15, 0, 0.18, 0.17, 0.18, g, 1);
  return b.build();
}

function joshuaGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const trunk = '#7a6a52';
  b.cyl(0, 1.2, 0, 0.22, 2.4, trunk, 8);
  const arms: [number, number, number][] = [[0.8, 0.5, 0.4], [-0.7, -0.6, 0.6], [0.2, 0.9, -0.5]];
  for (const [dx, dz, t] of arms) {
    b.cyl(dx * 0.5, 2.7, dz * 0.5, 0.14, 1.4, trunk, 8, dz * 0.6, -dx * 0.6);
    b.sphere(dx, 3.2 + t * 0.3, dz, 0.55, 0.45, 0.55, '#6f8a52', 0);
  }
  b.sphere(0, 2.8, 0, 0.6, 0.5, 0.6, '#6f8a52', 0);
  return b.build();
}

function shrubGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.sphere(0, 0.35, 0, 0.7, 0.5, 0.7, '#8a9a6a', 0);
  b.sphere(0.45, 0.3, 0.2, 0.45, 0.38, 0.45, '#7a8a5a', 0);
  b.sphere(-0.35, 0.28, -0.25, 0.42, 0.33, 0.42, '#94a070', 0);
  return b.build();
}

function rockGeo(seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 0.75 + 0.45 * cellRandom(Math.round(x * 10) + seed, Math.round(y * 10 + z * 7), 5);
    p.setXYZ(i, x * n * 1.2, Math.max(-0.3, y * n * 0.75), z * n);
  }
  g.computeVertexNormals();
  const b = new GeoBuilder();
  b.addGeometry(g, new THREE.Matrix4(), '#ffffff');
  return b.build();
}

function hoodooGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const reds = ['#b5603a', '#c4744a', '#a85432'];
  b.cyl(0, 2, 0, 1.4, 4, reds[0], 8, 0, 0, 0, 1.0);
  b.cyl(0, 5, 0, 1.0, 2.2, reds[1], 8, 0, 0, 0.4, 0.8);
  b.cyl(0, 6.6, 0, 0.75, 1.2, reds[2], 8, 0, 0, 0.8, 0.55);
  b.cyl(0, 7.5, 0, 1.15, 0.6, '#8a4a30', 8, 0, 0, 0.2, 1.05);
  return b.build();
}

interface Inst {
  x: number;
  y: number;
  z: number;
  s: number;
  ry: number;
  color: THREE.Color;
}

/** Hide instanced vegetation/rock tiles that lie entirely beyond `maxDist` (past the fog they render as fog). */
export function cullProps(p: PropsView, x: number, z: number, maxDist: number) {
  for (const m of p.tiles) {
    const s = m.boundingSphere!;
    m.visible = Math.hypot(s.center.x - x, s.center.z - z) - s.radius < maxDist;
  }
}

function instanced(geo: THREE.BufferGeometry, list: Inst[], mat: THREE.Material, shadows: boolean, tile = 450): THREE.Group {
  const group = new THREE.Group();
  const buckets = new Map<string, Inst[]>();
  for (const it of list) {
    const k = `${Math.floor(it.x / tile)},${Math.floor(it.z / tile)}`;
    let l = buckets.get(k);
    if (!l) buckets.set(k, (l = []));
    l.push(it);
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const l of buckets.values()) {
    const mesh = new THREE.InstancedMesh(geo, mat, l.length);
    l.forEach((it, i) => {
      q.setFromAxisAngle(up, it.ry);
      m4.compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(it.s, it.s, it.s));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, it.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

function slopeAt(x: number, z: number): number {
  const a = terrainHeight(x - 2, z), b = terrainHeight(x + 2, z);
  const c = terrainHeight(x, z - 2), d = terrainHeight(x, z + 2);
  return Math.hypot(b - a, d - c) / 4;
}

export function buildProps(collision: CollisionWorld, density: number): PropsView {
  const group = new THREE.Group();
  group.name = 'props';
  const pines: Inst[] = [], aspens: Inst[] = [], saguaros: Inst[] = [], joshuas: Inst[] = [];
  const shrubs: Inst[] = [], rocks: Inst[] = [], rocks2: Inst[] = [], hoodoos: Inst[] = [];
  const golds = ['#e8b83c', '#f0c84a', '#d8a030', '#9ab85a', '#c8b040'].map((c) => new THREE.Color(c));
  const rockCols = ['#b07a5a', '#a06a4c', '#8a7a6a', '#c08a62', '#9a8270'].map((c) => new THREE.Color(c));
  const rnd = (i: number, j: number, salt: number) => cellRandom(i, j, salt);
  const tint = (base: THREE.Color, f: number) => base.clone().multiplyScalar(f);
  const white = new THREE.Color(1, 1, 1);
  const x0 = WORLD.playMinX - 60, x1 = WORLD.playMaxX + 60, z0 = WORLD.playMinZ - 60, z1 = WORLD.playMaxZ + 60;

  // forest: dense grid on the plateau
  const FC = 10 / Math.sqrt(density);
  for (let i = Math.floor(x0 / FC); i < x1 / FC; i++) {
    for (let j = Math.floor(z0 / FC); j < z1 / FC; j++) {
      const x = (i + rnd(i, j, 1)) * FC, z = (j + rnd(i, j, 2)) * FC;
      const pm = plateauMask(x, z);
      if (pm < 0.3) continue;
      const clump = fbm(x / 90, z / 90, 2, 77) * 0.5 + 0.5;
      const p = rnd(i, j, 3);
      if (p > 0.3 + clump * 0.55 * Math.min(1, (pm - 0.3) * 2.5)) continue;
      if (slopeAt(x, z) > 0.85) continue;
      if (!isOpenGround(x, z, 1.5)) continue;
      const y = terrainHeight(x, z);
      const lakeD = Math.hypot((x + 150) / 1.6, z + 1260);
      const s = 0.8 + rnd(i, j, 4) * 0.75;
      if (lakeD < 230 && rnd(i, j, 5) < 0.42) {
        aspens.push({ x, y, z, s, ry: rnd(i, j, 6) * 6.28, color: golds[Math.floor(rnd(i, j, 7) * golds.length)] });
        collision.addCircle(x, z, 0.25 * s, y, y + 8, 'tree');
      } else {
        pines.push({ x, y, z, s: s * 1.15, ry: rnd(i, j, 6) * 6.28, color: tint(white, 0.85 + rnd(i, j, 8) * 0.3) });
        collision.addCircle(x, z, 0.32 * s, y, y + 12, 'tree');
      }
    }
  }
  // desert: sparse grid
  const DC = 15 / Math.sqrt(density);
  for (let i = Math.floor(x0 / DC); i < x1 / DC; i++) {
    for (let j = Math.floor(z0 / DC); j < z1 / DC; j++) {
      const x = (i + rnd(i, j, 11)) * DC, z = (j + rnd(i, j, 12)) * DC;
      const pm = plateauMask(x, z);
      if (pm > 0.32) continue;
      const p = rnd(i, j, 13);
      if (p > 0.55) continue;
      if (!isOpenGround(x, z, 1)) continue;
      const y = terrainHeight(x, z);
      const ry = rnd(i, j, 14) * 6.28;
      const s = 0.7 + rnd(i, j, 15) * 0.7;
      if (p < 0.06 && x < 300) {
        saguaros.push({ x, y, z, s, ry, color: tint(white, 0.85 + rnd(i, j, 16) * 0.25) });
        collision.addCircle(x, z, 0.35 * s, y, y + 5, 'cactus');
      } else if (p < 0.09 && x > -200) {
        joshuas.push({ x, y, z, s, ry, color: white });
        collision.addCircle(x, z, 0.3 * s, y, y + 4, 'tree');
      } else if (p < 0.13) {
        const big = rnd(i, j, 17) > 0.8;
        (big ? rocks2 : rocks).push({ x, y: y - 0.1, z, s: big ? s * 2.4 : s * 0.9, ry, color: rockCols[Math.floor(rnd(i, j, 18) * rockCols.length)] });
        if (big) collision.addCircle(x, z, 1.4 * s * 2.4 * 0.75, y - 1, y + 3 * s, 'rock');
      } else if (p < 0.45) {
        shrubs.push({ x, y, z, s: s * 0.9, ry, color: tint(white, 0.8 + rnd(i, j, 19) * 0.35) });
      }
    }
  }
  // Red Rock hoodoos
  const rr = PLACES.find((p) => p.id === 'redrock')!;
  for (let k = 0; k < 26; k++) {
    const a = cellRandom(k, 1, 31) * Math.PI * 2;
    const d = 40 + cellRandom(k, 2, 31) * 110;
    const x = rr.x + Math.cos(a) * d, z = rr.z + Math.sin(a) * d;
    if (!isOpenGround(x, z, 5)) continue;
    const y = terrainHeight(x, z);
    const s = 0.8 + cellRandom(k, 3, 31) * 1.6;
    hoodoos.push({ x, y: y - 0.3, z, s, ry: a, color: white });
    collision.addCircle(x, z, 1.3 * s, y - 1, y + 8 * s, 'rock');
  }
  // the narrow gate on the logging track
  for (const g of GATES) {
    for (const side of [-1, 1]) {
      const [x, z] = localToWorld(side * (g.gap / 2 + 1.5), 0, g.x, g.z, g.heading);
      const y = terrainHeight(x, z);
      rocks2.push({ x, y: y - 0.2, z, s: 1.55, ry: side, color: rockCols[2] });
      collision.addBox(x, z, 1.5, 1.6, g.heading, y - 1, y + 3, 'gate');
    }
  }
  const lam = new THREE.MeshLambertMaterial({ vertexColors: true });
  const tiles: THREE.InstancedMesh[] = [];
  for (const sp of [
    instanced(pineGeo(), pines, lam, true),
    instanced(aspenGeo(), aspens, lam, true),
    instanced(saguaroGeo(), saguaros, lam, true),
    instanced(joshuaGeo(), joshuas, lam, true),
    instanced(shrubGeo(), shrubs, lam, false),
    instanced(rockGeo(3), rocks, lam, false),
    instanced(rockGeo(7), rocks2, lam, true),
    instanced(hoodooGeo(), hoodoos, lam, true),
  ]) {
    group.add(sp);
    for (const m of sp.children) tiles.push(m as THREE.InstancedMesh);
  }

  const town = buildTownProps(collision);
  group.add(town.mesh);
  group.add(town.lamps);
  group.add(town.pools);
  group.add(town.signs);
  group.add(town.wires);
  const market = buildMarket(collision);
  group.add(market);
  const campfire = buildCampfire();
  group.add(campfire);
  return { group, lampHeads: town.lamps, lampMat: town.lampMat, lampPools: town.pools, market, campfire, tiles };
}

// ───────────── town & camp furniture ─────────────

function pump(b: GeoBuilder, a: AnchorDef, c: CollisionWorld) {
  const y = terrainHeight(a.x, a.z);
  b.base = new THREE.Matrix4().makeTranslation(a.x, y, a.z);
  b.boxOn(0, 0, 0, 1.6, 0.25, 0.9, '#c8c4bc');
  b.boxOn(0, 0.25, 0, 0.7, 1.8, 0.5, '#e8e4dc');
  b.box(0, 1.6, 0.26, 0.5, 0.35, 0.04, '#2a3a4a');
  b.box(0, 2.15, 0, 0.75, 0.25, 0.55, '#c23a2c');
  b.box(0.42, 1.2, 0, 0.12, 0.5, 0.12, '#2a2a2a');
  b.base = null;
  c.addBox(a.x, a.z, 0.8, 0.45, 0, y, y + 2.3, 'pump');
}

function dumpStation(b: GeoBuilder, a: AnchorDef) {
  const y = terrainHeight(a.x, a.z);
  b.base = new THREE.Matrix4().makeTranslation(a.x, y, a.z);
  b.boxOn(0, 0, 0, 2.6, 0.12, 2.6, '#a8a49a');
  b.cyl(0, 0.14, 0, 0.32, 0.06, '#3a3a3a', 12);
  b.cyl(0, 0.17, 0, 0.36, 0.02, '#6a6a6a', 12);
  b.cyl(1.2, 0.6, -1.0, 0.06, 1.2, '#3a7a3a', 8);
  b.box(1.2, 1.2, -1.0, 0.25, 0.08, 0.08, '#3a7a3a');
  b.boxOn(-1.4, 0, -1.2, 0.08, 1.6, 0.08, '#5a5a5a');
  b.box(-1.4, 1.75, -1.2, 0.9, 0.5, 0.05, '#2a5a8a');
  b.base = null;
}

function spigot(b: GeoBuilder, a: AnchorDef) {
  const y = terrainHeight(a.x, a.z);
  b.base = new THREE.Matrix4().makeTranslation(a.x, y, a.z);
  b.cyl(0, 0.5, 0, 0.07, 1.0, '#2a5aa8', 8);
  b.box(0.1, 0.85, 0, 0.18, 0.06, 0.06, '#c0c0c0');
  b.boxOn(0, 0, 0, 0.5, 0.06, 0.5, '#a8a49a');
  b.base = null;
}

function propaneTank(b: GeoBuilder, a: AnchorDef, c: CollisionWorld) {
  const y = terrainHeight(a.x, a.z);
  b.base = new THREE.Matrix4().makeTranslation(a.x, y, a.z);
  b.cyl(0, 1.0, 0, 0.55, 2.2, '#f0f0ea', 12, 0, Math.PI / 2);
  b.sphere(1.1, 1.0, 0, 0.55, 0.55, 0.55, '#f0f0ea', 1);
  b.sphere(-1.1, 1.0, 0, 0.55, 0.55, 0.55, '#f0f0ea', 1);
  for (const x of [-0.7, 0.7]) b.boxOn(x, 0, 0, 0.12, 0.5, 0.8, '#7a7a7a');
  b.base = null;
  c.addBox(a.x, a.z, 1.7, 0.6, 0, y, y + 1.6, 'tank');
}

function jobBoard(b: GeoBuilder, a: AnchorDef, rot: number, c: CollisionWorld) {
  const y = terrainHeight(a.x, a.z);
  b.base = new THREE.Matrix4().compose(new THREE.Vector3(a.x, y, a.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(1, 1, 1));
  for (const x of [-0.8, 0.8]) b.boxOn(x, 0, 0, 0.12, 2.2, 0.12, '#6a4a2a');
  b.box(0, 1.55, 0.02, 1.9, 1.2, 0.08, '#b88a5a');
  const papers = ['#f4f0e6', '#f0e0a0', '#e0f0f4', '#f8d8c8'];
  for (let i = 0; i < 6; i++) b.box(-0.6 + (i % 3) * 0.6, 1.3 + Math.floor(i / 3) * 0.5, 0.08, 0.42, 0.36, 0.01, papers[i % 4], 0, 0, (i % 2 ? 0.08 : -0.06));
  b.box(0, 2.25, 0.05, 2.1, 0.12, 0.3, '#5a3a24');
  b.base = null;
  c.addBox(a.x, a.z, 1.0, 0.15, rot, y, y + 2.3, 'board');
}

function pedestal(b: GeoBuilder, x: number, z: number, sewer: boolean, siteX: number, siteZ: number, heading: number, c: CollisionWorld) {
  const y = terrainHeight(x, z);
  b.base = new THREE.Matrix4().makeTranslation(x, y, z);
  b.boxOn(0, 0, 0, 0.35, 1.15, 0.3, '#8a8f94');
  b.box(0, 0.95, 0.16, 0.26, 0.3, 0.03, '#3a3e44');
  b.box(0, 1.2, 0, 0.42, 0.08, 0.36, '#6a6f74');
  b.cyl(0.3, 0.35, 0, 0.05, 0.7, '#2a5aa8', 8);
  b.box(0.36, 0.62, 0, 0.12, 0.05, 0.05, '#c0c0c0');
  b.base = null;
  c.addBox(x, z, 0.22, 0.2, 0, y, y + 1.3, 'pedestal');
  if (sewer) {
    const [sx, sz] = localToWorld(-1.0, -2, siteX, siteZ, heading);
    const sy = terrainHeight(sx, sz);
    b.base = new THREE.Matrix4().makeTranslation(sx, sy, sz);
    b.cyl(0, 0.08, 0, 0.12, 0.16, '#4a4a4a', 8);
    b.base = null;
  }
}

function picnic(b: GeoBuilder, x: number, z: number, rot: number, c: CollisionWorld) {
  const y = terrainHeight(x, z);
  b.base = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(1, 1, 1));
  b.boxOn(0, 0.72, 0, 1.8, 0.06, 0.75, '#9a6a3a');
  for (const sz of [-0.62, 0.62]) b.boxOn(0, 0.42, sz, 1.8, 0.05, 0.28, '#8a5a32');
  for (const sx of [-0.7, 0.7]) {
    b.box(sx, 0.38, 0, 0.08, 0.8, 1.4, '#7a4a2a', 0, 0.0);
  }
  b.base = null;
  c.addBox(x, z, 0.95, 0.8, rot, y, y + 0.8, 'table');
}

function fireRing(b: GeoBuilder, x: number, z: number) {
  const y = terrainHeight(x, z);
  b.base = new THREE.Matrix4().makeTranslation(x, y, z);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    b.sphere(Math.cos(a) * 0.6, 0.12, Math.sin(a) * 0.6, 0.18, 0.14, 0.18, i % 2 ? '#7a7470' : '#8a8480', 0);
  }
  b.cyl(0, 0.03, 0, 0.5, 0.04, '#2a2624', 12);
  b.base = null;
}

function streetLamp(b: GeoBuilder, heads: THREE.Matrix4[], x: number, z: number, faceRot: number, c: CollisionWorld) {
  const y = terrainHeight(x, z);
  b.base = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), faceRot), new THREE.Vector3(1, 1, 1));
  b.cyl(0, 3.0, 0, 0.09, 6.0, '#3a3e44', 8);
  b.box(0, 5.9, 0.7, 0.08, 0.08, 1.4, '#3a3e44');
  b.base = null;
  const [hx, hz] = localToWorld(0, 1.35, x, z, faceRot);
  heads.push(new THREE.Matrix4().makeTranslation(hx, y + 5.78, hz));
  c.addCircle(x, z, 0.15, y, y + 6, 'pole');
}

function buildTownProps(c: CollisionWorld) {
  const b = new GeoBuilder();
  const heads: THREE.Matrix4[] = [];
  // service fixtures from anchors
  for (const a of ANCHORS) {
    if (a.kind === 'fuel') pump(b, a, c);
    else if (a.kind === 'dump') dumpStation(b, a);
    else if (a.kind === 'water') spigot(b, a);
    else if (a.kind === 'propane') propaneTank(b, a, c);
    else if (a.kind === 'jobboard') {
      const p = NODE_BY_ID[PLACES.find((pl) => pl.id === a.place)?.node ?? 'dj_c'];
      void p;
      const rot = a.id === 'dj_board' ? -Math.PI / 2 : a.id === 'pl_board' ? Math.PI : Math.PI;
      jobBoard(b, a, rot, c);
    }
  }
  // campground furniture
  for (const camp of CAMPGROUNDS) {
    for (const s of camp.sites) {
      if (s.pedestal) pedestal(b, s.pedestal.x, s.pedestal.z, s.sewer, s.x, s.z, s.heading, c);
      if (camp.kind === 'campground' || camp.kind === 'hidden' || camp.kind === 'dispersed') {
        const [tx, tz] = localToWorld(s.width / 2 + 3.0, 1.5, s.x, s.z, s.heading);
        if (camp.kind === 'campground') picnic(b, tx, tz, s.heading, c);
        if (s.fireRing) {
          const [fx, fz] = localToWorld(s.width / 2 + 3.4, -2.6, s.x, s.z, s.heading);
          fireRing(b, fx, fz);
        }
        if (camp.kind === 'campground') {
          const [px, pz] = localToWorld(-s.width / 2 - 0.4, s.length / 2 + 0.4, s.x, s.z, s.heading);
          const y = terrainHeight(px, pz);
          b.base = new THREE.Matrix4().makeTranslation(px, y, pz);
          b.boxOn(0, 0, 0, 0.14, 0.9, 0.14, '#6a4a2a');
          b.box(0, 0.8, 0.08, 0.28, 0.2, 0.02, '#f4f0e6');
          b.base = null;
        }
      }
    }
  }
  // community fire circle benches
  for (const ev of EVENTS.filter((e) => e.id === 'campfire_night')) {
    fireRing(b, ev.x, ev.z);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = ev.x + Math.cos(a) * 3.2, z = ev.z + Math.sin(a) * 3.2;
      const y = terrainHeight(x, z);
      b.cyl(x, y + 0.22, z, 0.22, 1.6, '#7a5434', 8, 0, Math.PI / 2, -a + Math.PI / 2);
    }
  }
  // street lamps along town streets
  for (const e of EDGES) {
    if (e.def.kind !== 'street' || e.def.id.startsWith('pl_cg')) continue;
    const step = 32;
    for (let s = 14; s < e.length - 10; s += step) {
      const i = e.cum.findIndex((v) => v >= s);
      if (i < 1) continue;
      const tx = e.xs[i] - e.xs[i - 1], tz = e.zs[i] - e.zs[i - 1];
      const l = Math.hypot(tx, tz) || 1;
      const rx = -tz / l, rz = tx / l;
      const off = e.def.width / 2 + 2.6;
      for (const side of [-1, 1]) {
        const x = e.xs[i] + rx * off * side, z = e.zs[i] + rz * off * side;
        if (c.pointBlocked(x, z, terrainHeight(x, z) + 1, 0.6)) continue;
        const face = Math.atan2(-rx * side, -rz * side);
        streetLamp(b, heads, x, z, face, c);
      }
    }
  }
  // utility poles + wires along highways
  const wire: number[] = [];
  for (const e of EDGES) {
    if (e.def.kind !== 'highway') continue;
    const hs = roadProfile(e);
    let prevTop: THREE.Vector3[] | null = null;
    for (let s = 20; s < e.length - 20; s += 58) {
      const i = e.cum.findIndex((v) => v >= s);
      const tx = e.xs[i] - e.xs[i - 1], tz = e.zs[i] - e.zs[i - 1];
      const l = Math.hypot(tx, tz) || 1;
      const rx = -tz / l, rz = tx / l;
      const x = e.xs[i] + rx * (e.def.width / 2 + 7), z = e.zs[i] + rz * (e.def.width / 2 + 7);
      const y = Math.min(terrainHeight(x, z), hs[i] + 1);
      b.cyl(x, y + 4.5, z, 0.14, 9, '#6a5440', 8);
      b.box(x, y + 8.4, z, 0.12, 0.12, 2.2, '#6a5440', Math.atan2(tx, tz) + Math.PI / 2);
      c.addCircle(x, z, 0.2, y, y + 9, 'pole');
      const tops = [-0.9, 0.9].map((o) => new THREE.Vector3(x + rx * o, y + 8.55, z + rz * o));
      if (prevTop) for (let k = 0; k < 2; k++) wire.push(prevTop[k].x, prevTop[k].y, prevTop[k].z, tops[k].x, tops[k].y, tops[k].z);
      prevTop = tops;
    }
  }
  // pier
  for (const d of DECKS) {
    b.box(d.x, d.y - 0.1, d.z, d.w, 0.16, d.l, '#9a7448');
    for (let k = -d.l / 2 + 1; k <= d.l / 2 - 1; k += 3) {
      for (const sx of [-d.w / 2 + 0.15, d.w / 2 - 0.15]) b.cyl(d.x + sx, d.y - 1.6, d.z + k, 0.1, 3.0, '#6a5030', 8);
    }
    for (let k = -d.l / 2; k <= d.l / 2; k += 0.5) b.box(d.x, d.y + 0.0, d.z + k, d.w, 0.02, 0.06, '#7a5a38');
  }
  // canoe rack
  {
    const x = -276, z = -1104, y = terrainHeight(x, z);
    b.boxOn(x - 1.6, y, z, 0.12, 1.2, 0.12, '#6a4a2a');
    b.boxOn(x + 1.6, y, z, 0.12, 1.2, 0.12, '#6a4a2a');
    const cols = ['#c8553d', '#2f7a8a', '#e8b83c'];
    cols.forEach((col, i) => b.sphere(x, y + 0.5 + i * 0.32, z, 2.4, 0.16, 0.38, col, 1));
  }
  // firewood pile and rack (odd job)
  {
    const pile = [88, -1110], rack = [46, -1104];
    let y = terrainHeight(pile[0], pile[1]);
    for (let k = 0; k < 14; k++) b.cyl(pile[0] + (k % 5) * 0.32 - 0.6, y + 0.15 + Math.floor(k / 5) * 0.28, pile[1], 0.14, 1.0, '#8a5a32', 8, Math.PI / 2, 0, 0.3);
    y = terrainHeight(rack[0], rack[1]);
    b.boxOn(rack[0], y, rack[1], 2.2, 0.08, 0.7, '#6a4a2a');
    for (const sx of [-1.05, 1.05]) b.boxOn(rack[0] + sx, y, rack[1], 0.1, 1.4, 0.7, '#6a4a2a');
    c.addBox(rack[0], rack[1], 1.1, 0.35, 0, y, y + 1.4, 'rack');
  }
  // water tower in Dusty Junction
  {
    const x = -1000, z = 620, y = terrainHeight(x, z);
    for (const [lx, lz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) b.cyl(x + lx, y + 6, z + lz, 0.18, 12, '#8a6a4a', 8, lz * 0.03, -lx * 0.03);
    b.cyl(x, y + 14, z, 3.4, 4.6, '#c8d0d4', 16);
    b.cone(x, y + 17.2, z, 3.6, 1.8, '#8a959c', 8);
    c.addCircle(x, z, 2.8, y, y + 12, 'tower');
  }
  // salvage yard junk + fence
  {
    const cx = -935, cz = 782;
    const junk: [number, number, string][] = [[-944, 770, '#8a4a32'], [-946, 790, '#6a7a8a'], [-938, 798, '#a88a4a']];
    for (const [x, z, col] of junk) {
      const y = terrainHeight(x, z);
      b.boxOn(x, y + 0.3, z, 1.8, 0.8, 4.0, shade(col, 0.8), 0.4);
      b.boxOn(x, y + 1.1, z - 0.2, 1.6, 0.6, 2.0, col, 0.4);
      c.addBox(x, z, 0.9, 2.0, 0.4, y, y + 1.8, 'junk');
    }
    for (let k = 0; k < 5; k++) b.cyl(-950 + k * 0.4, terrainHeight(-950, 806) + 0.2 + (k % 2) * 0.4, 806, 0.4, 0.3, '#2a2a2a', 12);
    for (let x = cx - 18; x <= cx - 8; x += 2.5) b.boxOn(x, terrainHeight(x, 768), 768, 0.08, 1.8, 0.08, '#8a8a8a');
  }
  // Rattlesnake Rick's giant snake
  {
    const x = -318, z = 772, y = terrainHeight(x, z);
    for (let k = 0; k < 14; k++) {
      const a = k * 0.62;
      const r = 3.2 - k * 0.12;
      b.sphere(x + Math.cos(a) * r, y + 0.6 + k * 0.18, z + Math.sin(a) * r, 0.75, 0.62, 0.75, k % 2 ? '#7a9a3a' : '#c8b040', 1);
    }
    b.sphere(x + 0.5, y + 3.6, z, 0.9, 0.7, 1.3, '#7a9a3a', 1);
    b.box(x + 0.5, y + 3.4, z + 1.25, 0.08, 0.06, 0.5, '#c23a2c');
    c.addCircle(x, z, 3.6, y, y + 4, 'statue');
  }
  // overlook railings
  for (const [px, pz, rot] of [[-752, -430, 0.55], [556, -636, 0.75]] as [number, number, number][]) {
    for (let k = -6; k <= 6; k += 1.5) {
      const [x, z] = localToWorld(k, 0, px, pz, rot);
      const y = terrainHeight(x, z);
      b.boxOn(x, y, z, 0.12, 1.0, 0.12, '#6a4a2a');
      c.addCircle(x, z, 0.12, y, y + 1, 'rail');
    }
    const [ax, az] = localToWorld(-6, 0, px, pz, rot), [bx, bz] = localToWorld(6, 0, px, pz, rot);
    const ay = terrainHeight(ax, az), by = terrainHeight(bx, bz);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    b.box(mx, (ay + by) / 2 + 0.95, mz, 12.2, 0.1, 0.12, '#7a5434', rot);
    b.box(mx, (ay + by) / 2 + 0.55, mz, 12.2, 0.08, 0.1, '#7a5434', rot);
    c.addBox(mx, mz, 6.1, 0.12, rot, Math.min(ay, by), Math.max(ay, by) + 1.1, 'rail');
  }
  // Mesa City plaza
  {
    const x = 1176, z = 245, y = terrainHeight(x, z);
    b.cyl(x, y + 0.3, z - 6, 2.2, 0.6, '#c8c0b0', 16);
    b.cyl(x, y + 0.62, z - 6, 1.9, 0.05, '#4a8aa8', 16);
    b.cyl(x, y + 1.1, z - 6, 0.25, 1.4, '#c8c0b0', 8);
    for (const [bx2, bz2, r] of [[x - 6, z - 6, Math.PI / 2], [x + 6, z - 6, -Math.PI / 2], [x, z - 12, 0]] as [number, number, number][]) {
      b.boxOn(bx2, terrainHeight(bx2, bz2) + 0.42, bz2, 1.8, 0.08, 0.5, '#8a6a4a', r);
    }
    c.addCircle(x, z - 6, 2.3, y, y + 1.5, 'fountain');
  }
  const mesh = new THREE.Mesh(b.build(), MAT.vc);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'town-props';
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffc870, emissiveIntensity: 0, roughness: 0.5 });
  const headGeo = new THREE.SphereGeometry(0.28, 8, 6);
  const lamps = new THREE.InstancedMesh(headGeo, lampMat, Math.max(1, heads.length));
  heads.forEach((m, i) => lamps.setMatrixAt(i, m));
  lamps.count = heads.length;
  lamps.instanceMatrix.needsUpdate = true;
  lamps.computeBoundingSphere();
  // night light pools under the lamps: additive ground decals instead of real lights
  const poolMat = new THREE.MeshBasicMaterial({
    map: glowTexture(), color: 0xffc070, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const poolGeo = new THREE.PlaneGeometry(1, 1);
  poolGeo.rotateX(-Math.PI / 2);
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, Math.max(1, heads.length));
  const hp = new THREE.Vector3(), q0 = new THREE.Quaternion(), ps = new THREE.Vector3(18, 1, 18);
  heads.forEach((m, i) => {
    hp.setFromMatrixPosition(m);
    hp.y = terrainHeight(hp.x, hp.z) + 0.12;
    pools.setMatrixAt(i, new THREE.Matrix4().compose(hp, q0, ps));
  });
  pools.count = heads.length;
  pools.instanceMatrix.needsUpdate = true;
  pools.computeBoundingSphere();
  pools.renderOrder = 1;
  pools.visible = false;
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  const wires = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x2a2a2a }));
  return { mesh, lamps, lampMat, pools, signs: buildRoadSigns(c), wires };
}

// ───────────── road signs with real distances ─────────────

function buildRoadSigns(c: CollisionWorld): THREE.Mesh {
  const mi = (from: string, to: string) => {
    const a = NODE_BY_ID[from];
    const r = routeTo(a.x, a.z, to, { vehicleWidth: 2 });
    return r ? Math.round((r.km / 1.609) / 1) : 0;
  };
  const defs: { key: string; text: string; node: string; road: string; side: number }[] = [
    { key: 's1', text: `PINE LAKE ${mi('dj_n', 'pl_c')} MI ↑`, node: 'dj_n', road: 'rt89', side: 1 },
    { key: 's2', text: `MESA CITY ${mi('dj_e', 'mc_c')} MI →`, node: 'dj_e', road: 'hwy60_w', side: 1 },
    { key: 's3', text: `DUSTY JCT ${mi('mc_w', 'dj_c')} MI ←`, node: 'mc_w', road: 'hwy60_e', side: 1 },
    { key: 's4', text: `PINE LAKE ${mi('mc_n', 'pl_c')} MI ↑`, node: 'mc_n', road: 'byway', side: 1 },
    { key: 's5', text: `MESA CITY ${mi('pl_e', 'mc_c')} MI →`, node: 'pl_e', road: 'byway', side: 1 },
    { key: 's6', text: `DUSTY JCT ${mi('pl_s', 'dj_c')} MI ↓`, node: 'pl_s', road: 'rt89', side: 1 },
    { key: 's7', text: 'RED ROCK FLATS · FREE CAMPING', node: 'dj_w', road: 'rr_road', side: 1 },
    { key: 's8', text: 'CAMPGROUND →', node: 'pl_e', road: 'pl_cg_road', side: -1 },
    { key: 's9', text: 'NARROW TRACK · MAX WIDTH 2.2 M', node: 'pl_c', road: 'pl_track', side: 1 },
    { key: 's10', text: 'COYOTE FLATS · FUEL · SHOWERS', node: 'ts', road: 'hwy60_w', side: -1 },
  ];
  const atlas = signAtlas(defs.map((d) => ({ key: d.key, text: d.text, bg: '#2f6b4a', fg: '#ffffff' })));
  const sb = new GeoBuilder(true);
  const posts = new GeoBuilder();
  for (const d of defs) {
    const e = EDGES.find((x) => x.def.id === d.road);
    if (!e) continue;
    const atStart = e.def.from === d.node;
    const s = atStart ? 22 : e.length - 22;
    let i = e.cum.findIndex((v) => v >= s);
    if (i < 1) i = 1;
    let tx = e.xs[i] - e.xs[i - 1], tz = e.zs[i] - e.zs[i - 1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    if (!atStart) {
      tx = -tx;
      tz = -tz;
    }
    const rx = -tz, rz = tx;
    const off = (e.def.width / 2 + 3) * d.side;
    const x = e.xs[i] + rx * off, z = e.zs[i] + rz * off;
    const y = terrainHeight(x, z);
    const face = Math.atan2(-tx, -tz); // faces oncoming traffic leaving the node
    posts.cyl(x - Math.cos(face) * 1.2, y + 1.3, z + Math.sin(face) * 1.2, 0.06, 2.6, '#8a8a8a', 8);
    posts.cyl(x + Math.cos(face) * 1.2, y + 1.3, z - Math.sin(face) * 1.2, 0.06, 2.6, '#8a8a8a', 8);
    sb.base = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), face), new THREE.Vector3(1, 1, 1));
    sb.quad(0, 2.6, 0.05, 3.2, 0.7, '#ffffff', 0, 0, atlas.rect[d.key]);
    sb.quad(0, 2.6, -0.05, 3.2, 0.7, '#dfe8e0', Math.PI, 0, [0, 0, 0.001, 0.001]);
    sb.base = null;
    c.addCircle(x, z, 0.4, y, y + 3, 'sign');
  }
  const mesh = new THREE.Mesh(sb.build(), new THREE.MeshStandardMaterial({ map: atlas.texture, roughness: 0.6 }));
  mesh.add(new THREE.Mesh(posts.build(), MAT.vc));
  return mesh;
}

// ───────────── farmers market & campfire (event visuals) ─────────────

function buildMarket(c: CollisionWorld): THREE.Group {
  const g = new THREE.Group();
  const b = new GeoBuilder();
  const ev = EVENTS.find((e) => e.id === 'farmers_market')!;
  const cols = ['#c8553d', '#2f7a8a', '#e8b83c', '#5a8a4a', '#8a4a7a', '#d8873a'];
  for (let i = 0; i < 6; i++) {
    const x = ev.x - 13 + (i % 3) * 13, z = ev.z - 4 + Math.floor(i / 3) * 10;
    const y = terrainHeight(x, z);
    for (const [lx, lz] of [[-1.4, -1.1], [1.4, -1.1], [-1.4, 1.1], [1.4, 1.1]]) b.cyl(x + lx, y + 1.1, z + lz, 0.05, 2.2, '#cfcfcf', 8);
    b.cone(x, y + 2.6, z, 2.2, 0.8, cols[i], 6, Math.PI / 4);
    b.boxOn(x, y, z + 0.6, 2.6, 0.85, 0.7, '#c9a77a');
    for (let k = 0; k < 5; k++) b.sphere(x - 1 + k * 0.5, y + 0.95, z + 0.6, 0.18, 0.12, 0.18, ['#c23a2c', '#e8b83c', '#5f8a4a', '#d8873a', '#8a4a7a'][k], 0);
  }
  g.add(new THREE.Mesh(b.build(), MAT.vc));
  g.visible = false;
  void c;
  return g;
}

function buildCampfire(): THREE.Group {
  const g = new THREE.Group();
  const ev = EVENTS.find((e) => e.id === 'campfire_night')!;
  const y = terrainHeight(ev.x, ev.z);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.3, 7), new THREE.MeshStandardMaterial({ color: 0xffa040, emissive: 0xff7a20, emissiveIntensity: 2.2, transparent: true, opacity: 0.9 }));
  flame.position.set(ev.x, y + 0.65, ev.z);
  g.add(flame);
  const light = new THREE.PointLight(0xff9a50, 6, 18, 1.6);
  light.position.set(ev.x, y + 1.4, ev.z);
  g.add(light);
  g.visible = false;
  return g;
}

void nearestRoad;
