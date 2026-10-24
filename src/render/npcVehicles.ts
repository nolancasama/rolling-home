import * as THREE from 'three';
import { GeoBuilder, MAT, shade } from './builder';

// Merged single-mesh vehicles for NPCs, campers and traffic.
// Local frame: +Z forward, ground at y = 0.

function wheels(b: GeoBuilder, zs: number[], track: number, r: number, w = 0.22) {
  for (const z of zs) {
    for (const sx of [-1, 1]) {
      b.cyl(sx * track / 2, r, z, r, w, '#1f1f22', 12, 0, Math.PI / 2);
      b.cyl(sx * (track / 2 + 0.005), r, z, r * 0.55, w + 0.02, '#c8ccd0', 12, 0, Math.PI / 2);
    }
  }
}

function windowsSide(b: GeoBuilder, x: number, zs: [number, number][], y0: number, y1: number) {
  for (const [z0, z1] of zs) {
    for (const sx of [-1, 1]) b.box(sx * x, (y0 + y1) / 2, (z0 + z1) / 2, 0.02, y1 - y0, z1 - z0, '#2e3e4a');
  }
}

export function carMesh(color: string, kind: 'sedan' | 'pickup' | 'suv' | 'boxtruck'): THREE.Mesh {
  const b = new GeoBuilder();
  const c = color;
  if (kind === 'boxtruck') {
    b.boxOn(0, 0.5, -1.0, 2.3, 2.6, 5.0, '#f0f0ea');
    b.boxOn(0, 0.45, 2.3, 2.2, 1.8, 1.8, c);
    b.box(0, 1.7, 3.1, 2.0, 0.8, 0.1, '#2e3e4a', 0, -0.2);
    wheels(b, [2.4, -2.4], 1.9, 0.48, 0.3);
  } else {
    const len = kind === 'pickup' ? 5.4 : kind === 'suv' ? 4.8 : 4.6;
    const hgt = kind === 'suv' ? 1.25 : 0.95;
    b.boxOn(0, 0.32, 0, 1.85, hgt * 0.62, len, c);
    if (kind === 'pickup') {
      b.boxOn(0, 0.32 + hgt * 0.62, 0.7, 1.75, 0.75, 2.2, c);
      b.box(0, 0.32 + hgt * 0.62 + 0.45, 1.81, 1.6, 0.5, 0.02, '#2e3e4a');
      b.boxOn(0, 0.92, -1.5, 1.8, 0.35, 2.3, shade(c, 0.8));
    } else {
      b.boxOn(0, 0.32 + hgt * 0.62, -0.25, 1.7, hgt * 0.62, len * 0.55, c);
      b.box(0, 0.32 + hgt * 0.62 + hgt * 0.3, len * 0.025 + 0.02 + len * 0.25, 1.55, hgt * 0.5, 0.02, '#2e3e4a', 0, -0.35);
      windowsSide(b, 0.86, [[-len * 0.45 + 0.2, len * 0.0], [len * 0.02, len * 0.24]], 0.32 + hgt * 0.68, 0.32 + hgt * 1.15);
    }
    b.box(0, 0.45, len / 2 + 0.02, 1.85, 0.2, 0.08, '#2a2a2a');
    b.box(0, 0.45, -len / 2 - 0.02, 1.85, 0.2, 0.08, '#2a2a2a');
    for (const sx of [-0.65, 0.65]) {
      b.box(sx, 0.7, len / 2 + 0.01, 0.3, 0.12, 0.04, '#f8f4e8');
      b.box(sx, 0.7, -len / 2 - 0.01, 0.3, 0.12, 0.04, '#b02020');
    }
    wheels(b, [len * 0.32, -len * 0.32], 1.62, 0.34);
  }
  const m = new THREE.Mesh(b.build(), MAT.vcShiny);
  m.castShadow = true;
  return m;
}

export function vintageMotorhome(): THREE.Mesh {
  const b = new GeoBuilder();
  const cream = '#f2e6c8', teal = '#3f9a9a';
  b.boxOn(0, 0.45, -0.3, 2.4, 2.5, 8.0, cream);
  b.sphere(0, 1.7, 3.6, 1.2, 1.25, 0.9, cream, 2);
  b.boxOn(0, 0.45, -0.3, 2.42, 0.9, 8.02, teal);
  b.box(0, 2.0, 3.95, 2.0, 0.7, 0.3, '#2e3e4a', 0, -0.4);
  windowsSide(b, 1.21, [[-3.2, -2.2], [-1.6, -0.2], [0.6, 2.2]], 1.6, 2.3);
  b.box(0, 3.05, -1.5, 0.9, 0.3, 1.0, '#e8e8e4');
  b.boxOn(-1.25, 0.2, 0.2, 0.15, 0.15, 0.8, '#5a5a5a');
  wheels(b, [2.6, -2.4], 2.05, 0.42);
  const m = new THREE.Mesh(b.build(), MAT.vcShiny);
  m.castShadow = true;
  return m;
}

export function vanlifeVan(): THREE.Mesh {
  const b = new GeoBuilder();
  const c = '#5a7a6a';
  b.boxOn(0, 0.45, -0.4, 2.0, 2.3, 4.6, c);
  b.boxOn(0, 0.45, 2.3, 2.0, 1.1, 1.2, c);
  b.box(0, 1.85, 2.0, 1.85, 0.75, 0.05, '#2e3e4a', 0, -0.45);
  windowsSide(b, 1.0, [[-2.2, -1.2], [0.6, 1.6]], 1.6, 2.2);
  for (let k = 0; k < 3; k++) b.box(0, 2.8, -2.0 + k * 1.15, 1.6, 0.05, 1.05, '#1c2a4a');
  b.box(0.45, 2.92, 0, 0.45, 0.08, 2.6, '#e8b83c', 0, 0, 0.05);
  wheels(b, [1.9, -1.6], 1.72, 0.36);
  const m = new THREE.Mesh(b.build(), MAT.vcShiny);
  m.castShadow = true;
  return m;
}

export function semiTruck(): THREE.Mesh {
  const b = new GeoBuilder();
  const red = '#a8322a';
  b.boxOn(0, 0.55, 5.8, 2.5, 2.6, 2.4, red);
  b.boxOn(0, 0.55, 7.6, 2.4, 1.3, 1.4, red);
  b.boxOn(0, 3.15, 5.4, 2.3, 0.7, 1.6, shade(red, 0.85));
  b.box(0, 2.45, 7.02, 2.2, 0.9, 0.05, '#2e3e4a', 0, -0.25);
  b.cyl(1.35, 2.6, 4.8, 0.09, 2.2, '#c8ccd0', 8);
  b.cyl(-1.35, 2.6, 4.8, 0.09, 2.2, '#c8ccd0', 8);
  b.boxOn(0, 1.2, -2.6, 2.6, 2.9, 12.5, '#e8e8e2');
  b.box(0, 2.6, -2.6, 2.62, 0.4, 12.4, '#2f5a8a');
  wheels(b, [7.4, 4.9, 4.0], 2.1, 0.52, 0.3);
  wheels(b, [-6.8, -7.9], 2.1, 0.52, 0.3);
  const m = new THREE.Mesh(b.build(), MAT.vcShiny);
  m.castShadow = true;
  return m;
}

export function genericCamper(seed: number): THREE.Mesh {
  const b = new GeoBuilder();
  const palette = ['#f2efe6', '#e8e2d4', '#f4f0e8', '#ecebe6'];
  const accents = ['#2f5f8f', '#8f3a2f', '#3a7a5a', '#6a5a8a', '#c8853a'];
  const body = palette[seed % palette.length];
  const acc = accents[seed % accents.length];
  const kind = seed % 3;
  if (kind === 0) {
    // travel trailer + pickup
    b.boxOn(0, 0.45, -2.2, 2.4, 2.45, 6.4, body);
    b.box(0, 1.1, -2.2, 2.42, 0.18, 6.42, acc);
    windowsSide(b, 1.21, [[-4.2, -3.4], [-1.8, -0.6]], 1.6, 2.2);
    wheels(b, [-2.6], 2.05, 0.36);
    b.boxOn(0, 0.3, 1.4, 0.15, 0.2, 1.2, '#4a4a4a');
    const truck = carMesh(acc, 'pickup');
    truck.geometry.translate(0, 0, 4.6);
    b.addGeometry(truck.geometry, new THREE.Matrix4(), '#ffffff');
  } else if (kind === 1) {
    // small class C
    b.boxOn(0, 0.6, -0.8, 2.35, 2.55, 5.6, body);
    b.boxOn(0, 2.0, 2.4, 2.3, 1.0, 1.2, body);
    b.boxOn(0, 0.55, 2.9, 2.0, 1.4, 1.8, body);
    b.box(0, 1.65, 3.6, 1.8, 0.6, 0.05, '#2e3e4a', 0, -0.4);
    b.box(0, 1.4, -0.8, 2.37, 0.14, 5.62, acc);
    windowsSide(b, 1.18, [[-3.0, -2.2], [-0.6, 0.8]], 1.7, 2.3);
    wheels(b, [2.8, -1.4], 1.9, 0.4);
  } else {
    // camper van
    b.boxOn(0, 0.45, -0.3, 2.0, 2.35, 4.8, body);
    b.boxOn(0, 0.45, 2.4, 2.0, 1.1, 1.0, body);
    b.box(0, 1.8, 2.05, 1.85, 0.7, 0.05, '#2e3e4a', 0, -0.45);
    b.box(0, 1.05, -0.3, 2.02, 0.12, 4.82, acc);
    windowsSide(b, 1.0, [[-2.2, -1.0], [0.6, 1.5]], 1.6, 2.2);
    wheels(b, [2.0, -1.5], 1.72, 0.36);
  }
  const m = new THREE.Mesh(b.build(), MAT.vcShiny);
  m.castShadow = true;
  return m;
}

export const NPC_VEHICLE_SIZE = {
  vintage: { hw: 1.25, hl: 4.4 },
  vanlife: { hw: 1.05, hl: 3.0 },
  semi: { hw: 1.3, hl: 9.4 },
  camper: { hw: 1.25, hl: 4.0 },
};
