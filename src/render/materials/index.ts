import * as THREE from 'three';
import { materialDef } from '../../data/materials';
import type { Finish, MaterialDef, SurfaceKind } from '../../data/types';

/** All interior shaders refer to these objects; changing them never recompiles a shader. */
export const interiorAmbient = { value: .85 };
/** Bounce light inside the vehicle: scales the interior environment's diffuse and specular contribution. */
export const interiorBounce = { value: new THREE.Color(0, 0, 0) };
const ambientMaterials = new WeakSet<THREE.Material>();
let interiorEnvironment: THREE.Texture | null = null;

/** Prefiltered room environment used as soft bounce light by every interior material created afterwards. */
export function setInteriorEnvironment(texture: THREE.Texture): void {
  interiorEnvironment = texture;
}

// Without global illumination an RV interior only sees the attenuated sky hemisphere and goes murky
// (white ceilings render brown). A neutral room environment, scaled per frame by window light and lit
// fixtures, stands in for the light bouncing around the room.
const BOUNCE = `#include <lights_fragment_maps>
#if defined( RE_IndirectDiffuse )
  iblIrradiance *= interiorBounce;
#endif
#if defined( RE_IndirectSpecular )
  radiance *= interiorBounce;
  #ifdef USE_CLEARCOAT
    clearcoatRadiance *= interiorBounce;
  #endif
#endif`;

export function applyInteriorAmbient(material: THREE.MeshStandardMaterial): void {
  if (ambientMaterials.has(material)) return;
  ambientMaterials.add(material);
  material.userData.interiorAmbient = true;
  if (interiorEnvironment && !material.envMap) {
    material.envMap = interiorEnvironment;
    material.envMapIntensity = 1;
  }
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.interiorAmbient = interiorAmbient;
    shader.uniforms.interiorBounce = interiorBounce;
    shader.fragmentShader = 'uniform float interiorAmbient;\nuniform vec3 interiorBounce;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>',
      THREE.ShaderChunk.lights_fragment_begin.replace(
        'getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal )',
        '(interiorAmbient * getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal ))'))
      .replace('#include <lights_fragment_maps>', BOUNCE);
  };
  material.customProgramCacheKey = () => previousKey + '|rh-interior-ambient-v2';
  material.needsUpdate = true;
}

export interface FinishMaterialOptions {
  interior?: boolean;
  side?: THREE.Side;
  opacity?: number;
  transparent?: boolean;
  depthWrite?: boolean;
  polygonOffset?: boolean;
  clippingPlanes?: THREE.Plane[];
  resolution?: 512 | 1024;
}

type FinishMaterial = THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
interface Entry { material: FinishMaterial; references: number; textures: THREE.Texture[]; textureKey: string }
interface TextureEntry { textures: THREE.Texture[]; references: number }
const entries = new Map<string, Entry>();
const textureEntries = new Map<string, TextureEntry>();
const reverse = new WeakMap<THREE.Material, string>();
const planeIds = new WeakMap<THREE.Plane, number>();
let nextPlaneId = 1, anisotropy = 4;
let generatedMs = 0, generatedCount = 0;

export function configureMaterialAnisotropy(max: number): void {
  anisotropy = Math.max(1, max);
  for (const entry of entries.values()) for (const texture of entry.textures) {
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
  }
}

/** UVs are meters. An acquisition must have a matching releaseFinishMaterial. */
export function finishMaterial(finish: Finish, kind: SurfaceKind, opts: FinishMaterialOptions = {}): FinishMaterial {
  const def = materialDef(finish.mat);
  const px = opts.resolution ?? (['floor', 'wall', 'ceiling'].includes(kind) ? 1024 : 512);
  const planes = opts.clippingPlanes?.map(plane => {
    if (!planeIds.has(plane)) planeIds.set(plane, nextPlaneId++);
    return planeIds.get(plane);
  });
  const key = JSON.stringify([finish, kind, px, opts.interior ?? true, opts.side ?? THREE.DoubleSide,
    opts.opacity ?? 1, opts.transparent ?? false, opts.depthWrite ?? true, opts.polygonOffset ?? false, planes]);
  const cached = entries.get(key);
  if (cached) { cached.references++; return cached.material; }
  const start = performance.now();
  const textureKey = JSON.stringify([finish, px]);
  let shared = textureEntries.get(textureKey);
  if (!shared) {
    const maps = generateMaps(def, finish, px);
    const textures = [maps.albedo, maps.normal, maps.roughness].map((canvas, i) => {
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = i === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = anisotropy;
      texture.generateMipmaps = true;
      const scale = finish.scale ?? 1;
      texture.repeat.set(1 / (maps.repeat[0] * scale), 1 / (maps.repeat[1] * scale));
      texture.rotation = (finish.rot ?? 0) * Math.PI / 180;
      texture.offset.set(finish.offset?.[0] ?? 0, finish.offset?.[1] ?? 0);
      return texture;
    });
    shared = { textures, references: 0 };
    textureEntries.set(textureKey, shared);
    generatedMs += performance.now() - start;
    generatedCount++;
    console.debug(`[materials] ${def.id}: ${(performance.now() - start).toFixed(1)} ms; total ${generatedCount} maps in ${generatedMs.toFixed(1)} ms`);
  }
  shared.references++;
  const textures = shared.textures;
  const physical = def.pattern === 'fabric' || def.pattern === 'carpet' || def.pattern === 'leather' ||
    (def.clearcoat ?? 0) > 0 || (def.metalness ?? 0) > 0 || (finish.roughness ?? def.roughness) < .25;
  const material: FinishMaterial = physical ? new THREE.MeshPhysicalMaterial() : new THREE.MeshStandardMaterial();
  material.name = `Finish: ${def.name}`;
  material.map = textures[0];
  material.normalMap = textures[1];
  material.normalScale.setScalar(def.pattern === 'carpet' || def.pattern === 'fabric' ? .32 : .22);
  material.roughnessMap = textures[2];
  material.roughness = 1;
  material.metalness = def.metalness ?? 0;
  material.side = opts.side ?? THREE.DoubleSide;
  material.shadowSide = THREE.DoubleSide;
  material.opacity = opts.opacity ?? 1;
  material.transparent = opts.transparent ?? false;
  material.depthWrite = opts.depthWrite ?? true;
  material.clippingPlanes = opts.clippingPlanes ?? null;
  material.clipShadows = true;
  material.polygonOffset = opts.polygonOffset ?? false;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;
  if (material instanceof THREE.MeshPhysicalMaterial) {
    material.sheen = def.sheen ?? (def.pattern === 'fabric' || def.pattern === 'carpet' ? .28 : 0);
    material.sheenColor.set(finish.color ?? def.color);
    material.sheenRoughness = .8;
    material.clearcoat = def.clearcoat ?? (def.pattern === 'leather' ? .2 : (finish.roughness ?? def.roughness) < .25 ? .28 : 0);
    material.clearcoatRoughness = .24;
  }
  if (opts.interior !== false) applyInteriorAmbient(material);
  entries.set(key, { material, references: 1, textures, textureKey });
  reverse.set(material, key);
  return material;
}

/** Shared textures survive until the last owner releases its acquisition. */
export function releaseFinishMaterial(material: THREE.Material): void {
  const key = reverse.get(material);
  if (!key) return;
  const entry = entries.get(key);
  if (!entry || --entry.references > 0) return;
  entry.material.dispose();
  const shared = textureEntries.get(entry.textureKey);
  if (shared && --shared.references === 0) {
    for (const texture of shared.textures) texture.dispose();
    textureEntries.delete(entry.textureKey);
  }
  entries.delete(key);
  reverse.delete(material);
}

export function materialGenerationStats(): { count: number; milliseconds: number; cached: number } {
  return { count: generatedCount, milliseconds: generatedMs, cached: entries.size };
}

export function swatch(finish: Finish, _kind: SurfaceKind, px = 96): HTMLCanvasElement {
  const size = Math.max(16, Math.round(px));
  const source = drawPattern(materialDef(finish.mat), finish, size);
  const [result, g] = canvas(size);
  const pattern = g.createPattern(source.albedo, 'repeat')!;
  const scale = finish.scale ?? 1;
  pattern.setTransform(new DOMMatrix().translate((finish.offset?.[0] ?? 0) * size,
    (finish.offset?.[1] ?? 0) * size).rotate(finish.rot ?? 0).scale(source.repeat[0] * scale, source.repeat[1] * scale));
  g.fillStyle = pattern; g.fillRect(0, 0, size, size);
  return result;
}

function canvas(px: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement('canvas');
  element.width = element.height = px;
  return [element, element.getContext('2d', { willReadFrequently: true })!];
}
function hash(value: string): number {
  let seed = 2166136261;
  for (let i = 0; i < value.length; i++) seed = Math.imul(seed ^ value.charCodeAt(i), 16777619);
  return seed >>> 0;
}
function random(seed: number): () => number {
  return () => { seed = Math.imul(seed ^ seed >>> 15, 1 | seed); seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed); return ((seed ^ seed >>> 14) >>> 0) / 4294967296; };
}
function rgb(hex: string): [number, number, number] {
  const color = new THREE.Color(hex);
  color.convertLinearToSRGB();
  return [color.r * 255, color.g * 255, color.b * 255];
}
function tone(color: string, amount: number): string {
  const c = rgb(color);
  return `rgb(${c.map(v => Math.max(0, Math.min(255, Math.round(v + amount)))).join(',')})`;
}

interface PatternCanvas { albedo: HTMLCanvasElement; height: HTMLCanvasElement; repeat: [number, number] }
function drawPattern(def: MaterialDef, finish: Finish, px: number): PatternCanvas {
  const [albedo, g] = canvas(px), [height, h] = canvas(px);
  const base = finish.color ?? def.color, second = finish.color2 ?? def.color2 ?? tone(base, -35);
  const rand = random(hash(JSON.stringify([def.id, base, second, finish.plankW, finish.plankL])));
  const repeat: [number, number] = [...def.repeat];
  const motif = def.motif ?? '', pattern = def.pattern;
  g.fillStyle = base; g.fillRect(0, 0, px, px);
  h.fillStyle = '#808080'; h.fillRect(0, 0, px, px);

  // Fine seeded surface detail is generated at bounded resolution then enlarged. The outlines,
  // grain, joins and motifs below remain at full texture resolution.
  const noiseSize = Math.min(256, px), [noise, n] = canvas(noiseSize);
  const data = n.createImageData(noiseSize, noiseSize);
  const strength = pattern === 'paint' || pattern === 'plastic' ? 9 : 30;
  for (let i = 0; i < data.data.length; i += 4) {
    const v = 128 + (rand() - .5) * strength;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  n.putImageData(data, 0, 0);
  g.globalCompositeOperation = 'soft-light'; g.drawImage(noise, 0, 0, px, px); g.globalCompositeOperation = 'source-over';
  h.drawImage(noise, 0, 0, px, px);

  const line = (context: CanvasRenderingContext2D, color: string, width: number, x0: number, y0: number, x1: number, y1: number) => {
    context.strokeStyle = color; context.lineWidth = Math.max(.5, width); context.beginPath(); context.moveTo(x0, y0); context.lineTo(x1, y1); context.stroke();
  };
  const wood = (x: number, y: number, w: number, len: number, horizontal = false, board = true) => {
    g.save(); h.save(); g.translate(x, y); h.translate(x, y);
    if (horizontal) { g.rotate(-Math.PI / 2); h.rotate(-Math.PI / 2); g.translate(-w, 0); h.translate(-w, 0); }
    g.beginPath(); g.rect(0, 0, w, len); g.clip();
    // Individual floor planks differ visibly in tone; veneer faces stay even.
    const variation = (rand() - .5) * (pattern === 'plank' ? 46 : 25);
    g.fillStyle = tone(base, variation); g.fillRect(0, 0, w, len);
    const grainCount = Math.max(8, Math.round(w / 2));
    for (let j = 0; j < grainCount; j++) {
      const gx = rand() * w, bend = (rand() - .5) * w * .25;
      g.strokeStyle = tone(base, variation - 22 + rand() * 34); g.globalAlpha = .35 + rand() * .35;
      g.lineWidth = .4 + rand() * 1.2; g.beginPath(); g.moveTo(gx, 0);
      g.bezierCurveTo(gx + bend, len * .3, gx - bend, len * .7, gx, len); g.stroke();
      h.strokeStyle = '#757575'; h.lineWidth = .6; h.beginPath(); h.moveTo(gx, 0);
      h.bezierCurveTo(gx + bend, len * .3, gx - bend, len * .7, gx, len); h.stroke();
    }
    g.globalAlpha = 1;
    if (motif === 'knots' || (pattern === 'wood' && rand() > .5)) {
      g.strokeStyle = tone(base, -35); g.globalAlpha = .4;
      for (let k = 1; k < 5; k++) { g.beginPath(); g.ellipse(w * .6, len * .4, k * w * .035, k * len * .028, 0, 0, Math.PI * 2); g.stroke(); }
      g.globalAlpha = 1;
    }
    if (board) {
      const seam = Math.max(1, px * .0015);
      g.strokeStyle = motif === 'teakholly' ? second : tone(base, -45);
      g.lineWidth = motif === 'teakholly' ? Math.max(2, w * .04) : seam;
      g.strokeRect(0, 0, w, len);
      h.fillStyle = '#343434'; h.fillRect(0, 0, seam, len); h.fillRect(0, 0, w, seam);
      h.fillStyle = '#b0b0b0'; h.fillRect(seam, seam, seam, len - seam); h.fillRect(seam, seam, w - seam, seam);
    }
    g.restore(); h.restore();
  };
  if (pattern === 'plank' || pattern === 'wood' || pattern === 'cork') {
    if (motif === 'herringbone') {
      const ratio = Math.max(2, Math.round((finish.plankL ?? .45) / (finish.plankW ?? .09)));
      const cell = px / (ratio * 2);
      repeat[0] = repeat[1] = (finish.plankW ?? .09) * ratio * 2;
      for (let j = -ratio; j < ratio * 3; j++) for (let i = -3; i < 3; i++) {
        const x = (2 * ratio * i + j) * cell, y = j * cell;
        wood(x, y, cell, ratio * cell, true);
        wood(x + ratio * cell, y - (ratio - 1) * cell, cell, ratio * cell);
      }
    } else if (pattern === 'plank' || pattern === 'cork' || motif === 'hardboard') {
      const count = motif === 'butcher' ? 6 : 4;
      repeat[0] = (finish.plankW ?? def.plank?.widths[0] ?? def.repeat[0]) * count;
      repeat[1] = (finish.plankL ?? def.plank?.lengths[0] ?? def.repeat[1]) * 2;
      for (let col = 0; col < count; col++) {
        // Random (seeded) end-joint stagger reads as laid flooring; a fixed step reads as a pattern.
        const offset = rand() * px / 2;
        for (let row = -1; row < 3; row++) wood(col * px / count, row * px / 2 + offset, px / count, px / 2);
      }
      if (motif === 'shiplap') {
        // Painted paneling has subtle seams and brush texture, rather than wood-colored grain.
        repeat[0] = finish.plankL ?? def.repeat[1];
        repeat[1] = (finish.plankW ?? def.repeat[0]) * count;
        g.fillStyle = base; g.fillRect(0, 0, px, px);
        h.fillStyle = '#808080'; h.fillRect(0, 0, px, px);
        for (let i = 0; i < count; i++) {
          line(g, tone(base, -35), px * .006, 0, i * px / count, px, i * px / count);
          line(g, tone(base, 8), px * .002, 0, i * px / count + px * .004, px, i * px / count + px * .004);
          line(h, '#3b3b3b', px * .007, 0, i * px / count, px, i * px / count);
        }
      }
      if (motif === 'slats' || motif === 'beadboard' || motif === 'tng') for (let i = 0; i < count; i++) {
        const x = i * px / count;
        line(g, motif === 'slats' ? second : tone(base, -35), px * (motif === 'slats' ? .055 : .006), x, 0, x, px);
        line(h, '#282828', px * (motif === 'slats' ? .055 : .006), x, 0, x, px);
      }
    } else {
      wood(0, 0, px, px, false, false);
      if (['ply', 'birchply'].includes(motif)) {
        // Broad cathedral veneer grain distinguishes sheet plywood from narrow sawn boards.
        g.strokeStyle = tone(base, motif === 'birchply' ? -18 : -34); g.lineWidth = px * .003; g.globalAlpha = .7;
        for (let k = 0; k < 17; k++) {
          const width = px * (.04 + k * .025), len = px * (.15 + k * .06);
          g.beginPath(); g.ellipse(px * .52, px * .82, width, len, 0, Math.PI, Math.PI * 2); g.stroke();
        }
        g.globalAlpha = 1;
        // Joints between sheets (the texture spans one 1.22 x 2.44 m sheet).
        const seam = Math.max(2, px * .004);
        g.fillStyle = tone(base, -55); g.fillRect(0, 0, seam, px); g.fillRect(0, 0, px, seam);
        h.fillStyle = '#3a3a3a'; h.fillRect(0, 0, seam, px); h.fillRect(0, 0, px, seam);
        if (motif === 'ply') for (let i = 0; i < 6; i++) {
          // A homemade floor: water rings and scuffed traffic patches.
          const x = rand() * px, y = rand() * px, r = px * (.05 + rand() * .12);
          const stain = g.createRadialGradient(x, y, r * .2, x, y, r);
          stain.addColorStop(0, 'rgba(70,45,20,0.16)'); stain.addColorStop(.85, 'rgba(70,45,20,0.24)'); stain.addColorStop(1, 'rgba(70,45,20,0)');
          g.fillStyle = stain; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        }
      }
    }
    if (pattern === 'cork') for (let i = 0; i < px * 5; i++) {
      const x = rand() * px, y = rand() * px, r = rand() * px * .008;
      g.fillStyle = tone(base, (rand() - .5) * 90); g.beginPath(); g.ellipse(x, y, r + 1, r * .6 + 1, rand() * 3, 0, Math.PI * 2); g.fill();
    }
  } else if (pattern === 'tile' || pattern === 'sheet') {
    const cols = motif === 'subway' ? 2 : 2, rows = motif === 'subway' ? 4 : 2;
    // Tiles: the material repeat is one tile. Checker and parquet prints: it is the whole 2 x 2 pattern.
    if (motif !== 'checker' && motif !== 'parquet') { repeat[0] *= cols; repeat[1] *= rows; }
    const tw = px / cols, th = px / rows, grout = Math.max(1, px * .004);
    for (let row = -1; row <= rows; row++) for (let col = -1; col <= cols; col++) {
      const x = col * tw + (motif === 'subway' && row % 2 ? tw / 2 : 0), y = row * th;
      g.fillStyle = motif === 'checker' && (row + col) % 2 ? second : tone(base, (rand() - .5) * 10);
      g.fillRect(x, y, tw, th);
      if (motif === 'parquet') {
        // Printed basket-weave parquet: four slats per square, alternating direction square to square.
        const slats = 4, vertical = (row + col) % 2 === 0;
        for (let k = 0; k < slats; k++) {
          g.fillStyle = tone(k % 2 ? second : base, (rand() - .5) * 18);
          if (vertical) g.fillRect(x + k * tw / slats, y, tw / slats, th);
          else g.fillRect(x, y + k * th / slats, tw, th / slats);
          g.globalAlpha = .55;
          const joint = tone(second, -28), wJoint = Math.max(1, px * .002);
          if (vertical) line(g, joint, wJoint, x + k * tw / slats, y, x + k * tw / slats, y + th);
          else line(g, joint, wJoint, x, y + k * th / slats, x + tw, y + k * th / slats);
          g.globalAlpha = 1;
        }
        g.strokeStyle = tone(second, -36); g.lineWidth = Math.max(1, px * .003); g.strokeRect(x, y, tw, th);
      }
      if (pattern === 'tile') {
        g.strokeStyle = second; g.lineWidth = grout; g.strokeRect(x, y, tw, th);
        h.strokeStyle = '#303030'; h.lineWidth = grout * 1.4; h.strokeRect(x, y, tw, th);
      }
    }
    if (motif === 'terrazzo') for (let i = 0; i < px * 2; i++) {
      const x = rand() * px, y = rand() * px, r = px * (.001 + rand() * .007);
      g.fillStyle = [second, '#bbb2a7', '#efeae1', '#757b7b'][i % 4]; g.beginPath(); g.moveTo(x, y); g.lineTo(x + r, y - r * .5); g.lineTo(x + r * .5, y + r); g.closePath(); g.fill();
    }
    if (motif === 'slate') veins(g, px, second, rand, 65, .1);
  } else if (pattern === 'carpet' || pattern === 'fabric') {
    const tight = motif === 'canvas' || motif === 'blackout' || motif === 'screen' || motif === 'sheer';
    const spacing = Math.max(1.5, px / (tight ? 120 : motif === 'jute' ? 55 : 85));
    const pile = pattern === 'carpet' || motif === 'boucle' || motif === 'jute';
    const cutPile = motif === 'plush' || motif === 'shag';
    for (let y = 0; y < px; y += spacing) for (let x = 0; x < px; x += spacing) {
      const variation = (rand() - .5) * (motif === 'tweed' ? 55 : 30);
      g.strokeStyle = tone(motif === 'tweed' && rand() > .6 ? second : base, variation); g.lineWidth = spacing * .55;
      if (cutPile) {
        const length = spacing * (motif === 'shag' ? 2.7 : 1.1);
        const angle = rand() * Math.PI * 2, dx = Math.cos(angle) * length, dy = Math.sin(angle) * length;
        line(g, tone(base, variation), spacing * .25, x, y, x + dx, y + dy);
        line(h, '#a8a8a8', spacing * .2, x, y, x + dx, y + dy);
      } else if (pile) {
        g.beginPath(); g.ellipse(x + rand() * spacing * .4, y, spacing * .32, spacing * .6, .2, 0, Math.PI * 2); g.stroke();
        h.strokeStyle = rand() > .5 ? '#ababab' : '#666666'; h.lineWidth = spacing * .4;
        h.beginPath(); h.ellipse(x, y, spacing * .3, spacing * .5, .2, 0, Math.PI * 2); h.stroke();
      } else {
        const vertical = Math.round(y / spacing + x / spacing) % 2 === 0;
        line(g, tone(base, variation), spacing * .6, x, y, x + (vertical ? 0 : spacing), y + (vertical ? spacing : 0));
        line(h, vertical ? '#9c9c9c' : '#656565', spacing * .5, x, y, x + spacing, y);
      }
    }
    if (motif === 'velvet') {
      // A fine directional nap; physical sheen adds the grazing highlight.
      for (let i = 0; i < px; i++) {
        const value = Math.sin(i / px * Math.PI * 6) * 4 + (rand() - .5) * 9;
        line(g, tone(base, value), .6, i, 0, i, px);
        line(h, tone('#808080', value), .5, i, 0, i, px);
      }
    }
    if (['stripe', 'plaid', 'check', 'kilim'].includes(motif)) {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = second; g.globalAlpha = motif === 'check' || motif === 'plaid' ? .45 : .8;
        g.fillRect(i * px / 8, 0, px / (motif === 'stripe' ? 40 : 16), px);
        if (motif === 'check' || motif === 'plaid') g.fillRect(0, i * px / 8, px, px / 16);
      }
      g.globalAlpha = 1;
      if (motif === 'kilim') for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) {
        g.strokeStyle = second; g.lineWidth = px * .018; g.beginPath(); g.moveTo((i + .5) * px / 3, j * px / 4);
        g.lineTo((i + 1) * px / 3, (j + .5) * px / 4); g.lineTo((i + .5) * px / 3, (j + 1) * px / 4); g.lineTo(i * px / 3, (j + .5) * px / 4); g.closePath(); g.stroke();
      }
    }
    if (motif === 'quilted') for (let i = -4; i <= 4; i++) {
      line(g, second, px * .004, i * px / 4, 0, i * px / 4 + px, px);
      line(h, '#454545', px * .007, i * px / 4, 0, i * px / 4 + px, px);
      line(g, second, px * .004, i * px / 4, px, i * px / 4 + px, 0);
      line(h, '#454545', px * .007, i * px / 4, px, i * px / 4 + px, 0);
    }
    if (motif === 'pleat') for (let i = 0; i < 16; i++) {
      line(g, tone(base, -12), px * .01, 0, i * px / 16, px, i * px / 16);
      line(h, '#666666', px * .01, 0, i * px / 16, px, i * px / 16);
    }
    if (['floralprint', 'print'].includes(motif)) flowers(g, px, second, motif === 'floralprint', false);
  } else if (pattern === 'wallpaper') {
    if (motif === 'stripe') for (let i = 0; i < 8; i++) {
      line(g, second, px * .008, i * px / 8, 0, i * px / 8, px);
      line(g, second, px * .002, i * px / 8 + px * .018, 0, i * px / 8 + px * .018, px);
    }
    else if (motif === 'geometric' || motif === 'art_abstract') {
      g.strokeStyle = second; g.lineWidth = px * .009;
      for (let y = -1; y < 4; y++) for (let x = -1; x < 4; x++) {
        const xx = x * px / 3, yy = y * px / 3;
        g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + px / 6, yy + px / 3); g.lineTo(xx + px / 3, yy); g.lineTo(xx, yy); g.stroke();
      }
    } else if (motif === 'art_desert' || motif === 'art_mountains') {
      g.fillStyle = '#d1a064'; g.beginPath(); g.arc(px * .7, px * .25, px * .12, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 4; i++) { g.fillStyle = ['#d9bba0', '#b9886b', '#846f64', '#4e6262'][i]; g.beginPath(); g.moveTo(0, px);
        for (let x = 0; x <= 12; x++) g.lineTo(x * px / 12, px * (.45 + i * .1) + (rand() - .5) * px * .2);
        g.lineTo(px, px); g.closePath(); g.fill(); }
    } else flowers(g, px, second, motif === 'floral_faded', motif === 'botanical' || motif === 'art_botanical');
  } else if (pattern === 'metal') {
    const count = motif === 'polished' ? px / 3 : px * 2;
    for (let i = 0; i < count; i++) {
      const x = rand() * px;
      line(g, tone(base, (rand() - .5) * (motif === 'powder' ? 7 : 24)), .4, x, 0, x + (rand() - .5) * 2, px);
      line(h, tone('#808080', (rand() - .5) * 28), .5, x, 0, x, px);
    }
  } else if (pattern === 'leather') {
    for (let i = 0; i < px * 16; i++) {
      const x = rand() * px, y = rand() * px, r = .3 + rand() * px * (motif === 'vinyl' ? .0009 : .0017);
      g.fillStyle = tone(base, (rand() - .5) * (motif === 'vinyl' ? 12 : 23)); g.beginPath(); g.ellipse(x, y, r, r * .55, rand() * 3, 0, 7); g.fill();
      h.fillStyle = motif === 'vinyl' ? '#797979' : '#696969'; h.beginPath(); h.ellipse(x, y, r, r * .5, 0, 0, 7); h.fill();
    }
  } else if (pattern === 'rubber') {
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
      const cx = (x + .5) * px / 6, cy = (y + .5) * px / 6;
      g.fillStyle = tone(base, 8); g.beginPath(); g.arc(cx, cy, px * .055, 0, 7); g.fill();
      h.fillStyle = '#b0b0b0'; h.beginPath(); h.arc(cx, cy, px * .055, 0, 7); h.fill();
    }
  } else if (pattern === 'stone' || pattern === 'laminate') {
    if (motif === 'veined' || motif === 'stone') veins(g, px, second, rand, motif === 'veined' ? 14 : 35, .4);
    if (motif === 'speckle' || motif === 'solid') for (let i = 0; i < px * 5; i++) {
      g.fillStyle = i % 2 ? second : tone(base, 15); const s = .5 + rand() * px * .002;
      g.fillRect(rand() * px, rand() * px, s, s);
    }
  } else if (pattern === 'textured') {
    if (motif === 'linen') for (let i = 0; i < 150; i++) {
      line(g, tone(base, i % 2 ? 8 : -8), .5, i * px / 150, 0, i * px / 150, px);
      line(h, i % 2 ? '#8e8e8e' : '#727272', 1, 0, i * px / 150, px, i * px / 150);
    }
    else for (let i = 0; i < px * 8; i++) {
      const x = rand() * px, y = rand() * px, r = .5 + rand() * px * .0018;
      g.fillStyle = tone(base, (rand() - .5) * 15); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      h.fillStyle = motif === 'padded' ? '#707070' : '#a4a4a4'; h.beginPath(); h.arc(x, y, r, 0, 7); h.fill();
    }
  }
  return { albedo, height, repeat };
}

function veins(g: CanvasRenderingContext2D, px: number, color: string, rand: () => number, count: number, alpha: number): void {
  g.strokeStyle = color; g.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    let x = rand() * px; g.lineWidth = .5 + rand() * px * .002; g.beginPath(); g.moveTo(x, 0);
    for (let y = 0; y <= 16; y++) { x += (rand() - .4) * px * .08; g.lineTo(x, y * px / 16); }
    g.stroke();
  }
  g.globalAlpha = 1;
}

function flowers(g: CanvasRenderingContext2D, px: number, color: string, dated: boolean, botanical: boolean): void {
  const step = px / (dated ? 5 : 3);
  for (let y = -1; y < 4 + (dated ? 2 : 0); y++) for (let x = -1; x < 4 + (dated ? 2 : 0); x++) {
    const cx = (x + (y % 2 ? .5 : 0)) * step, cy = y * step;
    g.save(); g.translate(cx, cy); g.rotate((x + y) * .65);
    g.strokeStyle = color; g.fillStyle = color; g.lineWidth = px * .002; g.globalAlpha = dated ? .55 : .9;
    g.beginPath(); g.moveTo(0, step * .4); g.bezierCurveTo(-step * .12, step * .1, step * .1, -step * .2, 0, -step * .38); g.stroke();
    for (let k = 0; k < (botanical ? 7 : 4); k++) {
      const yy = -step * .3 + k * step * .09, side = k % 2 ? -1 : 1;
      g.beginPath(); g.ellipse(side * step * .085, yy, step * .11, step * .035, side * -.5, 0, 7); g.fill();
    }
    if (!botanical) for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3; g.beginPath(); g.ellipse(Math.cos(a) * step * .07, -step * .33 + Math.sin(a) * step * .07, step * .05, step * .025, a, 0, 7); g.fill();
    }
    g.restore();
  }
}

function generateMaps(def: MaterialDef, finish: Finish, px: number): { albedo: HTMLCanvasElement; normal: HTMLCanvasElement; roughness: HTMLCanvasElement; repeat: [number, number] } {
  const { albedo, height, repeat } = drawPattern(def, finish, px);
  const source = height.getContext('2d')!.getImageData(0, 0, px, px).data;
  const [normal, ng] = canvas(px), [roughness, rg] = canvas(px);
  const nd = ng.createImageData(px, px), rd = rg.createImageData(px, px);
  const baseRough = finish.roughness ?? def.roughness;
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    const i = (y * px + x) * 4;
    const dx = (source[(y * px + (x + 1) % px) * 4] - source[(y * px + (x + px - 1) % px) * 4]) / 75;
    const dy = (source[(((y + 1) % px) * px + x) * 4] - source[(((y + px - 1) % px) * px + x) * 4]) / 75;
    const length = Math.sqrt(dx * dx + dy * dy + 1);
    nd.data[i] = 128 - dx / length * 127; nd.data[i + 1] = 128 + dy / length * 127;
    nd.data[i + 2] = 128 + 127 / length; nd.data[i + 3] = 255;
    const r = Math.min(255, Math.max(8, baseRough * 255 + (source[i] - 128) * .15));
    rd.data[i] = rd.data[i + 1] = rd.data[i + 2] = r; rd.data[i + 3] = 255;
  }
  ng.putImageData(nd, 0, 0); rg.putImageData(rd, 0, 0);
  return { albedo, normal, roughness, repeat };
}
