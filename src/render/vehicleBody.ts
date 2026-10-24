import * as THREE from 'three';
import type { VehicleDef, WindowDef } from '../data/types';
import { frontAxleZ, rearAxleZ } from '../data/vehicles';
import { GeoBuilder, MAT, shade } from './builder';
import { fabric, wallPanel, woodFloor } from './textures';

// Exterior shells from side profiles (z forward, y up) with real window
// openings, plus interior paneling. Vehicle-local: +Z forward, +X left.

type P2 = [number, number];

function arc(cz: number, cy: number, r: number, a0: number, a1: number, n: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cz + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/** Wheel arch points along a bottom edge at height y (going from rear to front). */
function wheelArch(cz: number, cy: number, r: number, y: number): P2[] {
  const a = Math.asin(Math.max(-0.99, Math.min(0.99, (y - cy) / r)));
  return arc(cz, cy, r, Math.PI - a, a, 9);
}

export interface BodyParts {
  group: THREE.Group;
  paint: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  /** Objects hidden in the furnishing cutaway view. */
  roofParts: THREE.Object3D[];
  door: THREE.Group;
  doorOpen: (t: number) => void;
  headlightMat: THREE.MeshStandardMaterial;
  tailMat: THREE.MeshStandardMaterial;
  wheelRadius: number;
  /** wheel anchor points (vehicle-local) FL, FR, RL, RR */
  wheelPos: THREE.Vector3[];
  dual: boolean;
  awningMount: THREE.Vector3;
  rust: THREE.Mesh;
}

function sidePanel(profile: P2[], holes: P2[][], side: 1 | -1, halfW: number, mat: THREE.Material): THREE.Mesh {
  const sgn = side === 1 ? -1 : 1; // left uses u = -z (see rotation below)
  const shape = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(sgn * z, y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([z, y]) => new THREE.Vector2(sgn * z, y))));
  const g = new THREE.ShapeGeometry(shape, 4);
  g.rotateY(side === 1 ? Math.PI / 2 : -Math.PI / 2);
  g.translate(side * halfW, 0, 0);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function rim(b: GeoBuilder, profile: P2[], halfW: number, skip: (i: number) => boolean, color: THREE.ColorRepresentation) {
  // centroid to orient normals outward
  let cz = 0, cy = 0;
  for (const [z, y] of profile) {
    cz += z;
    cy += y;
  }
  cz /= profile.length;
  cy /= profile.length;
  for (let i = 0; i < profile.length; i++) {
    if (skip(i)) continue;
    const [z0, y0] = profile[i];
    const [z1, y1] = profile[(i + 1) % profile.length];
    const a = new THREE.Vector3(halfW, y0, z0), bb = new THREE.Vector3(-halfW, y0, z0);
    const c = new THREE.Vector3(-halfW, y1, z1), d = new THREE.Vector3(halfW, y1, z1);
    // outward = away from centroid
    const mz = (z0 + z1) / 2 - cz, my = (y0 + y1) / 2 - cy;
    const n = new THREE.Vector3().subVectors(bb, a).cross(new THREE.Vector3().subVectors(d, a));
    if (n.y * my + n.z * mz < 0) b.quad4(a, d, c, bb, color);
    else b.quad4(a, bb, c, d, color);
  }
}

function rectHole(z0: number, z1: number, y0: number, y1: number): P2[] {
  return [[z0, y0], [z1, y0], [z1, y1], [z0, y1]];
}

function glassQuad(b: GeoBuilder, p0: P2, p1: P2, halfW: number, outward: number) {
  const dz = p1[0] - p0[0], dy = p1[1] - p0[1];
  const l = Math.hypot(dz, dy);
  const nz = (dy / l) * outward, ny = (-dz / l) * outward;
  const a = new THREE.Vector3(halfW, p0[1] + ny * 0.01, p0[0] + nz * 0.01);
  const bb = new THREE.Vector3(-halfW, p0[1] + ny * 0.01, p0[0] + nz * 0.01);
  const c = new THREE.Vector3(-halfW, p1[1] + ny * 0.01, p1[0] + nz * 0.01);
  const d = new THREE.Vector3(halfW, p1[1] + ny * 0.01, p1[0] + nz * 0.01);
  b.quad4(a, bb, c, d, '#ffffff');
  b.quad4(a, d, c, bb, '#ffffff');
}

function sideGlass(b: GeoBuilder, hole: P2[], halfW: number) {
  for (const side of [1, -1]) {
    const x = side * (halfW - 0.015);
    const pts = hole.map(([z, y]) => new THREE.Vector3(x, y, z));
    for (let i = 1; i < pts.length - 1; i++) {
      b.tri(pts[0], pts[i], pts[i + 1], '#ffffff');
      b.tri(pts[0], pts[i + 1], pts[i], '#ffffff');
    }
  }
}

function windowHoles(def: VehicleDef, side: 'left' | 'right'): P2[][] {
  return def.interior.windows.filter((w) => w.side === side).map((w) => rectHole(w.a0, w.a1, w.y0, w.y1));
}

function rearPanel(halfW: number, z: number, y0: number, y1: number, windows: WindowDef[], mat: THREE.Material, roundTop = 0.1): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-halfW, y0);
  shape.lineTo(halfW, y0);
  shape.lineTo(halfW, y1 - roundTop);
  shape.quadraticCurveTo(halfW, y1, halfW - roundTop, y1);
  shape.lineTo(-halfW + roundTop, y1);
  shape.quadraticCurveTo(-halfW, y1, -halfW, y1 - roundTop);
  shape.closePath();
  for (const w of windows.filter((x) => x.side === 'rear')) {
    // rear view from behind: x = -a (left side is +X, seen on the right from behind)
    shape.holes.push(new THREE.Path([new THREE.Vector2(w.a0, w.y0), new THREE.Vector2(w.a1, w.y0), new THREE.Vector2(w.a1, w.y1), new THREE.Vector2(w.a0, w.y1)]));
  }
  const g = new THREE.ShapeGeometry(shape, 3);
  g.rotateY(Math.PI); // face -Z
  g.translate(0, 0, z);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function wheel(radius: number, width: number, dual: boolean): THREE.Group {
  const g = new THREE.Group();
  const b = new GeoBuilder();
  const tire = '#1f1f22';
  const n = dual ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const off = dual ? (i === 0 ? -width * 0.55 : width * 0.55) : 0;
    b.cyl(off, 0, 0, radius, width, tire, 16, 0, Math.PI / 2);
    b.cyl(off, 0, 0, radius * 0.62, width + 0.02, '#cfd2d6', 16, 0, Math.PI / 2);
    b.cyl(off, 0, 0, radius * 0.2, width + 0.05, '#8a8e94', 8, 0, Math.PI / 2);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      b.box(off + (width / 2 + 0.02) * (dual ? 0 : 1), Math.sin(a) * radius * 0.4, Math.cos(a) * radius * 0.4, 0.02, 0.06, 0.06, '#6a6e74');
    }
  }
  const m = new THREE.Mesh(b.build(), MAT.vcShiny);
  m.castShadow = true;
  g.add(m);
  return g;
}

export function buildBody(def: VehicleDef): BodyParts {
  return def.id === 'van' ? buildVan(def) : buildClassC(def);
}

function makeMats(def: VehicleDef) {
  const paint = new THREE.MeshStandardMaterial({ color: def.paint.body, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide });
  const accent = new THREE.MeshStandardMaterial({ color: def.paint.accent, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide });
  const headlightMat = new THREE.MeshStandardMaterial({ color: 0xf8f4e8, emissive: 0xfff2c0, emissiveIntensity: 0.0, roughness: 0.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xa02020, emissive: 0xff2010, emissiveIntensity: 0.2, roughness: 0.3 });
  return { paint, accent, headlightMat, tailMat };
}

function rustDecals(def: VehicleDef, halfW: number, spots: [number, number, number][]): THREE.Mesh {
  const b = new GeoBuilder();
  const circle = new THREE.CircleGeometry(1, 7);
  spots.forEach(([z, y, r], k) => {
    for (const side of [1, -1]) {
      const x = side * (halfW + 0.006);
      // a small irregular cluster of blotches, mostly along the lower edges
      for (let i = 0; i < 4; i++) {
        const oz = Math.sin(k * 7.3 + i * 2.1 + side) * r * 0.9;
        const oy = Math.cos(k * 3.1 + i * 1.7) * r * 0.45;
        const s = r * (0.35 + 0.3 * ((k + i) % 3) / 2);
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(x, y + oy, z + oz),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, side * Math.PI / 2, k + i)),
          new THREE.Vector3(s, s * 0.6, 1),
        );
        b.addGeometry(circle, m, i % 2 ? '#7a3e22' : '#9a5a30');
      }
    }
  });
  void def;
  const m = new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }));
  return m;
}

// ───────────────────────── Van ─────────────────────────

function buildVan(def: VehicleDef): BodyParts {
  const { paint, accent, headlightMat, tailMat } = makeMats(def);
  const g = new THREE.Group();
  const L = def.dims.length, W = def.dims.width, hw = W / 2;
  const zf = frontAxleZ(def), zr = rearAxleZ(def);
  const R = def.dims.wheelRadius;
  const yb = 0.45;
  const profile: P2[] = [
    [-L / 2, yb],
    ...wheelArch(zr, R, 0.5, yb),
    ...wheelArch(zf, R, 0.5, yb),
    [L / 2 - 0.08, yb], [L / 2, 0.55], [L / 2 + 0.03, 0.66], [L / 2 + 0.03, 0.88], [L / 2 - 0.02, 0.97],
    [L / 2 - 0.05, 1.07], [L / 2 - 0.2, 1.13],
    [1.95, 1.3],
    [1.28, 2.0],
    [1.12, 2.08], [0.96, 2.16],
    ...arc(0.6, 2.24, 0.38, Math.PI * 0.95, Math.PI * 0.5, 4).map(([z, y]) => [z + 0.0, y] as P2),
    [-L / 2 + 0.16, 2.64],
    ...arc(-L / 2 + 0.16, 2.48, 0.16, Math.PI / 2, Math.PI, 3).slice(1),
  ];
  const windshieldIdx = profile.findIndex((p) => p[0] === 1.95 && p[1] === 1.3);
  const rearIdx = profile.length - 1;
  const cabWin: P2[] = [[1.02, 1.42], [1.82, 1.42], [1.3, 1.96], [1.02, 1.96]];
  const leftHoles = [...windowHoles(def, 'left'), cabWin];
  const door = def.interior.door;
  const rightHoles = [
    ...windowHoles(def, 'right').filter((h) => !(h[0][0] >= door.z0 - 0.05 && h[1][0] <= door.z1 + 0.05)),
    cabWin, rectHole(door.z0, door.z1, 0.5, 2.05),
  ];
  g.add(sidePanel(profile, leftHoles, 1, hw, paint));
  g.add(sidePanel(profile, rightHoles, -1, hw, paint));
  const rimB = new GeoBuilder();
  rim(rimB, profile, hw, (i) => i === windshieldIdx || i === rearIdx, '#ffffff');
  const rimMesh = new THREE.Mesh(rimB.build(), paint);
  rimMesh.castShadow = true;
  g.add(rimMesh);
  g.add(rearPanel(hw, -L / 2, yb, 2.48, def.interior.windows, paint));
  // glass
  const gl = new GeoBuilder();
  glassQuad(gl, profile[windshieldIdx], profile[windshieldIdx + 1], hw - 0.06, 1);
  for (const h of [...windowHoles(def, 'left'), cabWin]) sideGlass(gl, h, hw);
  for (const w of def.interior.windows.filter((x) => x.side === 'rear')) {
    const pts = [[w.a0, w.y0], [w.a1, w.y0], [w.a1, w.y1], [w.a0, w.y1]].map(([x, y]) => new THREE.Vector3(x, y, -L / 2 - 0.012));
    gl.quad4(pts[0], pts[3], pts[2], pts[1], '#ffffff');
    gl.quad4(pts[0], pts[1], pts[2], pts[3], '#ffffff');
  }
  const glass = new THREE.Mesh(gl.build(), MAT.glass);
  glass.renderOrder = 2;
  g.add(glass);
  // trim & details
  const t = new GeoBuilder();
  const trim = def.paint.trim;
  t.box(0, 0.7, L / 2 + 0.05, W + 0.06, 0.26, 0.16, '#3a3a3a'); // front bumper
  t.box(0, 0.62, -L / 2 - 0.06, W + 0.06, 0.24, 0.16, '#3a3a3a'); // rear bumper
  t.box(0, 1.0, L / 2 + 0.005, 1.1, 0.16, 0.04, '#2a2a2a'); // grille
  for (let k = 0; k < 3; k++) t.box(0, 0.94 + k * 0.05, L / 2 + 0.03, 1.0, 0.015, 0.02, '#8a8a8a');
  for (const sx of [-1, 1]) {
    t.box(sx * (hw - 0.05), 2.0, 1.7, 0.28, 0.2, 0.06, '#2a2a2a', 0); // mirror arm
    t.box(sx * (hw + 0.17), 1.95, 1.65, 0.06, 0.26, 0.18, '#2a2a2a');
    t.box(sx * (hw + 0.01), 1.3, 1.45, 0.02, 0.04, 0.18, '#8a8a8a'); // handle
    t.box(sx * (hw + 0.004), 0.95, -0.2, 0.01, 0.12, L - 0.4, '#2a2a2a'); // rub strip
  }
  t.box(0, 2.68, -0.4, 1.5, 0.06, 1.7, '#3a3a3a'); // roof rack base
  for (const sx of [-0.72, 0.72]) t.box(sx, 2.74, -0.4, 0.05, 0.12, 1.8, '#5a5a5a');
  for (const sz of [-1.2, -0.4, 0.4]) t.box(0, 2.78, sz, 1.5, 0.04, 0.05, '#5a5a5a');
  t.cyl(0, 1.1, -L / 2 - 0.18, 0.34, 0.2, '#1f1f22', 16, Math.PI / 2); // spare tire
  t.cyl(0, 1.1, -L / 2 - 0.2, 0.2, 0.22, accent.color, 12, Math.PI / 2);
  for (const sx of [-0.2, 0.2]) t.box(sx, 1.6, -L / 2 - 0.01, 0.02, 1.9, 0.02, '#2a2a2a'); // rear door seam
  // sliding door seam lines
  t.box(-hw - 0.004, 1.27, door.z0, 0.01, 1.55, 0.02, '#3a3a3a');
  t.box(-hw - 0.004, 1.27, door.z1, 0.01, 1.55, 0.02, '#3a3a3a');
  const tm = new THREE.Mesh(t.build(), MAT.vcShiny);
  tm.castShadow = true;
  g.add(tm);
  // accent stripe
  const st = new GeoBuilder();
  for (const side of [1, -1]) {
    st.box(side * (hw + 0.005), 1.12, -0.45, 0.01, 0.16, L - 1.2, '#ffffff');
    st.box(side * (hw + 0.005), 1.0, -0.45, 0.01, 0.05, L - 1.2, '#ffffff');
  }
  const stripe = new THREE.Mesh(st.build(), accent);
  g.add(stripe);
  // lights
  const hl = new GeoBuilder();
  for (const sx of [-0.68, 0.68]) hl.box(sx, 1.02, L / 2 - 0.01, 0.3, 0.16, 0.06, '#ffffff');
  g.add(new THREE.Mesh(hl.build(), headlightMat));
  const tl = new GeoBuilder();
  for (const sx of [-0.9, 0.9]) tl.box(sx, 1.35, -L / 2 - 0.01, 0.12, 0.42, 0.04, '#ffffff');
  g.add(new THREE.Mesh(tl.build(), tailMat));
  // sliding door (moves back along the side when opened)
  const doorG = new THREE.Group();
  const dw = door.z1 - door.z0;
  const dshape = new THREE.Shape([new THREE.Vector2(0, 0.5), new THREE.Vector2(dw, 0.5), new THREE.Vector2(dw, 2.05), new THREE.Vector2(0, 2.05)]);
  const winH = def.interior.windows.find((w) => w.side === 'right' && w.a0 >= door.z0 - 0.05 && w.a1 <= door.z1 + 0.05);
  if (winH) dshape.holes.push(new THREE.Path([new THREE.Vector2(winH.a0 - door.z0, winH.y0), new THREE.Vector2(winH.a1 - door.z0, winH.y0), new THREE.Vector2(winH.a1 - door.z0, winH.y1), new THREE.Vector2(winH.a0 - door.z0, winH.y1)]));
  const dg = new THREE.ShapeGeometry(dshape, 2);
  dg.rotateY(-Math.PI / 2);
  const dmesh = new THREE.Mesh(dg, paint);
  dmesh.castShadow = true;
  dmesh.position.set(-hw - 0.012, 0, door.z0);
  doorG.add(dmesh);
  if (winH) {
    const dgl = new GeoBuilder();
    const pts = [[winH.a0 - door.z0, winH.y0], [winH.a1 - door.z0, winH.y0], [winH.a1 - door.z0, winH.y1], [winH.a0 - door.z0, winH.y1]].map(([z, y]) => new THREE.Vector3(-hw - 0.02, y, door.z0 + z));
    dgl.quad4(pts[0], pts[1], pts[2], pts[3], '#ffffff');
    dgl.quad4(pts[0], pts[3], pts[2], pts[1], '#ffffff');
    doorG.add(new THREE.Mesh(dgl.build(), MAT.glass));
  }
  const ds = new GeoBuilder();
  ds.box(-hw - 0.004, 1.12, 0.1 + door.z0, 0.01, 0.16, dw - 0.05, '#ffffff');
  const dstripe = new THREE.Mesh(ds.build(), accent);
  doorG.add(dstripe);
  g.add(doorG);
  const doorOpen = (k: number) => {
    doorG.position.set(-0.07 * Math.min(1, k * 3), 0, -k * (dw - 0.05));
  };
  const roofParts: THREE.Object3D[] = [];
  const rust = rustDecals(def, hw, [[-2.4, 0.62, 0.13], [-1.0, 0.55, 0.1], [2.3, 0.6, 0.09], [-2.62, 1.6, 0.07], [0.3, 0.6, 0.11]]);
  g.add(rust);
  return {
    group: g, paint, accent, roofParts, door: doorG, doorOpen, headlightMat, tailMat, wheelRadius: R,
    wheelPos: [
      new THREE.Vector3(def.dims.track / 2, R, zf), new THREE.Vector3(-def.dims.track / 2, R, zf),
      new THREE.Vector3(def.dims.track / 2, R, zr), new THREE.Vector3(-def.dims.track / 2, R, zr),
    ],
    dual: false, awningMount: new THREE.Vector3(-hw - 0.08, 2.5, -0.4), rust,
  };
}

// ───────────────────────── Class C ─────────────────────────

function buildClassC(def: VehicleDef): BodyParts {
  const { paint, accent, headlightMat, tailMat } = makeMats(def);
  const g = new THREE.Group();
  const L = def.dims.length, W = def.dims.width, hw = W / 2;
  const cabHw = 1.02;
  const zf = frontAxleZ(def), zr = rearAxleZ(def);
  const R = def.dims.wheelRadius;
  const yb = 0.62;
  const coach: P2[] = [
    [-L / 2, yb],
    ...wheelArch(zr, R, 0.6, yb),
    [1.52, yb], [1.52, 2.2],
    [2.5, 2.24], [2.7, 2.32], [2.8, 2.52], [2.8, 2.84], [2.68, 3.08], [2.42, 3.2],
    [-L / 2 + 0.14, 3.28],
    ...arc(-L / 2 + 0.14, 3.14, 0.14, Math.PI / 2, Math.PI, 3).slice(1),
  ];
  const rearIdx = coach.length - 1;
  const door = def.interior.door;
  const caboverWin = rectHole(1.95, 2.45, 2.48, 2.86);
  const leftHoles = [...windowHoles(def, 'left'), caboverWin];
  const rightHoles = [
    ...windowHoles(def, 'right').filter((h) => !(h[0][0] >= door.z0 - 0.05 && h[1][0] <= door.z1 + 0.05)),
    caboverWin, rectHole(door.z0, door.z1, 0.66, 2.45),
  ];
  g.add(sidePanel(coach, leftHoles, 1, hw, paint));
  g.add(sidePanel(coach, rightHoles, -1, hw, paint));
  const rb = new GeoBuilder();
  rim(rb, coach, hw, (i) => i === rearIdx, '#ffffff');
  const rimMesh = new THREE.Mesh(rb.build(), paint);
  rimMesh.castShadow = true;
  g.add(rimMesh);
  g.add(rearPanel(hw, -L / 2, yb, 3.14, def.interior.windows, paint));
  // cab
  const cab: P2[] = [
    [1.46, yb],
    ...wheelArch(zf, R, 0.58, yb),
    [L / 2 - 0.1, yb], [L / 2 - 0.02, 0.68], [L / 2 + 0.03, 0.8], [L / 2 + 0.03, 1.0], [L / 2 - 0.02, 1.08],
    [L / 2 - 0.05, 1.24], [L / 2 - 0.22, 1.32],
    [2.98, 1.46],
    [2.42, 2.12],
    [2.3, 2.19], [1.46, 2.19],
  ];
  const cabWs = cab.findIndex((p) => p[0] === 2.98);
  const cabWin: P2[] = [[1.78, 1.48], [2.86, 1.48], [2.4, 2.04], [1.78, 2.04]];
  g.add(sidePanel(cab, [cabWin], 1, cabHw, paint));
  g.add(sidePanel(cab, [cabWin], -1, cabHw, paint));
  const cb = new GeoBuilder();
  rim(cb, cab, cabHw, (i) => i === cabWs || i === cab.length - 1, '#ffffff');
  const cabRim = new THREE.Mesh(cb.build(), paint);
  cabRim.castShadow = true;
  g.add(cabRim);
  // glass
  const gl = new GeoBuilder();
  glassQuad(gl, cab[cabWs], cab[cabWs + 1], cabHw - 0.06, 1);
  sideGlass(gl, cabWin, cabHw);
  for (const h of [...windowHoles(def, 'left')]) {
    const pts = h.map(([z, y]) => new THREE.Vector3(hw - 0.015, y, z));
    gl.tri(pts[0], pts[1], pts[2], '#fff').tri(pts[0], pts[2], pts[3], '#fff').tri(pts[0], pts[2], pts[1], '#fff').tri(pts[0], pts[3], pts[2], '#fff');
  }
  for (const h of windowHoles(def, 'right').filter((x) => !(x[0][0] >= door.z0 - 0.05 && x[1][0] <= door.z1 + 0.05))) {
    const pts = h.map(([z, y]) => new THREE.Vector3(-hw + 0.015, y, z));
    gl.tri(pts[0], pts[1], pts[2], '#fff').tri(pts[0], pts[2], pts[3], '#fff').tri(pts[0], pts[2], pts[1], '#fff').tri(pts[0], pts[3], pts[2], '#fff');
  }
  sideGlass(gl, caboverWin, hw);
  for (const w of def.interior.windows.filter((x) => x.side === 'rear')) {
    const pts = [[w.a0, w.y0], [w.a1, w.y0], [w.a1, w.y1], [w.a0, w.y1]].map(([x, y]) => new THREE.Vector3(x, y, -L / 2 - 0.012));
    gl.quad4(pts[0], pts[3], pts[2], pts[1], '#ffffff');
    gl.quad4(pts[0], pts[1], pts[2], pts[3], '#ffffff');
  }
  const glass = new THREE.Mesh(gl.build(), MAT.glass);
  glass.renderOrder = 2;
  g.add(glass);
  // details
  const t = new GeoBuilder();
  t.box(0, 0.86, L / 2 + 0.06, 2.12, 0.3, 0.18, '#c8ccd0'); // chrome bumper
  t.box(0, 1.12, L / 2 + 0.005, 1.2, 0.22, 0.04, '#2a2a2a');
  t.box(0, 0.62, -L / 2 - 0.05, W, 0.2, 0.14, '#3a3a3a');
  for (const sx of [-1, 1]) {
    t.box(sx * (cabHw + 0.2), 1.9, 2.55, 0.06, 0.34, 0.22, '#2a2a2a');
    t.box(sx * (cabHw + 0.08), 1.95, 2.55, 0.2, 0.05, 0.05, '#2a2a2a');
    t.box(sx * (cabHw + 0.01), 1.32, 2.25, 0.02, 0.04, 0.18, '#8a8a8a');
    // exterior compartment doors
    for (const [z0, z1] of [[-3.2, -2.6], [-1.0, -0.2], [0.1, 0.45]]) {
      if (sx === -1 && z0 >= door.z0 - 0.1 && z1 <= door.z1 + 0.1) continue;
      t.box(sx * (hw + 0.006), 0.95, (z0 + z1) / 2, 0.012, 0.5, z1 - z0, '#d8d4cc');
      t.box(sx * (hw + 0.012), 0.95, (z0 + z1) / 2 + (z1 - z0) / 2 - 0.08, 0.012, 0.06, 0.04, '#3a3a3a');
    }
    t.box(sx * (hw + 0.004), yb + 0.02, -1.1, 0.01, 0.06, L - 1.3, '#4a4a4a');
  }
  // roof: AC unit + vents
  const roofB = new GeoBuilder();
  roofB.box(0, 3.42, -0.8, 0.85, 0.28, 0.95, '#e8e8e4');
  roofB.box(0, 3.58, -0.8, 0.78, 0.06, 0.88, '#d0d0cc');
  for (const z of [-2.6, 1.2]) roofB.box(0.4, 3.33, z, 0.4, 0.1, 0.4, '#d8d8d0');
  const roofMesh = new THREE.Mesh(roofB.build(), MAT.vc);
  roofMesh.castShadow = true;
  g.add(roofMesh);
  // ladder
  for (const sx of [0.55, 0.85]) t.box(sx, 1.9, -L / 2 - 0.08, 0.04, 2.6, 0.04, '#9a9a9a');
  for (let k = 0; k < 8; k++) t.box(0.7, 0.8 + k * 0.32, -L / 2 - 0.08, 0.32, 0.03, 0.03, '#9a9a9a');
  // entry step
  t.box(-hw + 0.05, 0.42, (door.z0 + door.z1) / 2, 0.42, 0.06, door.z1 - door.z0 - 0.06, '#5a5a5a');
  const tm = new THREE.Mesh(t.build(), MAT.vcShiny);
  tm.castShadow = true;
  g.add(tm);
  // graphics: swoosh bands
  const st = new GeoBuilder();
  for (const side of [1, -1]) {
    const x = side * (hw + 0.005);
    st.box(x, 1.32, -0.9, 0.01, 0.14, L - 2.0, '#ffffff');
    st.box(x, 1.12, -1.2, 0.01, 0.07, L - 2.6, '#ffffff');
    st.box(x, 2.95, 2.0, 0.01, 0.1, 1.2, '#ffffff');
  }
  g.add(new THREE.Mesh(st.build(), accent));
  const st2 = new GeoBuilder();
  for (const side of [1, -1]) st2.box(side * (hw + 0.006), 1.48, -0.9, 0.01, 0.05, L - 2.0, '#ffffff');
  g.add(new THREE.Mesh(st2.build(), new THREE.MeshStandardMaterial({ color: def.paint.stripe, roughness: 0.5, side: THREE.DoubleSide })));
  // lights
  const hl = new GeoBuilder();
  for (const sx of [-0.72, 0.72]) hl.box(sx, 1.15, L / 2 - 0.02, 0.32, 0.18, 0.06, '#ffffff');
  g.add(new THREE.Mesh(hl.build(), headlightMat));
  const tl = new GeoBuilder();
  for (const sx of [-1.08, 1.08]) tl.box(sx, 1.2, -L / 2 - 0.01, 0.14, 0.4, 0.04, '#ffffff');
  for (const sx of [-1.15, 1.15]) tl.box(sx, 3.2, -L / 2 - 0.01, 0.06, 0.06, 0.04, '#ffffff');
  g.add(new THREE.Mesh(tl.build(), tailMat));
  // entry door (hinged at the front edge, swings outward)
  const doorG = new THREE.Group();
  const dw = door.z1 - door.z0;
  const shape = new THREE.Shape([new THREE.Vector2(0, 0.66), new THREE.Vector2(dw, 0.66), new THREE.Vector2(dw, 2.45), new THREE.Vector2(0, 2.45)]);
  const winH = def.interior.windows.find((w) => w.side === 'right' && w.a0 >= door.z0 - 0.05 && w.a1 <= door.z1 + 0.05);
  if (winH) shape.holes.push(new THREE.Path([new THREE.Vector2(winH.a0 - door.z0, winH.y0), new THREE.Vector2(winH.a1 - door.z0, winH.y0), new THREE.Vector2(winH.a1 - door.z0, winH.y1), new THREE.Vector2(winH.a0 - door.z0, winH.y1)]));
  const dgeo = new THREE.ShapeGeometry(shape, 2);
  dgeo.rotateY(-Math.PI / 2);
  dgeo.translate(0, 0, -dw); // hinge at the front edge (local z = 0)
  const dm = new THREE.Mesh(dgeo, paint);
  dm.castShadow = true;
  const pivot = new THREE.Group();
  pivot.position.set(-hw - 0.01, 0, door.z1);
  pivot.add(dm);
  if (winH) {
    const dgl = new GeoBuilder();
    const pts = [[winH.a0 - door.z0, winH.y0], [winH.a1 - door.z0, winH.y0], [winH.a1 - door.z0, winH.y1], [winH.a0 - door.z0, winH.y1]].map(([z, y]) => new THREE.Vector3(-0.01, y, z - dw));
    dgl.quad4(pts[0], pts[1], pts[2], pts[3], '#ffffff');
    dgl.quad4(pts[0], pts[3], pts[2], pts[1], '#ffffff');
    pivot.add(new THREE.Mesh(dgl.build(), MAT.glass));
  }
  const handle = new GeoBuilder();
  handle.box(-0.02, 1.45, -dw + 0.1, 0.03, 0.05, 0.14, '#9a9a9a');
  pivot.add(new THREE.Mesh(handle.build(), MAT.vcShiny));
  doorG.add(pivot);
  g.add(doorG);
  const doorOpen = (k: number) => {
    pivot.rotation.y = -k * 1.65;
  };
  const rust = rustDecals(def, hw, [[-3.3, 0.8, 0.08], [1.7, 0.8, 0.06]]);
  g.add(rust);
  return {
    group: g, paint, accent, roofParts: [roofMesh], door: doorG, doorOpen, headlightMat, tailMat, wheelRadius: R,
    wheelPos: [
      new THREE.Vector3(def.dims.track / 2, R, zf), new THREE.Vector3(-def.dims.track / 2, R, zf),
      new THREE.Vector3(def.dims.track / 2, R, zr), new THREE.Vector3(-def.dims.track / 2, R, zr),
    ],
    dual: true, awningMount: new THREE.Vector3(-hw - 0.1, 3.0, -0.6), rust,
  };
}

export function makeWheel(def: VehicleDef, dual: boolean): THREE.Group {
  return wheel(def.dims.wheelRadius, dual ? 0.2 : 0.24, dual);
}

// ───────────────────────── Interior shell ─────────────────────────

export interface InteriorParts {
  group: THREE.Group;
  /** Upper walls and ceiling, hidden in the furnishing cutaway. */
  upper: THREE.Object3D[];
  light: THREE.PointLight;
  lampMat: THREE.MeshStandardMaterial;
  cabFill: THREE.PointLight;
}

let floorTex: THREE.Texture | null = null;
let wallTex: THREE.Texture | null = null;

export function buildInterior(def: VehicleDef): InteriorParts {
  floorTex ??= woodFloor();
  wallTex ??= wallPanel();
  const g = new THREE.Group();
  const inr = def.interior;
  const hw = inr.halfWidth;
  const y0 = inr.floorY, y1 = inr.ceilingY;
  const zBack = inr.living.z0, zCab = inr.cab.z1;
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.75 });
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0xf6f0e4, roughness: 0.95 });
  const upper: THREE.Object3D[] = [];
  // floor
  const fl = new THREE.PlaneGeometry(hw * 2, zCab - zBack);
  fl.rotateX(-Math.PI / 2);
  fl.translate(0, y0, (zBack + zCab) / 2);
  const uv = fl.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * hw * 2 * 0.7, uv.getY(i) * (zCab - zBack) * 0.7);
  const floor = new THREE.Mesh(fl, floorMat);
  floor.receiveShadow = true;
  g.add(floor);
  // side walls with window holes (living area only)
  const zEnd = inr.living.z1;
  const wall = (side: 1 | -1) => {
    const sideName = side === 1 ? 'left' : 'right';
    // rotateY(-90°) maps shape u → +z (left wall, facing -X); rotateY(+90°) maps u → -z (right wall, facing +X)
    const u = (z: number) => (side === 1 ? z : -z);
    const shape = new THREE.Shape([[zBack, y0], [zEnd, y0], [zEnd, y1], [zBack, y1]].map(([z, y]) => new THREE.Vector2(u(z), y)));
    for (const w of inr.windows.filter((x) => x.side === sideName)) {
      if (side === -1 && w.a0 >= inr.door.z0 - 0.05 && w.a1 <= inr.door.z1 + 0.05) continue;
      shape.holes.push(new THREE.Path(rectHole(Math.max(zBack + 0.02, w.a0), Math.min(zEnd - 0.02, w.a1), Math.max(y0 + 0.02, w.y0), Math.min(y1 - 0.02, w.y1)).map(([z, y]) => new THREE.Vector2(u(z), y))));
    }
    if (side === -1) {
      const dz0 = Math.max(zBack + 0.02, inr.door.z0), dz1 = Math.min(zEnd - 0.01, inr.door.z1);
      shape.holes.push(new THREE.Path(rectHole(dz0, dz1, y0 + 0.01, Math.min(y1 - 0.15, y0 + 1.9)).map(([z, y]) => new THREE.Vector2(u(z), y))));
    }
    const geo = new THREE.ShapeGeometry(shape, 2);
    geo.rotateY(side === 1 ? -Math.PI / 2 : Math.PI / 2);
    geo.translate(side * hw, 0, 0);
    const m = new THREE.Mesh(geo, wallMat);
    m.receiveShadow = true;
    return m;
  };
  const lw = wall(1), rw = wall(-1);
  g.add(lw, rw);
  // rear wall
  const rs = new THREE.Shape([new THREE.Vector2(-hw, y0), new THREE.Vector2(hw, y0), new THREE.Vector2(hw, y1), new THREE.Vector2(-hw, y1)]);
  for (const w of inr.windows.filter((x) => x.side === 'rear')) rs.holes.push(new THREE.Path(rectHole(w.a0, w.a1, w.y0, w.y1).map(([a, y]) => new THREE.Vector2(-a, y))));
  const rg = new THREE.ShapeGeometry(rs, 2);
  rg.translate(0, 0, zBack);
  const rearW = new THREE.Mesh(rg, wallMat);
  g.add(rearW);
  // ceiling (living area)
  const cg = new THREE.PlaneGeometry(hw * 2, zEnd - zBack);
  cg.rotateX(Math.PI / 2);
  cg.translate(0, y1, (zBack + zEnd) / 2);
  const ceil = new THREE.Mesh(cg, ceilMat);
  g.add(ceil);
  // cab ceiling / headliner
  const cabTop = def.id === 'van' ? 1.98 : 2.12;
  const chg = new THREE.PlaneGeometry(hw * 2, zCab - zEnd + 0.5);
  chg.rotateX(Math.PI / 2);
  chg.translate(0, cabTop, (zEnd + zCab) / 2 + 0.25);
  const cabCeil = new THREE.Mesh(chg, new THREE.MeshStandardMaterial({ color: 0xd8cfbe, roughness: 0.95 }));
  g.add(cabCeil);
  // bulkhead between the high living ceiling and the lower cab ceiling
  const bulkG = new THREE.Group();
  const bulkMesh = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, y1 - cabTop), wallMat);
  bulkMesh.position.set(0, (y1 + cabTop) / 2, zEnd);
  bulkMesh.rotation.y = Math.PI;
  bulkG.add(bulkMesh);
  g.add(bulkG);
  upper.push(ceil, cabCeil, bulkG);
  // window frames, curtains, trim, lights
  const d = new GeoBuilder();
  const curtain = new THREE.MeshStandardMaterial({ map: fabric('#c8673e', '#e8a060'), roughness: 1 });
  const cb = new GeoBuilder(true);
  for (const w of inr.windows) {
    if (w.side === 'rear') {
      // frame bars around the opening (not a panel over it)
      const cx = (w.a0 + w.a1) / -2, cy = (w.y0 + w.y1) / 2, ww = w.a1 - w.a0, wh = w.y1 - w.y0;
      d.box(cx, w.y0 - 0.025, zBack + 0.02, ww + 0.1, 0.05, 0.03, '#b88a5a');
      d.box(cx, w.y1 + 0.025, zBack + 0.02, ww + 0.1, 0.05, 0.03, '#b88a5a');
      d.box(cx - ww / 2 - 0.025, cy, zBack + 0.02, 0.05, wh, 0.03, '#b88a5a');
      d.box(cx + ww / 2 + 0.025, cy, zBack + 0.02, 0.05, wh, 0.03, '#b88a5a');
      continue;
    }
    if (w.side === 'right' && w.a0 >= inr.door.z0 - 0.05 && w.a1 <= inr.door.z1 + 0.05) continue;
    const x = (w.side === 'left' ? 1 : -1) * (hw - 0.015);
    const zc = (w.a0 + w.a1) / 2;
    for (const yy of [w.y0 - 0.03, w.y1 + 0.03]) d.box(x, yy, zc, 0.04, 0.05, w.a1 - w.a0 + 0.1, '#b88a5a');
    // curtains gathered at both ends
    const cx = (w.side === 'left' ? 1 : -1) * (hw - 0.05);
    for (const zz of [w.a0 - 0.08, w.a1 + 0.08]) {
      cb.quad(cx, (w.y0 + w.y1) / 2 + 0.05, zz, 0.2, w.y1 - w.y0 + 0.25, '#ffffff', w.side === 'left' ? -Math.PI / 2 : Math.PI / 2);
    }
  }
  // wall trim strips at floor and ceiling
  for (const side of [1, -1]) {
    d.box(side * (hw - 0.012), y0 + 0.05, (zBack + zEnd) / 2, 0.03, 0.1, zEnd - zBack, '#9a6e46');
  }
  d.box(0, y0 + 0.05, zBack + 0.012, hw * 2, 0.1, 0.03, '#9a6e46');
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffd090, emissiveIntensity: 0.3 });
  const lamps = new GeoBuilder();
  for (let z = zBack + 0.8; z < zEnd - 0.2; z += 1.4) lamps.cyl(0, y1 - 0.015, z, 0.09, 0.02, '#ffffff', 12);
  const trim = new THREE.Mesh(d.build(), MAT.vc);
  g.add(trim);
  const ctn = new THREE.Mesh(cb.build(), curtain);
  g.add(ctn);
  const lampMesh = new THREE.Mesh(lamps.build(), lampMat);
  g.add(lampMesh);
  upper.push(lampMesh);
  // cab: seats, dashboard, wheel
  const cab = new GeoBuilder();
  const seatCol = '#4a4a50';
  for (const p of [inr.driverSeat, inr.passengerSeat]) {
    cab.boxOn(p.x, y0, p.z, 0.5, 0.42, 0.5, '#2a2a2e');
    cab.boxOn(p.x, y0 + 0.42, p.z, 0.52, 0.12, 0.52, seatCol);
    cab.box(p.x, y0 + 0.9, p.z - 0.24, 0.52, 0.72, 0.12, seatCol, 0, -0.12);
    cab.box(p.x, y0 + 1.32, p.z - 0.28, 0.3, 0.16, 0.1, seatCol);
  }
  const dashZ = def.id === 'van' ? 1.78 : 2.6;
  const dashY = def.id === 'van' ? 1.05 : 1.25;
  cab.box(0, y0 + 0.35, dashZ + 0.1, hw * 2, 0.7, 0.35, '#2e2e32');
  cab.box(0, dashY + 0.1, dashZ, hw * 2 - 0.05, 0.12, 0.5, '#3a3a40', 0, -0.25);
  cab.box(inr.driverSeat.x, dashY + 0.12, dashZ - 0.2, 0.4, 0.18, 0.03, '#141416');
  cab.box(0, y0 + 0.25, (inr.driverSeat.z + dashZ) / 2, 0.24, 0.5, 0.5, '#2a2a2e');
  // rear-view mirror and sun visors under the headliner
  cab.box(0, cabTop - 0.12, dashZ - 0.25, 0.26, 0.07, 0.03, '#1e1e22');
  cab.box(0, cabTop - 0.05, dashZ - 0.25, 0.03, 0.08, 0.03, '#1e1e22');
  for (const p of [inr.driverSeat, inr.passengerSeat]) cab.box(p.x, cabTop - 0.03, dashZ - 0.32, 0.5, 0.03, 0.2, '#b8ae9c');
  const cabMesh = new THREE.Mesh(cab.build(), MAT.vc);
  cabMesh.castShadow = true;
  g.add(cabMesh);
  const wheelG = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.025, 6, 18), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 }));
  wheelG.position.set(inr.driverSeat.x, dashY - 0.02, dashZ - 0.42);
  wheelG.rotation.x = -0.45;
  wheelG.name = 'steering';
  g.add(wheelG);
  // interior light
  const light = new THREE.PointLight(0xffd8a0, 0, 7, 1.4);
  light.position.set(0, y1 - 0.25, (zBack + zEnd) / 2);
  g.add(light);
  // daylight bounced in through the windshield (the roof blocks direct sun)
  const cabFill = new THREE.PointLight(0xfff0dc, 0, 4.5, 1.1);
  cabFill.position.set(0, cabTop - 0.35, inr.driverSeat.z + 0.35);
  g.add(cabFill);
  void shade;
  return { group: g, upper, light, lampMat, cabFill };
}
