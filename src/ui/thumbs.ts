import * as THREE from 'three';
import { itemDef } from '../data/items';
import type { ItemDef } from '../data/types';
import { buildItemModel } from '../render/furniture';

// Renders item models to small images (cached) for shop/inventory lists.

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
const cache = new Map<string, string>();
let failed = false;

function setup() {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 160;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(160, 160, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x8a7060, 1.6));
  const d = new THREE.DirectionalLight(0xffffff, 1.6);
  d.position.set(2, 4, 3);
  scene.add(d);
  camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
}

export function thumb(defOrId: ItemDef | string): string | null {
  if (failed) return null;
  const def = typeof defOrId === 'string' ? itemDef(defOrId) : defOrId;
  const key = def.id + (def.model ?? '');
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    if (!renderer) setup();
    const obj = buildItemModel(def, { mattress: def.features?.bed?.usesMattress ? itemDef(def.features.bed.mattressSize === 'double' ? 'foam_double' : 'foam_van') : null });
    if (def.model === 'solar' || def.model === 'rug') obj.rotation.x = 0.0;
    scene!.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z) * 0.62 + 0.02;
    const dist = r / Math.tan((camera!.fov * Math.PI) / 360);
    camera!.position.set(center.x + dist * 0.62, center.y + dist * 0.5, center.z + dist * 0.62);
    camera!.lookAt(center);
    renderer!.setClearColor(0x000000, 0);
    renderer!.render(scene!, camera!);
    const url = renderer!.domElement.toDataURL('image/png');
    scene!.remove(obj);
    cache.set(key, url);
    return url;
  } catch {
    failed = true;
    return null;
  }
}
