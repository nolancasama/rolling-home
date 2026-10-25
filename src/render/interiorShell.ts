import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Finish, SurfaceDef, VehicleDef } from '../data/types';
import { GeoBuilder } from './builder';
import { finishMaterial, releaseFinishMaterial } from './materials';

export type CutawayLevel = false | 'up' | 'cut' | 'down';
type Rect2 = { a0: number; a1: number; y0: number; y1: number };

/** Split at opening edges, rather than using holes that can cross a surface boundary. */
function panel(a0: number, a1: number, y0: number, y1: number, openings: Rect2[]): THREE.BufferGeometry {
  const holes = openings.filter(h => h.a1 > a0 && h.a0 < a1 && h.y1 > y0 && h.y0 < y1);
  const aa = [...new Set([a0, a1, ...holes.flatMap(h => [Math.max(a0, h.a0), Math.min(a1, h.a1)])])].sort((a, b) => a - b);
  const yy = [...new Set([y0, y1, ...holes.flatMap(h => [Math.max(y0, h.y0), Math.min(y1, h.y1)])])].sort((a, b) => a - b);
  const pieces: THREE.BufferGeometry[] = [];
  for (let a = 0; a < aa.length - 1; a++) for (let y = 0; y < yy.length - 1; y++) {
    const ac = (aa[a] + aa[a + 1]) / 2, yc = (yy[y] + yy[y + 1]) / 2;
    if (holes.some(h => ac > h.a0 && ac < h.a1 && yc > h.y0 && yc < h.y1)) continue;
    const g = new THREE.PlaneGeometry(aa[a + 1] - aa[a], yy[y + 1] - yy[y]);
    g.translate(ac, yc, 0);
    pieces.push(g);
  }
  if (!pieces.length) return new THREE.BufferGeometry();
  const result = mergeGeometries(pieces)!;
  pieces.forEach(g => g.dispose());
  return result;
}

/** All shell UVs are vehicle-local metres; finish transforms supply the physical repeat. */
function metreUV(g: THREE.BufferGeometry, plane: 'floor' | 'side' | 'end' | 'box'): THREE.BufferGeometry {
  const p = g.getAttribute('position'), n = g.getAttribute('normal');
  const uv: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const mode = plane === 'box' ? Math.abs(n.getY(i)) > .5 ? 'floor' : Math.abs(n.getX(i)) > .5 ? 'side' : 'end' : plane;
    uv.push(mode === 'side' ? p.getZ(i) : p.getX(i), mode === 'floor' ? p.getZ(i) : p.getY(i));
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** Finish-only rebuilds never touch the protected cab or furniture. */
export class InteriorShell {
  readonly group = new THREE.Group();
  readonly clippingPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e5);
  readonly ceilings: THREE.Object3D[] = [];
  private localPlane = this.clippingPlane.clone();
  private matrixWorld = new THREE.Matrix4();
  private materials: THREE.MeshStandardMaterial[] = [];
  private sig = '';
  private level: CutawayLevel = false;

  constructor(readonly def: VehicleDef) {
    this.group.name = 'interior-shell';
    this.sync();
  }

  sync(surfaces?: Record<string, Finish>): boolean {
    const sig = JSON.stringify(this.def.interior.surfaces.map(s => [s.id, surfaces?.[s.id] ?? s.factory]));
    if (sig === this.sig) return false;
    // Acquire before releasing: unchanged finishes keep their cached texture resources alive.
    const nextMaterials = this.def.interior.surfaces.map(surface => finishMaterial(
      surfaces?.[surface.id] ?? surface.factory, surface.kind,
      { side: THREE.DoubleSide, ...((surface.kind === 'wall' || surface.kind === 'trim') ? { clippingPlanes: [this.clippingPlane] } : {}) },
    ));
    this.clear();
    this.sig = sig;
    for (const [index, surface] of this.def.interior.surfaces.entries()) {
      const geometry = this.geometry(surface);
      const material = nextMaterials[index];
      this.materials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = surface.id;
      mesh.userData.surface = surface.id;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      if (surface.kind === 'ceiling') this.ceilings.push(mesh);
    }
    this.transitions(surfaces);
    this.windowPicking();
    this.setCutaway(this.level);
    return true;
  }

  setCutaway(level: CutawayLevel): void {
    this.level = level;
    for (const ceiling of this.ceilings) ceiling.visible = level === false;
    this.localPlane.constant = level === 'cut' ? this.def.interior.floorY + 1 : level === 'down' ? this.def.interior.floorY + .12 : 1e5;
    this.updateClipping(this.matrixWorld);
  }

  updateClipping(matrixWorld: THREE.Matrix4): void {
    this.matrixWorld.copy(matrixWorld);
    this.clippingPlane.copy(this.localPlane).applyMatrix4(matrixWorld);
  }

  private geometry(surface: SurfaceDef): THREE.BufferGeometry {
    const i = this.def.interior;
    if (surface.kind === 'trim') return this.trim();
    if (surface.rect) {
      const r = surface.rect;
      const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0);
      g.rotateX(surface.kind === 'floor' ? -Math.PI / 2 : Math.PI / 2);
      g.translate((r.x0 + r.x1) / 2, surface.kind === 'floor' ? i.floorY : i.ceilingY, (r.z0 + r.z1) / 2);
      return metreUV(g, 'floor');
    }
    const wall = surface.wall!;
    if (wall.side === 'front') {
      if (!i.cabover) {
        const g = panel(wall.a0, wall.a1, i.cabCeilingY, i.ceilingY, []);
        g.rotateY(Math.PI);
        g.translate(0, 0, i.living.z1);
        return metreUV(g, 'end');
      }
      const pieces: THREE.BufferGeometry[] = [];
      for (const side of [1, -1]) {
        const g = panel(i.living.z1, 2.55, 2.28, i.ceilingY, [{a0:1.95,a1:2.45,y0:2.48,y1:Math.min(2.86, i.ceilingY-.02)}]);
        g.rotateY(-Math.PI / 2);
        g.translate(side * i.halfWidth, 0, 0);
        pieces.push(metreUV(g, 'side'));
      }
      const front = panel(wall.a0, wall.a1, 2.28, i.ceilingY, []);
      front.translate(0, 0, 2.55);
      pieces.push(metreUV(front, 'end'));
      const fascia = new THREE.BoxGeometry(i.halfWidth*2-.02,2.28-i.cabCeilingY,.02);
      fascia.translate(0,(i.cabCeilingY+2.28)/2,i.living.z1+.012);
      pieces.push(metreUV(fascia,'box'));
      const result = mergeGeometries(pieces)!;
      pieces.forEach(g => g.dispose());
      return result;
    }
    const openings: Rect2[] = i.windows.filter(w => w.side === wall.side).map(w => ({a0:w.a0,a1:w.a1,y0:w.y0,y1:w.y1}));
    if (wall.side === 'right') openings.push({a0:i.door.z0,a1:i.door.z1,y0:i.floorY,y1:Math.min(i.ceilingY - .15, this.def.id === 'van' ? 2.05 : 2.45)});
    const g = panel(wall.a0, wall.a1, i.floorY, i.ceilingY, openings);
    if (wall.side === 'rear') g.translate(0, 0, i.living.z0);
    else {
      g.rotateY(-Math.PI / 2);
      g.translate((wall.side === 'left' ? 1 : -1) * i.halfWidth, 0, 0);
    }
    return metreUV(g, wall.side === 'rear' ? 'end' : 'side');
  }

  private trim(): THREE.BufferGeometry {
    const i = this.def.interior, b = new GeoBuilder(true), hw = i.halfWidth;
    const box = (x: number, y: number, z: number, w: number, h: number, d: number) => b.box(x,y,z,w,h,d,'#ffffff');
    for (const side of [1, -1]) {
      // Baseboards stop at the entry opening; crown is uninterrupted above it.
      const spans = side === -1 ? [[i.living.z0,i.door.z0],[i.door.z1,i.living.z1]] : [[i.living.z0,i.living.z1]];
      for (const [a,z] of spans) if (z > a) box(side*(hw-.012),i.floorY+.04,(a+z)/2,.026,.08,z-a);
      box(side*(hw-.015),i.ceilingY-.025,(i.living.z0+i.living.z1)/2,.036,.05,i.living.z1-i.living.z0);
    }
    box(0,i.floorY+.04,i.living.z0+.012,hw*2,.08,.026);
    box(0,i.ceilingY-.025,i.living.z0+.015,hw*2,.05,.036);
    for (const w of i.windows) {
      const a = (w.a0+w.a1)/2, y = (w.y0+w.y1)/2, width = w.a1-w.a0, height = w.y1-w.y0;
      if (w.side === 'rear') {
        for (const yy of [w.y0-.013,w.y1+.013]) box(a,yy,i.living.z0+.012,width+.092,.046,.07);
        for (const xx of [w.a0-.013,w.a1+.013]) box(xx,y,i.living.z0+.012,.046,height,.07);
      } else {
        const x = (w.side === 'left' ? 1 : -1)*(hw-.012);
        for (const yy of [w.y0-.013,w.y1+.013]) box(x,yy,a,.07,.046,width+.092);
        for (const zz of [w.a0-.013,w.a1+.013]) box(x,y,zz,.07,height,.046);
      }
    }
    const doorTop = this.def.id === 'van' ? 2.05 : 2.45;
    for (const z of [i.door.z0-.025,i.door.z1+.025]) box(-hw+.016,(i.floorY+doorTop)/2,z,.06,doorTop-i.floorY,.05);
    box(-hw+.016,doorTop+.025,(i.door.z0+i.door.z1)/2,.06,.05,i.door.z1-i.door.z0+.1);
    return metreUV(b.build(), 'box');
  }

  private transitions(surfaces?: Record<string, Finish>): void {
    const floors = this.def.interior.surfaces.filter(s => s.kind === 'floor' && s.rect);
    const b = new GeoBuilder(true);
    for (let a = 0; a < floors.length; a++) for (let z = a + 1; z < floors.length; z++) {
      const first = floors[a], second = floors[z], r = first.rect!, q = second.rect!;
      if (JSON.stringify(surfaces?.[first.id] ?? first.factory) === JSON.stringify(surfaces?.[second.id] ?? second.factory)) continue;
      if (Math.abs(r.z1-q.z0) < .001 || Math.abs(q.z1-r.z0) < .001) {
        const x0 = Math.max(r.x0,q.x0), x1 = Math.min(r.x1,q.x1);
        if (x1 > x0) b.box((x0+x1)/2,this.def.interior.floorY+.0025,Math.abs(r.z1-q.z0)<.001?r.z1:q.z1,x1-x0,.003,.026,'#ffffff');
      }
    }
    if (b.isEmpty()) return;
    const trim = this.def.interior.surfaces.find(s => s.kind === 'trim')!;
    const material = finishMaterial(surfaces?.[trim.id] ?? trim.factory,'trim',{polygonOffset:true});
    this.materials.push(material);
    const mesh = new THREE.Mesh(metreUV(b.build(),'box'),material);
    mesh.name = 'floor-transitions';
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private windowPicking(): void {
    const i = this.def.interior;
    for (const w of i.windows) {
      const geometry = new THREE.PlaneGeometry(w.a1-w.a0,w.y1-w.y0);
      const material = new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,clippingPlanes:[this.clippingPlane]});
      const mesh = new THREE.Mesh(geometry,material);
      if (w.side === 'rear') mesh.position.set((w.a0+w.a1)/2,(w.y0+w.y1)/2,i.living.z0-.006);
      else {
        mesh.rotation.y = -Math.PI/2;
        mesh.position.set((w.side==='left'?1:-1)*(i.halfWidth+.006),(w.y0+w.y1)/2,(w.a0+w.a1)/2);
      }
      mesh.name = `window-${w.id}`;
      mesh.userData.window = w.id;
      this.group.add(mesh);
    }
  }

  private clear(): void {
    this.group.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.dispose();
      if (o.material instanceof THREE.MeshBasicMaterial) o.material.dispose();
    });
    this.group.clear();
    this.ceilings.length = 0;
    this.materials.forEach(releaseFinishMaterial);
    this.materials.length = 0;
  }

  dispose(): void { this.clear(); this.sig = ''; }
}
