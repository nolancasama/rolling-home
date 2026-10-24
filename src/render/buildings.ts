import * as THREE from 'three';
import { BUILDINGS, type BuildingDef } from '../data/map';
import { localToWorld } from '../sim/geo';
import { terrainHeight } from '../world/terrain';
import type { CollisionWorld } from '../game/collision';
import { GeoBuilder, MAT, shade } from './builder';
import { signAtlas } from './textures';

// Procedural buildings by style, merged per material, plus sign text and colliders.

const SIGN_STYLE: Record<string, { bg: string; fg: string }> = {
  default: { bg: '#f4ead5', fg: '#5a3a24' },
  gas: { bg: '#c23a2c', fg: '#ffffff' },
  grocery: { bg: '#2f6b4a', fg: '#fff6e0' },
  diner: { bg: '#e05a4a', fg: '#fff8e8' },
  motel: { bg: '#2a4a7a', fg: '#ffd27a' },
  warehouse: { bg: '#3a4a5a', fg: '#f0f0f0' },
  dealer: { bg: '#2a4a7a', fg: '#ffffff' },
  ranger: { bg: '#5a4a2a', fg: '#f0e0b0' },
  lodge: { bg: '#5a3a24', fg: '#f6e2b8' },
};

function gable(b: GeoBuilder, w: number, d: number, h0: number, rise: number, color: THREE.ColorRepresentation, overhang = 0.4) {
  const x0 = -w / 2 - overhang, x1 = w / 2 + overhang;
  const z0 = -d / 2 - overhang, z1 = d / 2 + overhang;
  const top = h0 + rise;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // ridge runs along X; slopes face +Z and -Z
  b.quad4(V(x0, h0, z1), V(x1, h0, z1), V(x1, top, 0), V(x0, top, 0), color);
  b.quad4(V(x1, h0, z0), V(x0, h0, z0), V(x0, top, 0), V(x1, top, 0), color);
  const wall = shade(typeof color === 'string' ? color : '#888888', 1.15);
  b.tri(V(-w / 2, h0, d / 2), V(-w / 2, top - 0.05, 0), V(-w / 2, h0, -d / 2), wall);
  b.tri(V(w / 2, h0, -d / 2), V(w / 2, top - 0.05, 0), V(w / 2, h0, d / 2), wall);
  // undersides of the overhang
  b.quad4(V(x0, h0 - 0.02, z1), V(x0, top - 0.02, 0), V(x1, top - 0.02, 0), V(x1, h0 - 0.02, z1), shade('#6a5a4a', 1));
}

function shedRoof(b: GeoBuilder, w: number, d: number, h0: number, rise: number, color: THREE.ColorRepresentation) {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const o = 0.5;
  b.quad4(V(-w / 2 - o, h0 + rise, -d / 2 - o), V(-w / 2 - o, h0, d / 2 + o), V(w / 2 + o, h0, d / 2 + o), V(w / 2 + o, h0 + rise, -d / 2 - o), color);
  b.box(0, h0 + rise / 2 - 0.05, -d / 2 - o, w + 2 * o, rise + 0.1, 0.12, shade('#6a5a4a', 1));
}

function windowsRow(b: GeoBuilder, w: number, y: number, z: number, count: number, ww: number, wh: number, glass: string, frame: string, skipCenter = 0) {
  for (let i = 0; i < count; i++) {
    const x = -w / 2 + (w * (i + 0.5)) / count;
    if (skipCenter && Math.abs(x) < skipCenter) continue;
    b.box(x, y, z + 0.03, ww + 0.16, wh + 0.16, 0.06, frame);
    b.box(x, y, z + 0.07, ww, wh, 0.04, glass);
  }
}

function door(b: GeoBuilder, x: number, z: number, w: number, h: number, color: THREE.ColorRepresentation, frame: THREE.ColorRepresentation) {
  b.box(x, h / 2 + 0.05, z + 0.03, w + 0.2, h + 0.15, 0.08, frame);
  b.box(x, h / 2, z + 0.08, w, h, 0.05, color);
  b.box(x + w * 0.33, h * 0.48, z + 0.13, 0.06, 0.06, 0.05, '#d8c070');
}

function rollUp(b: GeoBuilder, x: number, z: number, w: number, h: number, color: string) {
  b.box(x, h / 2, z + 0.04, w + 0.25, h + 0.2, 0.06, shade(color, 0.6));
  for (let k = 0; k < Math.floor(h / 0.35); k++) b.box(x, 0.18 + k * 0.35, z + 0.08, w, 0.3, 0.04, k % 2 ? color : shade(color, 0.92));
}

function buildOne(def: BuildingDef, b: GeoBuilder, signs: SignSpot[]) {
  const { w, d, h } = def;
  const wall = def.color;
  const trim = shade(def.color, 0.72);
  const roof = def.roof;
  const glass = '#5a7a8a';
  const front = d / 2;
  const style = def.style;
  const foundation = shade('#9a9488', 1);
  b.boxOn(0, -0.6, 0, w + 0.3, 0.7, d + 0.3, foundation);
  switch (style) {
    case 'house':
    case 'church': {
      b.boxOn(0, 0, 0, w, h, d, wall);
      gable(b, w, d, h, style === 'church' ? 3.6 : 2.4, roof, 0.5);
      windowsRow(b, w, h * 0.55, front, 3, 1.1, 1.2, glass, '#f4f0e6', 1.4);
      door(b, 0, front, 1.0, 2.1, shade(roof, 0.9), '#f4f0e6');
      if (style === 'church') {
        b.boxOn(0, h, -d / 2 + 2, 2.6, 7.5, 2.6, wall);
        b.cone(0, h + 7.5 + 1.8, -d / 2 + 2, 2.0, 3.6, roof, 6, Math.PI / 4);
        b.box(0, h + 8 + 3.2, -d / 2 + 2, 0.12, 1.4, 0.12, '#f0e6c0');
        b.box(0, h + 8 + 3.4, -d / 2 + 2, 0.7, 0.12, 0.12, '#f0e6c0');
      } else {
        b.boxOn(0, 0, front + 0.8, w * 0.5, 0.25, 1.6, shade('#8a6a4a', 1));
        b.box(0, 2.6, front + 0.9, w * 0.55, 0.12, 1.9, roof);
      }
      break;
    }
    case 'lodge': {
      b.boxOn(0, 0, 0, w, h, d, wall);
      for (let y = 0.4; y < h; y += 0.5) b.box(0, y, front + 0.02, w + 0.2, 0.1, 0.06, shade(wall, 0.75));
      gable(b, w, d, h, 4.2, roof, 0.9);
      windowsRow(b, w, h * 0.55, front, 5, 1.4, 1.6, '#e8c890', '#4a3020', 1.6);
      door(b, 0, front, 1.8, 2.4, '#4a2a18', '#3a2414');
      b.boxOn(0, 0, front + 1.3, w * 0.7, 0.35, 2.6, shade('#7a5434', 1));
      for (const x of [-w * 0.33, 0, w * 0.33]) b.boxOn(x, 0.35, front + 2.4, 0.3, 3.2, 0.3, '#5a3a24');
      b.box(0, 3.65, front + 1.5, w * 0.72, 0.15, 3.0, roof);
      b.boxOn(w / 2 - 3, h + 1, -2, 1.2, 4.5, 1.2, '#8a8078');
      break;
    }
    case 'shack':
    case 'kiosk':
    case 'restroom': {
      b.boxOn(0, 0, 0, w, h, d, wall);
      shedRoof(b, w, d, h, 0.9, roof);
      if (style === 'restroom') {
        door(b, -w * 0.25, front, 0.9, 2.1, '#3a5a7a', trim.getStyle());
        door(b, w * 0.25, front, 0.9, 2.1, '#7a3a4a', trim.getStyle());
      } else {
        door(b, -w * 0.18, front, 1.0, 2.1, shade(roof, 0.8), trim.getStyle());
        windowsRow(b, w * 0.6, h * 0.55, front, 1, 1.6, 1.1, glass, '#f4f0e6');
        b.box(w * 0.2, h * 0.55, front + 0.12, w * 0.4, 0.1, 0.4, trim);
      }
      if (style === 'shack') {
        b.boxOn(0, 0, front + 1, w, 0.18, 2, shade('#8a6a4a', 1));
        b.box(0, h - 0.1, front + 1.8, w, 0.1, 2.0, roof);
        for (const x of [-w / 2 + 0.2, w / 2 - 0.2]) b.boxOn(x, 0.18, front + 2.6, 0.18, h - 0.4, 0.18, '#6a4a2a');
      }
      break;
    }
    case 'canopy': {
      for (const [x, z] of [[-w / 2 + 1, -d / 2 + 1], [w / 2 - 1, -d / 2 + 1], [-w / 2 + 1, d / 2 - 1], [w / 2 - 1, d / 2 - 1]]) {
        b.boxOn(x, 0, z, 0.5, h, 0.5, '#d8d4cc');
      }
      b.box(0, h + 0.25, 0, w, 0.5, d, '#f2efe6');
      b.box(0, h + 0.25, d / 2 + 0.02, w + 0.04, 0.55, 0.06, roof);
      b.box(0, h + 0.25, -d / 2 - 0.02, w + 0.04, 0.55, 0.06, roof);
      b.box(w / 2 + 0.02, h + 0.25, 0, 0.06, 0.55, d + 0.04, roof);
      b.box(-w / 2 - 0.02, h + 0.25, 0, 0.06, 0.55, d + 0.04, roof);
      b.box(0, h - 0.02, 0, w - 0.4, 0.04, d - 0.4, '#fff8e8');
      break;
    }
    case 'warehouse':
    case 'garage':
    case 'lockers': {
      b.boxOn(0, 0, 0, w, h, d, wall);
      b.box(0, h + 0.2, 0, w + 0.3, 0.4, d + 0.3, trim);
      if (style === 'lockers') {
        const n = Math.floor(w / 3);
        for (let i = 0; i < n; i++) rollUp(b, -w / 2 + 1.5 + i * 3, front, 2.4, 2.6, '#e8902c');
      } else if (style === 'garage') {
        const n = w > 24 ? 3 : 2;
        for (let i = 0; i < n; i++) rollUp(b, -w / 2 + (w * (i + 0.5)) / n - (i === n - 1 ? 0 : 0), front, Math.min(4.2, w / n - 1.6), 4.0, '#c8ccd0');
        windowsRow(b, w, h - 1.2, front, 4, 1.4, 0.6, glass, '#e0e0e0');
      } else {
        for (const x of [-w * 0.3, 0, w * 0.3]) rollUp(b, x, front, 3.6, 4.2, '#8a95a0');
        b.boxOn(0, 0, front + 1.4, w * 0.92, 1.2, 2.8, '#a8a49a');
        for (const x of [-w * 0.3, 0, w * 0.3]) b.box(x, 1.25, front + 2.85, 2.4, 0.16, 0.2, '#2a2a2a');
        door(b, w / 2 - 2.2, front, 1.0, 2.2, '#3a4a5a', '#d0d0d0');
      }
      break;
    }
    case 'gas': {
      b.boxOn(0, 0, 0, w, h, d, wall);
      b.box(0, h + 0.3, 0, w + 0.4, 0.6, d + 0.4, roof);
      windowsRow(b, w, 1.6, front, 3, 2.6, 1.9, glass, '#d8d8d8', 0);
      door(b, w * 0.33, front, 1.2, 2.2, '#5a7a8a', '#d8d8d8');
      break;
    }
    case 'motel': {
      b.boxOn(0, 0, 0, w, h, d, wall);
      b.box(0, h + 0.15, 0, w + 0.6, 0.3, d + 1.6, roof);
      const n = Math.floor(w / 3.6);
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + 1.8 + i * 3.6;
        door(b, x - 0.7, front, 0.9, 2.1, i % 2 ? '#3a6a8a' : '#8a3a3a', '#f4ead5');
        b.box(x + 0.7, 1.5, front + 0.06, 1.0, 0.9, 0.05, glass);
      }
      // tall pole sign
      b.boxOn(w / 2 + 3, 0, front + 3, 0.35, 7.5, 0.35, '#5a5a5a');
      break;
    }
    case 'diner': {
      b.boxOn(0, 0, 0, w, h, d, wall);
      b.box(0, 1.0, front + 0.05, w + 0.1, 0.3, 0.1, '#c0c4c8');
      b.box(0, h - 0.3, front + 0.05, w + 0.1, 0.3, 0.1, '#e05a4a');
      windowsRow(b, w, 2.1, front, 4, 2.6, 1.4, glass, '#c0c4c8', 1.4);
      door(b, 0, front, 1.3, 2.2, '#5a7a8a', '#c0c4c8');
      b.box(0, h + 0.2, 0, w + 0.3, 0.4, d + 0.3, roof);
      break;
    }
    default: {
      // shops, grocery, dealer, office, ranger, travel, cafe
      b.boxOn(0, 0, 0, w, h, d, wall);
      b.box(0, h + 0.45, front - 0.1, w + 0.2, 0.9, 0.3, trim);
      b.box(0, h + 0.15, 0, w + 0.2, 0.3, d + 0.2, trim);
      const tall = style === 'office';
      if (tall) {
        for (let y = 2.0; y < h - 1; y += 3) windowsRow(b, w, y, front, Math.floor(w / 2.6), 1.6, 1.5, glass, '#d8d8d8');
      } else {
        windowsRow(b, w, 1.5, front, Math.max(2, Math.floor(w / 4)), 2.4, 1.8, glass, trim.getStyle(), 1.6);
      }
      door(b, 0, front, 1.6, 2.3, '#5a7a8a', '#e8e4dc');
      if (style === 'grocery' || style === 'cafe' || style === 'shop' || style === 'travel') {
        const stripeA = style === 'grocery' ? '#2f6b4a' : style === 'travel' ? '#b4513a' : '#c8673e';
        for (let i = 0; i < 8; i++) {
          const x = -w * 0.35 + (w * 0.7 * (i + 0.5)) / 8;
          b.box(x, 2.95, front + 0.75, (w * 0.7) / 8, 0.08, 1.5, i % 2 ? '#f4ead5' : stripeA, 0, -0.35);
        }
      }
      if (style === 'dealer') {
        b.boxOn(-w / 2 - 2.5, 0, front + 1, 0.3, 8, 0.3, '#5a5a5a');
        b.box(-w / 2 - 2.5, 8.2, front + 1, 3.2, 1.4, 0.3, '#2a4a7a');
      }
      if (style === 'ranger') b.boxOn(w / 2 + 2, 0, front + 1, 0.12, 6, 0.12, '#cfcfcf');
    }
  }
  if (def.sign) {
    const small = def.style === 'kiosk' || def.style === 'restroom' || def.style === 'shack';
    if (def.style === 'motel') {
      b.box(w / 2 + 3, 8.6, front + 3, 6.3, 1.6, 0.2, '#2a4a7a');
      signs.push({ def, w: 6, h: 6 / (512 / 112), y: 8.6, x: w / 2 + 3, z: front + 3.1, back: true });
    } else {
      const sw = Math.min(w * 0.8, small ? 4 : 9);
      const sh = sw / (512 / 112);
      const sy = small ? h - 0.2 - sh / 2 : Math.max(3.4 + sh / 2, h - 0.35 - sh / 2);
      signs.push({ def, w: sw, h: sh, y: sy, x: 0, z: front + 0.1, back: false });
    }
  }
}

interface SignSpot {
  def: BuildingDef;
  w: number;
  h: number;
  y: number;
  x: number;
  z: number;
  back: boolean;
}

export function buildBuildings(collision: CollisionWorld): THREE.Group {
  const group = new THREE.Group();
  group.name = 'buildings';
  const body = new GeoBuilder();
  const signDefs: SignSpot[] = [];
  for (const def of BUILDINGS) {
    const y0 = terrainHeight(def.x, def.z);
    body.base = new THREE.Matrix4().compose(new THREE.Vector3(def.x, y0, def.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), def.rot), new THREE.Vector3(1, 1, 1));
    buildOne(def, body, signDefs);
    if (def.style === 'canopy') {
      for (const [x, z] of [[-def.w / 2 + 1, -def.d / 2 + 1], [def.w / 2 - 1, -def.d / 2 + 1], [-def.w / 2 + 1, def.d / 2 - 1], [def.w / 2 - 1, def.d / 2 - 1]]) {
        const [wx, wz] = localToWorld(x, z, def.x, def.z, def.rot);
        collision.addCircle(wx, wz, 0.35, y0, y0 + def.h, 'pillar');
      }
    } else collision.addBox(def.x, def.z, def.w / 2, def.d / 2, def.rot, y0 - 1, y0 + def.h + 2, 'building');
  }
  body.base = null;
  const mesh = new THREE.Mesh(body.build(), MAT.vc);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  // signs
  const atlas = signAtlas(
    signDefs.map((s) => ({ key: s.def.id, text: s.def.sign!, ...(SIGN_STYLE[s.def.style] ?? SIGN_STYLE.default) })),
  );
  const sb = new GeoBuilder(true);
  for (const s of signDefs) {
    const def = s.def;
    const y0 = terrainHeight(def.x, def.z);
    sb.base = new THREE.Matrix4().compose(new THREE.Vector3(def.x, y0, def.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), def.rot), new THREE.Vector3(1, 1, 1));
    sb.quad(s.x, s.y, s.z + 0.04, s.w, s.h, '#ffffff', 0, 0, atlas.rect[def.id]);
    if (s.back) sb.quad(s.x, s.y, s.z - 0.24, s.w, s.h, '#ffffff', Math.PI, 0, atlas.rect[def.id]);
  }
  sb.base = null;
  const signMat = new THREE.MeshStandardMaterial({ map: atlas.texture, roughness: 0.6, emissive: 0xffffff, emissiveMap: atlas.texture, emissiveIntensity: 0.05 });
  const signs = new THREE.Mesh(sb.build(), signMat);
  signs.name = 'signs';
  group.add(signs);
  return group;
}
