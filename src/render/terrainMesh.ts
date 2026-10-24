import * as THREE from 'three';
import { LAKE, MESAS, WORLD } from '../data/map';
import { fbm } from '../world/noise';
import { baseHeight, buildHeights, GRID, NX, NZ, plateauMask, roadDistance } from '../world/terrain';

// Chunked terrain with biome vertex colors, the lake, and a ring of distant
// mountains beyond the playable area.

const CHUNK = 50; // cells per chunk side (200 m)

const C = {
  sand: new THREE.Color('#d9b47c'),
  sand2: new THREE.Color('#c9a06a'),
  red: new THREE.Color('#c27448'),
  redDark: new THREE.Color('#9a5236'),
  rock: new THREE.Color('#a08470'),
  grass: new THREE.Color('#7f9a52'),
  grass2: new THREE.Color('#5f8444'),
  forest: new THREE.Color('#4f7440'),
  shore: new THREE.Color('#c8b88e'),
  mountainRock: new THREE.Color('#8a7e72'),
  snow: new THREE.Color('#eef0f2'),
  dry: new THREE.Color('#b8a868'),
};

const tmp = new THREE.Color();

export function terrainColor(x: number, z: number, h: number, ny: number, out: THREE.Color): THREE.Color {
  const pm = plateauMask(x, z);
  const n1 = fbm(x / 70, z / 70, 2, 91) * 0.5 + 0.5;
  const n2 = fbm(x / 23, z / 23, 2, 93) * 0.5 + 0.5;
  // desert base
  out.copy(C.sand).lerp(C.sand2, n1 * 0.8);
  let red = 0;
  for (const m of MESAS) {
    const d = Math.hypot(x - m.x, z - m.z);
    red = Math.max(red, 1 - THREE.MathUtils.smoothstep(d, m.r - 10, m.r + 120));
  }
  red = Math.max(red, THREE.MathUtils.smoothstep(x, 600, 1300) * 0.35, THREE.MathUtils.smoothstep(-x, 1250, 1500) * 0.6);
  if (red > 0) out.lerp(C.red, red * (0.55 + 0.35 * n2));
  // dry grass transition up the slope
  const pmT = THREE.MathUtils.smoothstep(pm, 0.08, 0.5);
  if (pmT > 0) {
    tmp.copy(C.dry).lerp(C.grass, THREE.MathUtils.smoothstep(pm, 0.3, 0.7));
    tmp.lerp(C.grass2, n1 * 0.6);
    if (pm > 0.65) tmp.lerp(C.forest, (n2 - 0.35) * 0.9 * THREE.MathUtils.smoothstep(pm, 0.65, 0.95));
    out.lerp(tmp, pmT);
  }
  // lake shore sand
  const q = ((x - LAKE.x) / LAKE.rx) ** 2 + ((z - LAKE.z) / LAKE.rz) ** 2;
  if (q < 1.25 && h < LAKE.level + 1.6) out.lerp(C.shore, (1 - THREE.MathUtils.smoothstep(h, LAKE.level + 0.2, LAKE.level + 1.6)) * 0.85);
  // steep slopes are rock
  const steep = 1 - THREE.MathUtils.smoothstep(ny, 0.68, 0.86);
  if (steep > 0) out.lerp(pm > 0.3 ? C.mountainRock : C.redDark, steep * 0.85);
  // high peaks
  if (h > 210) out.lerp(C.snow, THREE.MathUtils.smoothstep(h, 210, 260) * THREE.MathUtils.smoothstep(ny, 0.7, 0.9));
  // subtle darkening right next to roads (worn verge)
  const rd = roadDistance(x, z);
  if (rd < 14) out.multiplyScalar(0.92 + 0.08 * (rd / 14));
  return out;
}

export interface TerrainView {
  group: THREE.Group;
  water: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  waterUniforms: { uTime: { value: number } };
}

export function buildTerrain(): TerrainView {
  const hs = buildHeights();
  const group = new THREE.Group();
  group.name = 'terrain';
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  // normals for the whole grid
  const normals = new Float32Array(NX * NZ * 3);
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const hl = hs[j * NX + Math.max(0, i - 1)], hr = hs[j * NX + Math.min(NX - 1, i + 1)];
      const hd = hs[Math.max(0, j - 1) * NX + i], hu = hs[Math.min(NZ - 1, j + 1) * NX + i];
      const nx = (hl - hr) / (2 * GRID), nz = (hd - hu) / (2 * GRID);
      const len = Math.hypot(nx, 1, nz);
      const k = (j * NX + i) * 3;
      normals[k] = nx / len;
      normals[k + 1] = 1 / len;
      normals[k + 2] = nz / len;
    }
  }
  const verts = (CHUNK + 1) * (CHUNK + 1);
  const index: number[] = [];
  for (let j = 0; j < CHUNK; j++) {
    for (let i = 0; i < CHUNK; i++) {
      const a = j * (CHUNK + 1) + i, b = a + 1, c = a + CHUNK + 1, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const sharedIndex = new THREE.BufferAttribute(new Uint32Array(index), 1);
  const col = new THREE.Color();
  for (let cj = 0; cj < NZ - 1; cj += CHUNK) {
    for (let ci = 0; ci < NX - 1; ci += CHUNK) {
      const cw = Math.min(CHUNK, NX - 1 - ci), chh = Math.min(CHUNK, NZ - 1 - cj);
      const full = cw === CHUNK && chh === CHUNK;
      const vw = cw + 1, vh = chh + 1;
      const pos = new Float32Array(vw * vh * 3);
      const nor = new Float32Array(vw * vh * 3);
      const colors = new Float32Array(vw * vh * 3);
      for (let j = 0; j < vh; j++) {
        for (let i = 0; i < vw; i++) {
          const gi = ci + i, gj = cj + j;
          const x = WORLD.minX + gi * GRID, z = WORLD.minZ + gj * GRID;
          const h = hs[gj * NX + gi];
          const k = (j * vw + i) * 3;
          pos[k] = x;
          pos[k + 1] = h;
          pos[k + 2] = z;
          const g = (gj * NX + gi) * 3;
          nor[k] = normals[g];
          nor[k + 1] = normals[g + 1];
          nor[k + 2] = normals[g + 2];
          terrainColor(x, z, h, normals[g + 1], col);
          colors[k] = col.r;
          colors[k + 1] = col.g;
          colors[k + 2] = col.b;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      if (full && vw * vh === verts) geo.setIndex(sharedIndex);
      else {
        const idx: number[] = [];
        for (let j = 0; j < chh; j++) {
          for (let i = 0; i < cw; i++) {
            const a = j * vw + i, b = a + 1, c = a + vw, d = c + 1;
            idx.push(a, c, b, b, c, d);
          }
        }
        geo.setIndex(idx);
      }
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, material);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
  }
  group.add(buildOuterRing(material));
  const { mesh: water, uniforms } = buildLake();
  group.add(water);
  return { group, water, material, waterUniforms: uniforms };
}

function buildOuterRing(material: THREE.Material): THREE.Mesh {
  const S = 64;
  const ext = 2600;
  const x0 = WORLD.minX - ext, x1 = WORLD.maxX + ext, z0 = WORLD.minZ - ext, z1 = WORLD.maxZ + ext;
  const nx = Math.ceil((x1 - x0) / S) + 1, nz = Math.ceil((z1 - z0) / S) + 1;
  const pos: number[] = [], colors: number[] = [], idx: number[] = [];
  const col = new THREE.Color();
  const inner = (x: number, z: number) => x > WORLD.minX + 20 && x < WORLD.maxX - 20 && z > WORLD.minZ + 20 && z < WORLD.maxZ - 20;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * S, z = z0 + j * S;
      const out = Math.max(WORLD.minX - x, x - WORLD.maxX, WORLD.minZ - z, z - WORLD.maxZ, 0);
      let h = baseHeight(Math.max(WORLD.minX, Math.min(WORLD.maxX, x)), Math.max(WORLD.minZ, Math.min(WORLD.maxZ, z)));
      h += Math.min(1, out / 900) * (180 + 260 * (fbm(x / 600, z / 600, 4, 33) * 0.5 + 0.5));
      if (inner(x, z)) h -= 30;
      pos.push(x, h - 1.5, z);
      terrainColor(x, z, h, 0.8, col);
      if (h > 260) col.lerp(C.snow, Math.min(1, (h - 260) / 120));
      colors.push(col.r, col.g, col.b);
    }
  }
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const xa = x0 + i * S, za = z0 + j * S;
      if (inner(xa, za) && inner(xa + S, za + S)) continue;
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.name = 'outer-ring';
  return m;
}

const waterVert = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormal2;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const waterFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSky;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
varying vec3 vWorld;
#include <fog_pars_fragment>
void main() {
  vec2 p = vWorld.xz;
  float t = uTime;
  vec3 n = normalize(vec3(
    0.06 * sin(p.x * 0.31 + t * 1.1) + 0.04 * sin(p.y * 0.53 - t * 1.4) + 0.03 * sin((p.x + p.y) * 0.9 + t * 2.1),
    1.0,
    0.06 * cos(p.y * 0.27 + t * 0.9) + 0.04 * cos(p.x * 0.47 + t * 1.6) + 0.03 * cos((p.x - p.y) * 0.8 - t * 1.8)));
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  vec3 col = mix(uDeep, uShallow, 0.35);
  col = mix(col, uSky, clamp(fres * 0.85 + 0.12, 0.0, 1.0));
  vec3 h = normalize(uSunDir + v);
  col += uSunColor * pow(max(dot(n, h), 0.0), 220.0) * 1.6;
  gl_FragColor = vec4(col, 0.92);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function buildLake(): { mesh: THREE.Mesh; uniforms: any } {
  const geo = new THREE.CircleGeometry(1, 72);
  geo.rotateX(-Math.PI / 2);
  const uniforms = {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color('#1f4a5e') },
    uShallow: { value: new THREE.Color('#3f8a8a') },
    uSky: { value: new THREE.Color('#9ec4e0') },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color('#ffffff') },
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: waterVert, fragmentShader: waterFrag, uniforms, transparent: true, fog: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.set(LAKE.rx * 1.06, 1, LAKE.rz * 1.06);
  mesh.position.set(LAKE.x, LAKE.level, LAKE.z);
  mesh.name = 'lake';
  return { mesh, uniforms };
}
