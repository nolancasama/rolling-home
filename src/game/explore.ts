import * as THREE from 'three';
import { clamp, wrapAngle } from '../sim/geo';
import type { Activity } from '../sim/types';
import { groundAt, terrainHeight } from '../world/terrain';
import { buildItemModel } from '../render/furniture';
import { itemDef } from '../data/items';
import type { Game, Mode, ModeId } from './game';
import { worldTargets, type Target } from './interactions';

const WALK = 1.7;
const RUN = 4.8;
const RADIUS = 0.32;

export class ExploreMode implements Mode {
  x = 0;
  z = 0;
  y = 0;
  yaw = 0;
  camYaw = 0;
  camPitch = 0.32;
  camDist = 5.2;
  private speed = 0;
  private running = false;
  private targets: Target[] = [];
  current: Target | null = null;
  private scanT = 0;
  private holdT = 0;
  private discT = 0;
  private camPos = new THREE.Vector3();
  private carryKey = '';
  sitting = false;

  constructor(private g: Game) {}

  enter(from: ModeId) {
    const g = this.g;
    const s = g.sim!.s;
    if (from === 'interior' || from === 'drive' || from === 'design') {
      const p = from === 'drive' ? g.driverDoorOutside() : g.vehicleDoorOutside();
      this.placeFree(p.x, p.z);
      this.yaw = g.phys!.heading + (from === 'drive' ? Math.PI / 2 : -Math.PI / 2);
      this.camYaw = this.yaw + Math.PI * 0.85;
      if (from !== 'drive') g.vv!.doorTarget = 0;
    } else {
      this.placeFree(s.player.pos.x, s.player.pos.z);
      this.yaw = s.player.pos.yaw;
      this.camYaw = this.yaw;
    }
    this.y = groundAt(this.x, this.z).y;
    this.sitting = false;
    g.char.root.visible = true;
    g.char.root.position.set(this.x, this.y, this.z);
    this.camPos.set(this.x - Math.sin(this.camYaw) * 5, this.y + 3, this.z - Math.cos(this.camYaw) * 5);
    g.camera.near = 0.08;
    g.camera.updateProjectionMatrix();
  }

  exit(_to: ModeId) {
    this.writeState();
    this.g.ui.setPrompt(null);
    this.g.ui.setHold(null);
    this.g.char.root.visible = false;
    this.sitting = false;
  }

  writeState() {
    const p = this.g.sim!.s.player;
    p.pos = { x: this.x, z: this.z, yaw: this.yaw };
  }

  /** Find a nearby spot not inside a collider. */
  placeFree(x: number, z: number) {
    const col = this.g.world.collision;
    for (let r = 0; r < 8; r += 0.5) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        const y = terrainHeight(px, pz);
        if (!col.pointBlocked(px, pz, y + 0.9, RADIUS + 0.05) && groundAt(px, pz).surface !== 'water') {
          this.x = px;
          this.z = pz;
          return;
        }
        if (r === 0) break;
      }
    }
    this.x = x;
    this.z = z;
  }

  teleport(x: number, z: number, yaw?: number) {
    this.placeFree(x, z);
    this.y = groundAt(this.x, this.z).y;
    if (yaw != null) this.yaw = yaw;
  }

  activity(): Activity {
    if (this.sitting) return 'relax';
    if (this.speed > 0.3) return this.running ? 'run' : 'walk';
    return 'idle';
  }

  timeScale() {
    return 6;
  }

  update(dt: number) {
    const g = this.g;
    const inp = g.input;
    const sens = 0.0024 * g.settings.sensitivity;
    if (!g.ui.blocking && !inp.pointerLocked && inp.clicked.has(0)) inp.requestLock();
    this.camYaw -= inp.mouseDX * sens;
    this.camPitch = clamp(this.camPitch + inp.mouseDY * sens * (g.settings.invertY ? -1 : 1), -0.35, 1.25);
    if (inp.wheel) this.camDist = clamp(this.camDist + inp.wheel * 0.6, 2.2, 11);
    // movement
    const fwd = inp.axis(['S', 'ArrowDown'], ['W', 'ArrowUp']);
    const side = inp.axis(['A', 'ArrowLeft'], ['D', 'ArrowRight']);
    let mx = 0, mz = 0;
    if (fwd || side) {
      const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
      const rx = -Math.cos(this.camYaw), rz = Math.sin(this.camYaw);
      mx = fx * fwd + rx * side;
      mz = fz * fwd + rz * side;
      const l = Math.hypot(mx, mz);
      mx /= l;
      mz /= l;
      if (this.sitting) this.sitting = false;
    }
    const s = g.sim!.s;
    const carrying = !!s.player.carrying;
    this.running = inp.isDown('Shift') && s.player.needs.energy > 8 && !carrying;
    const target = fwd || side ? (this.running ? RUN : WALK) * (carrying ? 0.8 : 1) : 0;
    this.speed += (target - this.speed) * Math.min(1, dt * 10);
    if (this.speed > 0.01 && (mx || mz)) {
      const nx = this.x + mx * this.speed * dt, nz = this.z + mz * this.speed * dt;
      const ny = groundAt(nx, nz);
      const step = ny.y - this.y;
      if (ny.surface !== 'water' && step < 0.6) {
        const r = g.world.collision.resolveCircle(nx, nz, RADIUS, this.y + 0.25, this.y + 1.7);
        this.x = r.x;
        this.z = r.z;
      }
      const want = Math.atan2(mx, mz);
      this.yaw += wrapAngle(want - this.yaw) * Math.min(1, dt * 12);
    }
    const gy = groundAt(this.x, this.z).y;
    this.y += (gy - this.y) * Math.min(1, dt * 14);
    if (Math.abs(gy - this.y) > 1.5) this.y = gy;
    const ch = g.char;
    ch.root.position.set(this.x, this.y, this.z);
    ch.root.rotation.y = this.yaw;
    ch.animate(dt, this.speed, this.sitting ? 'sit' : this.speed > 0.3 ? (this.running ? 'run' : 'walk') : carrying ? 'carry' : 'idle');
    this.updateCarry();
    this.updateCamera(dt);
    g.focus.set(this.x, this.y, this.z);
    // interactions
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.12;
      this.targets = worldTargets(g, this.x, this.z);
    }
    this.pickTarget();
    this.handleInteract(dt);
    this.discT -= dt;
    if (this.discT <= 0) {
      this.discT = 0.6;
      g.sim!.discover(this.x, this.z);
    }
  }

  private updateCarry() {
    const c = this.g.sim!.s.player.carrying;
    const key = c ? (c.kind === 'job' ? `job:${c.jobId}` : `item:${c.uid}`) : '';
    if (key === this.carryKey) return;
    this.carryKey = key;
    if (!c) {
      this.g.char.setCarry(null);
      return;
    }
    let model: THREE.Object3D;
    if (c.kind === 'item') model = buildItemModel(itemDef(this.g.sim!.s.items[c.uid]?.def ?? 'camp_chair'));
    else {
      const job = this.g.sim!.s.jobs.active.find((j) => j.offer.id === c.jobId);
      const odd = job && job.offer.kind === 'odd' ? job.offer.odd : '';
      model = buildItemModel(itemDef(odd === 'pl_firewood' ? 'firewood' : 'canned_chili'), {});
      if (odd !== 'pl_firewood') {
        model = buildItemModel({ ...itemDef('canned_chili'), model: 'crate' }, { dims: [0.45, 0.4, 0.35] });
      }
    }
    model.position.set(0, -0.12, 0);
    model.scale.setScalar(0.9);
    this.g.char.setCarry(model);
  }

  private updateCamera(dt: number) {
    const g = this.g;
    const target = new THREE.Vector3(this.x, this.y + (this.sitting ? 1.2 : 1.55), this.z);
    const cp = Math.cos(this.camPitch);
    const dir = new THREE.Vector3(-Math.sin(this.camYaw) * cp, Math.sin(this.camPitch), -Math.cos(this.camYaw) * cp);
    // pull the camera in when blocked
    let dist = this.camDist;
    for (let d = 0.6; d <= this.camDist; d += 0.25) {
      const p = target.clone().addScaledVector(dir, d);
      const ground = terrainHeight(p.x, p.z);
      if (p.y < ground + 0.35 || g.world.collision.pointBlocked(p.x, p.z, p.y, 0.25)) {
        dist = Math.max(0.6, d - 0.3);
        break;
      }
    }
    const want = target.clone().addScaledVector(dir, dist);
    const gy = terrainHeight(want.x, want.z) + 0.4;
    if (want.y < gy) want.y = gy;
    this.camPos.lerp(want, Math.min(1, dt * 14));
    if (this.camPos.distanceTo(want) > 6) this.camPos.copy(want);
    g.camera.position.copy(this.camPos);
    g.camera.lookAt(target);
  }

  private pickTarget() {
    const g = this.g;
    let best: Target | null = null;
    let bestScore = Infinity;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    for (const t of this.targets) {
      const dx = t.x - this.x, dz = t.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d > t.radius) continue;
      const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      const score = d - facing * 0.6 - (t.priority ?? 0);
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    this.current = best;
    if (g.ui.blocking) {
      g.ui.setPrompt(null);
      return;
    }
    if (best) {
      const a = best.actions.filter((x) => !x.hidden);
      const label = a.length === 1 ? a[0].label : best.label;
      g.ui.setPrompt(best.hold ? 'Hold E' : 'E', label, a.length === 1 && a[0].disabled ? a[0].disabled : a.length > 1 ? `${a.length} options` : best.sub ?? '');
    } else g.ui.setPrompt(null);
  }

  private handleInteract(dt: number) {
    const g = this.g;
    const t = this.current;
    if (!t || g.ui.blocking) {
      this.holdT = 0;
      g.ui.setHold(null);
      return;
    }
    if (t.hold) {
      if (g.input.isDown('E')) {
        this.holdT += dt;
        g.ui.setHold(this.holdT / t.hold);
        if (this.holdT >= t.hold) {
          this.holdT = 0;
          g.ui.setHold(null);
          t.actions[0].run();
        }
      } else {
        this.holdT = 0;
        g.ui.setHold(null);
      }
      return;
    }
    if (g.input.wasPressed('E')) {
      const acts = t.actions.filter((x) => !x.hidden);
      if (acts.length === 1) {
        if (acts[0].disabled) g.ui.toast({ text: acts[0].disabled, kind: 'warn' });
        else acts[0].run();
      } else if (acts.length > 1) g.screens.actionMenu(t.label, acts);
      g.audio.click();
    }
  }

  /** Programmatic interaction (tests/automation). */
  interact(): boolean {
    const t = this.current;
    if (!t) return false;
    const acts = t.actions.filter((x) => !x.hidden);
    if (acts.length === 1 && !acts[0].disabled) acts[0].run();
    else this.g.screens.actionMenu(t.label, acts);
    return true;
  }
}
