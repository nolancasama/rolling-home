import * as THREE from 'three';

// Accumulates many primitives into one vertex-colored geometry so a whole
// building, prop or vehicle body is a single draw call.

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _n3 = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();

const unit = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8, 1),
  cyl12: new THREE.CylinderGeometry(1, 1, 1, 12, 1),
  cyl16: new THREE.CylinderGeometry(1, 1, 1, 16, 1),
  cone6: new THREE.ConeGeometry(1, 1, 6, 1),
  cone8: new THREE.ConeGeometry(1, 1, 8, 1),
  sphere: new THREE.SphereGeometry(1, 10, 7),
  sphereLo: new THREE.IcosahedronGeometry(1, 0),
  sphereMid: new THREE.IcosahedronGeometry(1, 1),
  plane: new THREE.PlaneGeometry(1, 1),
};

const nonIndexed = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
function flat(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let ng = nonIndexed.get(g);
  if (!ng) {
    ng = g.index ? g.toNonIndexed() : g;
    if (!ng.getAttribute('normal')) ng.computeVertexNormals();
    nonIndexed.set(g, ng);
  }
  return ng;
}

export type ColorLike = THREE.ColorRepresentation;

export interface Xform {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

export function xform(t: Xform): THREE.Matrix4 {
  _e.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0, 'YXZ');
  _q.setFromEuler(_e);
  _s.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
  _p.set(t.x ?? 0, t.y ?? 0, t.z ?? 0);
  return _m.compose(_p, _q, _s);
}

export class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  uv: number[] | null = null;
  /** Optional parent transform applied to everything added. */
  base: THREE.Matrix4 | null = null;

  constructor(withUv = false) {
    if (withUv) this.uv = [];
  }

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  addGeometry(g: THREE.BufferGeometry, matrix: THREE.Matrix4, color: ColorLike, uvRect?: [number, number, number, number]): this {
    const src = flat(g);
    const pa = src.getAttribute('position') as THREE.BufferAttribute;
    const na = src.getAttribute('normal') as THREE.BufferAttribute;
    const ua = src.getAttribute('uv') as THREE.BufferAttribute | undefined;
    const m = this.base ? new THREE.Matrix4().multiplyMatrices(this.base, matrix) : matrix;
    _n3.getNormalMatrix(m);
    _c.set(color);
    const flip = m.determinant() < 0;
    const n = pa.count;
    const order = flip ? [0, 2, 1] : [0, 1, 2];
    for (let t = 0; t < n; t += 3) {
      for (const k of order) {
        const i = t + k;
        _v.fromBufferAttribute(pa, i).applyMatrix4(m);
        this.pos.push(_v.x, _v.y, _v.z);
        _v.fromBufferAttribute(na, i).applyMatrix3(_n3).normalize();
        this.nor.push(_v.x, _v.y, _v.z);
        this.col.push(_c.r, _c.g, _c.b);
        if (this.uv) {
          const u = ua ? ua.getX(i) : 0;
          const vv = ua ? ua.getY(i) : 0;
          if (uvRect) this.uv.push(uvRect[0] + u * uvRect[2], uvRect[1] + vv * uvRect[3]);
          else this.uv.push(u, vv);
        }
      }
    }
    return this;
  }

  box(x: number, y: number, z: number, w: number, h: number, d: number, color: ColorLike, ry = 0, rx = 0, rz = 0): this {
    return this.addGeometry(unit.box, xform({ x, y, z, sx: w, sy: h, sz: d, ry, rx, rz }), color);
  }

  /** Box resting on y (bottom at y). */
  boxOn(x: number, y: number, z: number, w: number, h: number, d: number, color: ColorLike, ry = 0): this {
    return this.box(x, y + h / 2, z, w, h, d, color, ry);
  }

  cyl(x: number, y: number, z: number, r: number, h: number, color: ColorLike, seg: 8 | 12 | 16 = 12, rx = 0, rz = 0, ry = 0, rTop?: number): this {
    if (rTop != null && rTop !== r) {
      const g = new THREE.CylinderGeometry(rTop, r, 1, seg, 1);
      this.addGeometry(g, xform({ x, y, z, sx: 1, sy: h, sz: 1, rx, rz, ry }), color);
      g.dispose();
      return this;
    }
    const g = seg === 8 ? unit.cyl8 : seg === 16 ? unit.cyl16 : unit.cyl12;
    return this.addGeometry(g, xform({ x, y, z, sx: r, sy: h, sz: r, rx, rz, ry }), color);
  }

  cone(x: number, y: number, z: number, r: number, h: number, color: ColorLike, seg: 6 | 8 = 8, ry = 0): this {
    return this.addGeometry(seg === 6 ? unit.cone6 : unit.cone8, xform({ x, y, z, sx: r, sy: h, sz: r, ry }), color);
  }

  sphere(x: number, y: number, z: number, rx: number, ry: number, rz: number, color: ColorLike, detail: 0 | 1 | 2 = 2, rotY = 0): this {
    const g = detail === 0 ? unit.sphereLo : detail === 1 ? unit.sphereMid : unit.sphere;
    return this.addGeometry(g, xform({ x, y, z, sx: rx, sy: ry, sz: rz, ry: rotY }), color);
  }

  /** Flat quad facing +Z before rotation, centered at (x,y,z). */
  quad(x: number, y: number, z: number, w: number, h: number, color: ColorLike, ry = 0, rx = 0, uvRect?: [number, number, number, number]): this {
    return this.addGeometry(unit.plane, xform({ x, y, z, sx: w, sy: h, sz: 1, ry, rx }), color, uvRect);
  }

  /** Raw triangle (counter-clockwise when seen from the front). */
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: ColorLike): this {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    _c.set(color);
    for (const p of [a, b, c]) {
      const q = this.base ? p.clone().applyMatrix4(this.base) : p;
      this.pos.push(q.x, q.y, q.z);
      const nn = this.base ? n.clone().applyMatrix3(_n3.getNormalMatrix(this.base)).normalize() : n;
      this.nor.push(nn.x, nn.y, nn.z);
      this.col.push(_c.r, _c.g, _c.b);
      if (this.uv) this.uv.push(0, 0);
    }
    return this;
  }

  quad4(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: ColorLike): this {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  isEmpty(): boolean {
    return this.pos.length === 0;
  }
}

export const MAT = {
  vc: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.02 }),
  vcShiny: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.1 }),
  vcLambert: new THREE.MeshLambertMaterial({ vertexColors: true }),
  glass: new THREE.MeshStandardMaterial({
    color: 0x30424e, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.42, depthWrite: false,
  }),
  glassDark: new THREE.MeshStandardMaterial({ color: 0x1c2630, roughness: 0.1, metalness: 0.3 }),
  emissiveWarm: new THREE.MeshStandardMaterial({ color: 0xffe8b0, emissive: 0xffc86a, emissiveIntensity: 0.0, roughness: 0.6 }),
};

export function colorHex(c: ColorLike): THREE.Color {
  return new THREE.Color(c);
}

export function shade(hex: string, f: number): THREE.Color {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l * f)));
  return c;
}

export function meshOf(b: GeoBuilder, mat: THREE.Material = MAT.vc, shadows = true): THREE.Mesh {
  const m = new THREE.Mesh(b.build(), mat);
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}
