import * as THREE from 'three';
import type { ItemDef } from '../data/types';
import { GeoBuilder, MAT, shade } from './builder';

// Item models in item-local coords: origin at the footprint center on the
// floor, front facing +Z, width along X, depth along Z.

export interface ModelOpts {
  mattress?: ItemDef | null;
  condition?: number;
  /** Cargo crate size override. */
  dims?: [number, number, number];
  blanket?: string;
}

const WOOD = '#b88a5a';
const WOOD_D = '#8a603a';
const COUNTER = '#e8dcc4';
const WHITE = '#f2f2ee';

function cabinetDoors(b: GeoBuilder, w: number, h: number, y0: number, z: number, n: number, color: string) {
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w * (i + 0.5)) / n;
    b.box(x, y0 + h / 2, z + 0.01, w / n - 0.04, h - 0.06, 0.02, color);
    b.box(x + (w / n) * 0.3, y0 + h - 0.12, z + 0.03, 0.08, 0.02, 0.02, '#c8b070');
  }
}

export function buildItemModel(def: ItemDef, o: ModelOpts = {}): THREE.Object3D {
  const b = new GeoBuilder();
  const fp = def.floor?.footprint ?? [def.dims[0], def.dims[1]];
  const w = fp[0], d = fp[1];
  const h = def.floor?.height ?? def.dims[2];
  const col = def.color ?? WOOD;
  const worn = o.condition != null && o.condition < 0.45;
  switch (def.model) {
    case 'bed': {
      const ph = h - 0.18;
      b.boxOn(0, 0, 0, w, ph, d, WOOD_D);
      cabinetDoors(b, w * 0.9, ph * 0.8, 0.05, d / 2, 3, shade(WOOD_D, 1.1).getStyle());
      if (o.mattress) {
        const mc = o.mattress.color ?? '#e8e6f0';
        const mh = Math.max(0.12, o.mattress.features?.mattress?.quality ?? 0.7) * 0.18;
        b.boxOn(0, ph, 0, w - 0.04, mh, d - 0.04, mc);
        const blanket = o.blanket ?? '#3f8f8a';
        b.boxOn(w * 0.08, ph + mh, 0, w * 0.78, 0.05, d - 0.02, blanket);
        b.box(w * 0.08, ph + mh * 0.6, d / 2 - 0.01, w * 0.78, mh + 0.05, 0.02, blanket);
        for (const z of [-d * 0.25, d * 0.25]) b.sphere(-w / 2 + 0.25, ph + mh + 0.08, z, 0.2, 0.08, 0.28, '#f6f2ea', 1);
      } else {
        b.boxOn(0, ph, 0, w - 0.04, 0.02, d - 0.04, '#c8a878');
      }
      break;
    }
    case 'mattress': {
      const [l, ww, hh] = def.dims;
      if (Math.abs(l - ww) > 0.6 && hh < 0.3) b.boxOn(0, 0, 0, ww, hh, l, def.color ?? '#e8e6f0');
      else b.cyl(0, ww / 2, 0, ww / 2, l, def.color ?? '#e8e6f0', 12, 0, Math.PI / 2);
      break;
    }
    case 'galley': {
      const stove = def.features?.galley?.stove;
      b.boxOn(0, 0, 0, w, h - 0.04, d, col);
      cabinetDoors(b, w * 0.94, h - 0.2, 0.06, d / 2, Math.max(2, Math.round(w / 0.45)), shade(col, 1.12).getStyle());
      b.boxOn(0, h - 0.04, 0, w + 0.02, 0.04, d + 0.02, COUNTER);
      // sink on the left part
      const sx = -w * 0.25;
      b.box(sx, h - 0.005, 0.02, 0.36, 0.012, 0.3, '#9aa0a6');
      b.box(sx, h - 0.002, 0.02, 0.3, 0.01, 0.24, '#5a6066');
      b.cyl(sx, h + 0.12, -d / 2 + 0.08, 0.015, 0.24, '#c8ccd0', 8);
      b.box(sx, h + 0.24, -d / 2 + 0.16, 0.025, 0.025, 0.16, '#c8ccd0');
      const kx = w * 0.22;
      if (stove === 'butane') {
        b.boxOn(kx, h, 0, 0.34, 0.09, 0.3, '#2a2a2e');
        b.cyl(kx, h + 0.1, 0, 0.08, 0.02, '#4a4a4e', 12);
      } else if (stove === 'propane') {
        b.box(kx, h + 0.005, 0, 0.55, 0.012, 0.45, '#2a2a2e');
        for (const [ox, oz] of [[-0.14, -0.1], [0.14, -0.1], [0, 0.11]]) b.cyl(kx + ox, h + 0.02, oz, 0.065, 0.02, '#4a4a4e', 12);
        b.box(kx, 0.42, d / 2 + 0.012, 0.5, 0.36, 0.02, '#2a2a2e');
        b.box(kx, 0.42, d / 2 + 0.02, 0.36, 0.2, 0.01, '#4a3a2a');
      } else if (stove === 'induction') {
        b.box(kx, h + 0.004, 0, 0.5, 0.008, 0.4, '#141416');
        b.cyl(kx - 0.1, h + 0.01, 0, 0.08, 0.002, '#3a3a3e', 16);
        b.cyl(kx + 0.12, h + 0.01, 0, 0.08, 0.002, '#3a3a3e', 16);
      }
      // backsplash
      b.box(0, h + 0.15, -d / 2 + 0.01, w, 0.3, 0.02, '#d8e4e8');
      // upper cabinet
      b.boxOn(0, h + 0.55, -d / 2 + 0.17, w, 0.4, 0.32, col);
      cabinetDoors(b, w * 0.94, 0.36, h + 0.57, -d / 2 + 0.33, Math.max(2, Math.round(w / 0.45)), shade(col, 1.12).getStyle());
      break;
    }
    case 'fridge': {
      const chest = h < 0.7;
      b.boxOn(0, 0, 0, w, h, d, WHITE);
      if (chest) {
        b.boxOn(0, h, 0, w - 0.02, 0.06, d - 0.02, '#dfe6ea');
        b.box(0, h + 0.03, d / 2 - 0.02, 0.2, 0.03, 0.04, '#5a6a7a');
        b.box(w / 2 - 0.08, h * 0.5, d / 2 + 0.01, 0.08, 0.05, 0.01, '#3a8a3a');
      } else {
        b.box(0, h * 0.62, d / 2 + 0.01, w - 0.04, 0.012, 0.01, '#c8ccd0');
        b.box(w / 2 - 0.08, h * 0.45, d / 2 + 0.03, 0.03, h * 0.3, 0.03, '#a8acb0');
        b.box(w / 2 - 0.08, h * 0.8, d / 2 + 0.03, 0.03, h * 0.12, 0.03, '#a8acb0');
      }
      break;
    }
    case 'toilet': {
      const composting = !!def.features?.toilet && def.features.toilet.kind === 'composting';
      b.boxOn(0, 0, -d * 0.15, w * 0.9, h * 0.7, d * 0.55, composting ? '#d8c8a0' : WHITE);
      b.cyl(0, h * 0.75, d * 0.12, w * 0.4, 0.06, composting ? '#c8b890' : '#e8e8e8', 12);
      b.cyl(0, h * 0.4, d * 0.1, w * 0.32, h * 0.8, composting ? '#e0d0a8' : WHITE, 12);
      b.box(0, h * 0.95, -d * 0.36, w * 0.8, 0.04, 0.16, '#d0d0cc');
      break;
    }
    case 'wetbath': {
      const t = 0.04;
      b.boxOn(0, 0, -d / 2 + t / 2, w, h, t, WHITE);
      b.boxOn(-w / 2 + t / 2, 0, 0, t, h, d, WHITE);
      b.boxOn(w / 2 - t / 2, 0, 0, t, h, d, WHITE);
      b.boxOn(0, h - 0.02, 0, w, 0.04, d, '#e8e8e4');
      // front wall with door
      b.boxOn(-w / 2 + 0.12, 0, d / 2 - t / 2, 0.24, h, t, WHITE);
      b.boxOn(0.12, 0, d / 2 - t / 2 + 0.01, w - 0.3, h - 0.1, t, '#e6e2d8');
      b.box(-0.15, 1.0, d / 2 + 0.02, 0.03, 0.12, 0.03, '#9a9a9a');
      b.box(0.12, 1.65, d / 2 + 0.02, 0.4, 0.25, 0.01, '#a8c0cc');
      break;
    }
    case 'dinette': {
      const bw = 0.5;
      for (const sx of [-1, 1]) {
        const x = sx * (w / 2 - bw / 2);
        b.boxOn(x, 0, 0, bw, 0.42, d, WOOD_D);
        b.boxOn(x, 0.42, 0, bw - 0.02, 0.1, d - 0.02, '#5a7a6a');
        b.boxOn(x + sx * (bw / 2 - 0.06), 0.52, 0, 0.12, 0.45, d - 0.02, '#5a7a6a');
      }
      b.boxOn(0, 0.7, -0.1, w - bw * 2 - 0.08, 0.04, d * 0.75, '#c9a77a');
      b.boxOn(0, 0, -0.1, 0.08, 0.7, 0.08, '#8a8a8a');
      break;
    }
    case 'table': {
      b.boxOn(0, h - 0.04, 0, w, 0.04, d + 0.2, '#c9a77a');
      b.boxOn(0, 0, 0.1, 0.06, h - 0.04, 0.06, '#8a8a8a');
      b.box(0, h - 0.12, -d / 2 + 0.02, w * 0.6, 0.08, 0.04, '#8a8a8a');
      break;
    }
    case 'chair': {
      b.cyl(0, 0.05, 0, 0.24, 0.05, '#3a3a3a', 12);
      b.cyl(0, 0.25, 0, 0.04, 0.38, '#5a5a5a', 8);
      b.boxOn(0, 0.42, 0, w * 0.85, 0.12, d * 0.85, col);
      b.box(0, 0.75, -d * 0.36, w * 0.85, 0.55, 0.12, col, 0, -0.12);
      for (const sx of [-1, 1]) b.boxOn(sx * w * 0.42, 0.54, 0, 0.06, 0.18, d * 0.6, shade(col, 0.8));
      break;
    }
    case 'cabinet': {
      b.boxOn(0, 0, 0, w, h, d, col);
      const n = h > 1.2 ? 2 : 1;
      cabinetDoors(b, w * 0.95, h * 0.94, h * 0.03, d / 2, n === 2 ? 2 : 2, shade(col, 1.12).getStyle());
      b.boxOn(0, h, 0, w + 0.02, 0.03, d + 0.02, shade(col, 0.85));
      break;
    }
    case 'shelf': {
      for (const sx of [-1, 1]) b.boxOn(sx * (w / 2 - 0.02), 0, 0, 0.04, h, d, col);
      b.boxOn(0, 0, -d / 2 + 0.01, w, h, 0.02, shade(col, 0.8));
      const bookCols = ['#c23a2c', '#2f6b4a', '#3a5a8a', '#e8b83c', '#8a4a7a', '#5a3a24'];
      for (let k = 0; k < 4; k++) {
        const y = 0.04 + k * (h / 4);
        b.boxOn(0, y, 0, w - 0.06, 0.025, d - 0.02, col);
        if (k < 3) {
          let x = -w / 2 + 0.06;
          let i = k;
          while (x < w / 2 - 0.1) {
            const bw2 = 0.035 + ((i * 7) % 5) * 0.01;
            b.boxOn(x + bw2 / 2, y + 0.025, 0, bw2, h / 4 - 0.07 - ((i * 3) % 4) * 0.02, d * 0.7, bookCols[i % bookCols.length]);
            x += bw2 + 0.004;
            i++;
          }
        }
      }
      b.box(0, h * 0.25 + 0.06, d / 2 - 0.01, w - 0.06, 0.04, 0.012, col);
      break;
    }
    case 'rug': {
      b.boxOn(0, 0, 0, w, 0.012, d, col);
      b.boxOn(0, 0.001, 0, w * 0.8, 0.013, d * 0.7, shade(col, 1.25));
      b.boxOn(0, 0.002, 0, w * 0.5, 0.014, d * 0.35, '#e8c86a');
      break;
    }
    case 'plant': {
      b.cyl(0, 0.13, 0, 0.13, 0.26, '#c2683e', 12, 0, 0, 0, 0.15);
      b.cyl(0, 0.27, 0, 0.14, 0.02, '#5a3a24', 12);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        b.sphere(Math.cos(a) * 0.07, 0.4 + (k % 3) * 0.06, Math.sin(a) * 0.07, 0.07, 0.16, 0.05, k % 2 ? '#3f8a4a' : '#5aa05a', 1, a);
      }
      b.sphere(0, 0.5, 0, 0.08, 0.12, 0.08, '#4a9a52', 1);
      break;
    }
    case 'crate': {
      const [l, ww, hh] = o.dims ?? def.dims;
      b.boxOn(0, 0, 0, ww, hh, l, '#c8955a');
      for (const y of [0.04, hh - 0.04]) {
        b.box(0, y, l / 2 + 0.006, ww + 0.004, 0.06, 0.012, '#9a6a3a');
        b.box(0, y, -l / 2 - 0.006, ww + 0.004, 0.06, 0.012, '#9a6a3a');
        b.box(ww / 2 + 0.006, y, 0, 0.012, 0.06, l + 0.004, '#9a6a3a');
        b.box(-ww / 2 - 0.006, y, 0, 0.012, 0.06, l + 0.004, '#9a6a3a');
      }
      b.box(0, hh / 2, l / 2 + 0.008, 0.06, hh, 0.012, '#9a6a3a', 0, 0, 0.6);
      break;
    }
    case 'campchair': {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(sx * 0.24, 0.22, sz * 0.22, 0.015, 0.5, '#5a5a5a', 8, sz * 0.25, sx * 0.1);
      b.boxOn(0, 0.42, 0, 0.5, 0.04, 0.44, col);
      b.box(0, 0.72, -0.24, 0.5, 0.5, 0.04, col, 0, -0.18);
      for (const sx of [-1, 1]) b.box(sx * 0.27, 0.6, 0, 0.04, 0.03, 0.42, '#5a5a5a');
      break;
    }
    case 'camptable': {
      b.boxOn(0, 0.7, 0, 0.9, 0.03, 0.6, col);
      for (const sx of [-1, 1]) b.box(sx * 0.35, 0.35, 0, 0.03, 0.7, 0.55, '#8a8a8a', 0, 0, sx * 0.1);
      break;
    }
    case 'battery': {
      b.boxOn(0, 0, 0, def.dims[1], def.dims[2], def.dims[0], col);
      b.box(0.05, def.dims[2] + 0.02, def.dims[0] * 0.3, 0.04, 0.04, 0.04, '#c23a2c');
      b.box(-0.05, def.dims[2] + 0.02, def.dims[0] * 0.3, 0.04, 0.04, 0.04, '#2a2a2a');
      break;
    }
    case 'solar': {
      const [l, ww] = def.dims;
      b.boxOn(0, 0, 0, ww, 0.035, l, '#c8ccd0');
      b.box(0, 0.04, 0, ww - 0.04, 0.01, l - 0.04, '#1c2a4a');
      for (let k = 1; k < 6; k++) b.box(0, 0.046, -l / 2 + (l * k) / 6, ww - 0.04, 0.003, 0.008, '#4a5a7a');
      break;
    }
    case 'fan': {
      b.boxOn(0, 0, 0, 0.4, 0.06, 0.4, '#e8e8e8');
      b.box(0, 0.12, -0.05, 0.36, 0.06, 0.32, '#c8c8c8', 0, 0.3);
      break;
    }
    case 'laptop': {
      b.boxOn(0, 0, 0, 0.36, 0.02, 0.25, '#3c4148');
      b.box(0, 0.12, -0.12, 0.36, 0.24, 0.015, '#3c4148', 0, 0.25);
      b.box(0, 0.12, -0.11, 0.32, 0.2, 0.004, '#4a7aa8', 0, 0.25);
      break;
    }
    case 'firewood': {
      for (let k = 0; k < 6; k++) b.cyl((k % 3) * 0.12 - 0.12, 0.06 + Math.floor(k / 3) * 0.11, 0, 0.055, 0.45, '#8a5a32', 8, Math.PI / 2);
      break;
    }
    case 'guitar': {
      b.sphere(0, 0.07, 0.2, 0.18, 0.06, 0.22, '#a8642c', 1);
      b.box(0, 0.07, -0.25, 0.06, 0.03, 0.55, '#5a3a24');
      break;
    }
    default: {
      // generic boxes, duffels, jugs, cans...
      const [l, ww, hh] = def.dims;
      if (def.model === 'duffel') b.cyl(0, hh / 2, 0, hh / 2, l, col, 12, 0, Math.PI / 2);
      else if (def.model === 'jug') {
        b.boxOn(0, 0, 0, ww, hh * 0.85, l, '#9ac8e8');
        b.cyl(0, hh * 0.92, 0, 0.05, hh * 0.15, '#2a5aa8', 8);
      } else if (def.model === 'can' || def.model === 'canister') b.cyl(0, hh / 2, 0, Math.min(l, ww) / 2, hh, col, 12);
      else {
        b.boxOn(0, 0, 0, ww, hh, l, def.category === 'grocery' ? col : '#c8a070');
        if (def.category !== 'grocery') b.box(0, hh + 0.001, 0, ww * 0.95, 0.002, 0.06, '#a8804a');
      }
    }
  }
  const mesh = new THREE.Mesh(b.build(), MAT.vc);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (worn) mesh.material = wornMat;
  return mesh;
}

const wornMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, color: 0xd8ccb8 });

/** Awning: roll tube, and the extended canopy (toggle visibility). */
export function buildAwning(length: number, color: string): { group: THREE.Group; canopy: THREE.Group } {
  const group = new THREE.Group();
  const b = new GeoBuilder();
  b.cyl(0, 0, 0, 0.07, length, '#e8e8e4', 12, Math.PI / 2);
  group.add(new THREE.Mesh(b.build(), MAT.vc));
  const canopy = new THREE.Group();
  const cb = new GeoBuilder();
  const depth = 2.4;
  for (let k = 0; k < 8; k++) {
    const z = -length / 2 + (length * (k + 0.5)) / 8;
    cb.box(-depth / 2, -0.18, z, depth, 0.02, length / 8, k % 2 ? color : '#f4ead5', 0, 0, 0.15);
  }
  for (const z of [-length / 2 + 0.1, length / 2 - 0.1]) {
    cb.box(-depth, -1.25, z, 0.04, 2.3, 0.04, '#9a9a9a');
    cb.box(-depth / 2, -0.95, z, depth, 0.03, 0.03, '#9a9a9a', 0, 0, -0.4);
  }
  const cm = new THREE.Mesh(cb.build(), MAT.vc);
  cm.castShadow = true;
  canopy.add(cm);
  canopy.visible = false;
  group.add(canopy);
  return { group, canopy };
}
