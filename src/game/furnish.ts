import * as THREE from 'three';
import { checkPlacement, footprint, itemElevation, type PlacementIssue } from '../sim/furnish';
import { clamp } from '../sim/geo';
import { activeVehicle, defOf, itemsInVehicle, mattressOn } from '../sim/vehicle';
import type { ItemInstance } from '../sim/types';
import { buildItemModel } from '../render/furniture';
import type { Game, Mode, ModeId } from './game';

// Overhead cutaway editor for the RV floor plan.

export interface Moving {
  uid: string;
  rot: number;
  x: number;
  z: number;
  issues: PlacementIssue[];
  fromStorage: boolean;
}

export class FurnishMode implements Mode {
  selected: string | null = null;
  moving: Moving | null = null;
  private yaw = 0;
  private pitch = 1.05;
  private dist = 9;
  private overlay: THREE.Group | null = null;
  private ghost: THREE.Object3D | null = null;
  private ghostMat = new THREE.MeshStandardMaterial({ color: 0x5fd07a, transparent: true, opacity: 0.55, depthWrite: false });
  private badMat = new THREE.MeshStandardMaterial({ color: 0xe05a4a, transparent: true, opacity: 0.55, depthWrite: false });
  private selBox: THREE.Box3Helper | null = null;
  private snapshot: Map<string, string> | null = null;
  private ray = new THREE.Raycaster();
  tab: 'floor' | 'systems' = 'floor';

  constructor(private g: Game) {}

  enter(_from: ModeId) {
    const g = this.g;
    const v = activeVehicle(g.sim!.s);
    this.snapshot = new Map(itemsInVehicle(g.sim!.s, v.id).map((i) => [i.uid, JSON.stringify(i.where)]));
    for (const it of Object.values(g.sim!.s.items)) if (it.where.kind === 'stored' && it.where.vehicle === v.id) this.snapshot.set(it.uid, JSON.stringify(it.where));
    this.selected = null;
    this.moving = null;
    this.yaw = g.phys!.heading + Math.PI * 0.82;
    this.dist = g.phys!.def.dims.length * 1.25 + 1.5;
    g.vv!.setCutaway(true);
    g.input.releaseLock();
    this.buildOverlay();
    g.screens.furnishPanel();
    g.ui.setPrompt(null);
  }

  exit(_to: ModeId) {
    const g = this.g;
    g.vv!.setCutaway(false);
    if (this.overlay) g.vv!.body.remove(this.overlay);
    this.overlay = null;
    this.clearGhost();
    if (this.selBox) g.scene.remove(this.selBox);
    this.selBox = null;
    g.ui.closeId('furnish');
    g.vv!.sync(g.sim!.s, true);
  }

  timeScale() {
    return 0;
  }

  /** Revert every change made during this session. */
  cancel() {
    const g = this.g;
    if (this.snapshot) {
      for (const [uid, w] of this.snapshot) {
        const it = g.sim!.s.items[uid];
        if (it) it.where = JSON.parse(w);
      }
    }
    g.sim!.changed();
    g.setMode('interior');
  }

  done() {
    if (this.moving) this.cancelMove();
    this.g.setMode('interior');
  }

  private buildOverlay() {
    const g = this.g;
    const def = g.phys!.def;
    const inr = def.interior;
    const grp = new THREE.Group();
    const y = inr.floorY + 0.012;
    const rect = (r: { x0: number; x1: number; z0: number; z1: number }, color: number, opacity: number, yy = y) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set((r.x0 + r.x1) / 2, yy, (r.z0 + r.z1) / 2);
      m.renderOrder = 3;
      grp.add(m);
      const edge = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(r.x0, yy + 0.003, r.z0), new THREE.Vector3(r.x1, yy + 0.003, r.z0),
          new THREE.Vector3(r.x1, yy + 0.003, r.z1), new THREE.Vector3(r.x0, yy + 0.003, r.z1),
        ]),
        new THREE.LineBasicMaterial({ color }),
      );
      edge.renderOrder = 4;
      grp.add(edge);
    };
    for (const p of inr.plumbing) rect(p, 0x3a8ad0, 0.32, y + 0.002);
    rect(inr.door.zone, 0xe8902c, 0.45, y + 0.004);
    rect(inr.cab, 0x555555, 0.22, y + 0.001);
    // grid lines every 0.25 m
    const pts: number[] = [];
    const l = inr.living;
    for (let x = l.x0; x <= l.x1 + 1e-6; x += 0.25) pts.push(x, y + 0.006, l.z0, x, y + 0.006, l.z1);
    for (let z = l.z0; z <= l.z1 + 1e-6; z += 0.25) pts.push(l.x0, y + 0.006, z, l.x1, y + 0.006, z);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    grp.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x6a5a4a, transparent: true, opacity: 0.35 })));
    g.vv!.body.add(grp);
    this.overlay = grp;
  }

  private clearGhost() {
    if (this.ghost) this.g.vv!.body.remove(this.ghost);
    this.ghost = null;
    for (const [uid, m] of this.g.vv!.itemMeshes) m.visible = uid !== this.moving?.uid || !this.moving;
  }

  select(uid: string | null) {
    this.selected = uid;
    this.g.ui.invalidate();
  }

  /** Start moving an installed item or placing one from storage. */
  startMove(uid: string) {
    const g = this.g;
    const it = g.sim!.s.items[uid];
    if (!it) return;
    const d = defOf(it);
    if (!d.floor) return;
    const inr = g.phys!.def.interior;
    const w = it.where;
    const fromStorage = w.kind !== 'floor';
    const x = w.kind === 'floor' ? w.x : 0;
    const z = w.kind === 'floor' ? w.z : (inr.living.z0 + inr.living.z1) / 2;
    const rot = w.kind === 'floor' ? w.rot : 0;
    this.moving = { uid, rot, x, z, issues: [], fromStorage };
    this.clearGhost();
    const mat = d.features?.bed?.usesMattress ? mattressOn(g.sim!.s, uid) : null;
    const model = buildItemModel(d, { mattress: mat ? defOf(mat) : null });
    model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = this.ghostMat;
    });
    this.ghost = model;
    g.vv!.body.add(model);
    const own = g.vv!.itemMeshes.get(uid);
    if (own) own.visible = false;
    this.validate();
    g.ui.invalidate();
  }

  rotate() {
    if (!this.moving) {
      if (this.selected) {
        this.startMove(this.selected);
        if (this.moving) this.rotate();
      }
      return;
    }
    this.moving.rot = (this.moving.rot + 1) % 4;
    this.validate();
  }

  cancelMove() {
    const own = this.moving ? this.g.vv!.itemMeshes.get(this.moving.uid) : null;
    this.moving = null;
    this.clearGhost();
    if (own) own.visible = true;
    this.g.ui.invalidate();
  }

  private validate() {
    const g = this.g;
    const m = this.moving!;
    const it = g.sim!.s.items[m.uid];
    const candidate = { uid: m.uid, def: it.def, x: m.x, z: m.z, rot: m.rot, y: it.where.kind === 'floor' ? it.where.y : undefined, config: it.config, state: it.state };
    m.issues = checkPlacement(g.sim!.s, activeVehicle(g.sim!.s).id, candidate);
    if (this.ghost) {
      this.ghost.position.set(m.x, g.phys!.def.interior.floorY + itemElevation(g.phys!.def, candidate) + 0.01, m.z);
      this.ghost.rotation.y = (m.rot * Math.PI) / 2;
      const mat = m.issues.some((issue) => issue.severity === 'block') ? this.badMat : this.ghostMat;
      this.ghost.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = mat;
      });
    }
    g.ui.invalidate();
  }

  place(): boolean {
    const g = this.g;
    const m = this.moving;
    if (!m) return false;
    this.validate();
    if (m.issues.some((issue) => issue.severity === 'block')) {
      g.audio.error();
      return false;
    }
    const r = g.sim!.place(m.uid, m.x, m.z, m.rot);
    if (!r.ok) {
      g.ui.toast({ text: r.reason, kind: 'bad' });
      return false;
    }
    this.selected = m.uid;
    this.moving = null;
    this.clearGhost();
    g.vv!.sync(g.sim!.s, true);
    g.audio.click();
    return true;
  }

  /** Move the candidate to a vehicle-local spot (automation helper). */
  moveTo(x: number, z: number, rot?: number) {
    if (!this.moving) return;
    this.moving.x = x;
    this.moving.z = z;
    if (rot != null) this.moving.rot = rot;
    this.validate();
  }

  store(uid: string) {
    const r = this.g.sim!.uninstall(uid);
    if (!r.ok) this.g.ui.toast({ text: r.reason, kind: 'bad' });
    else {
      this.selected = null;
      this.g.vv!.sync(this.g.sim!.s, true);
    }
  }

  update(dt: number) {
    const g = this.g;
    const inp = g.input;
    const p = g.phys!;
    // camera orbit
    if (inp.mouseButtons.has(2)) {
      inp.dragLook = true;
      this.yaw -= inp.mouseDX * 0.005;
      this.pitch = clamp(this.pitch + inp.mouseDY * 0.004, 0.45, 1.5);
    }
    if (inp.isDown('Q')) this.yaw += dt * 1.4;
    if (inp.isDown('E')) this.yaw -= dt * 1.4;
    if (inp.wheel) this.dist = clamp(this.dist + inp.wheel * 0.6, 4, 18);
    const def = p.def;
    const center = new THREE.Vector3(0, def.interior.floorY, (def.interior.living.z0 + def.interior.cab.z1) / 2);
    g.vv!.body.updateMatrixWorld(true);
    const cw = center.clone().applyMatrix4(g.vv!.body.matrixWorld);
    const cp = Math.cos(this.pitch);
    g.camera.position.set(cw.x - Math.sin(this.yaw) * cp * this.dist, cw.y + Math.sin(this.pitch) * this.dist, cw.z - Math.cos(this.yaw) * cp * this.dist);
    g.camera.lookAt(cw);
    g.focus.copy(cw);
    // pointer
    const ndc = new THREE.Vector2((inp.mouseX / window.innerWidth) * 2 - 1, -(inp.mouseY / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(ndc, g.camera);
    if (this.moving) {
      const inv = new THREE.Matrix4().copy(g.vv!.body.matrixWorld).invert();
      const o = this.ray.ray.origin.clone().applyMatrix4(inv);
      const dvec = this.ray.ray.direction.clone().transformDirection(inv);
      const t = (def.interior.floorY - o.y) / (dvec.y || -1e-6);
      if (t > 0 && !inp.mouseButtons.has(2)) {
        const hit = o.addScaledVector(dvec, t);
        const nx = Math.round(hit.x / 0.05) * 0.05, nz = Math.round(hit.z / 0.05) * 0.05;
        if (nx !== this.moving.x || nz !== this.moving.z) {
          this.moving.x = nx;
          this.moving.z = nz;
          this.validate();
        }
      }
      if (inp.wasPressed('R')) this.rotate();
      if (inp.clicked.has(0)) this.place();
      if (inp.wasPressed('Escape') || inp.clicked.has(2)) this.cancelMove();
    } else {
      if (inp.clicked.has(0)) {
        const meshes = [...g.vv!.itemMeshes.values()];
        const hits = this.ray.intersectObjects(meshes, true);
        let uid: string | null = null;
        for (const h of hits) {
          let o: THREE.Object3D | null = h.object;
          while (o && !o.userData.uid) o = o.parent;
          if (o) {
            uid = o.userData.uid;
            break;
          }
        }
        this.select(uid);
      }
      if (this.selected && inp.wasPressed('R')) this.rotate();
      if (this.selected && (inp.wasPressed('Delete') || inp.wasPressed('Backspace'))) this.store(this.selected);
    }
    // selection outline
    if (this.selBox) {
      g.scene.remove(this.selBox);
      this.selBox = null;
    }
    if (this.selected && !this.moving) {
      const m = g.vv!.itemMeshes.get(this.selected);
      if (m) {
        const box = new THREE.Box3().setFromObject(m);
        this.selBox = new THREE.Box3Helper(box, 0x2fd0c0);
        g.scene.add(this.selBox);
      }
    }
  }

  footprintOf(it: ItemInstance) {
    const d = defOf(it);
    return it.where.kind === 'floor' && d.floor ? footprint(d, it.where.x, it.where.z, it.where.rot) : null;
  }
}
