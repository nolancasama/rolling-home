import * as THREE from 'three';
import { clamp } from '../sim/geo';
import { footprint, itemElevation, usePoint } from '../sim/furnish';
import { activeVehicle, defOf, floorItems, itemsInVehicle } from '../sim/vehicle';
import type { Rect } from '../data/types';
import type { Game, Mode, ModeId } from './game';
import type { Action } from './interactions';

// First-person inside the RV. Positions are vehicle-local (x across, z along).

interface ITarget {
  id: string;
  label: string;
  x: number;
  z: number;
  y: number;
  radius: number;
  actions: Action[];
}

const R = 0.22;
const EYE = 1.6;

export class InteriorMode implements Mode {
  lx = 0;
  lz = 0;
  yaw = Math.PI;
  pitch = -0.05;
  private boxes: Rect[] = [];
  private sig = '';
  private targets: ITarget[] = [];
  current: ITarget | null = null;
  private scanT = 0;

  constructor(private g: Game) {}

  enter(from: ModeId) {
    const g = this.g;
    const def = g.phys!.def;
    const inr = def.interior;
    if (from === 'explore' || from === 'menu') {
      const s = g.sim!.s;
      if (from === 'menu' && s.player.inside) {
        this.lx = s.player.inside.x;
        this.lz = s.player.inside.z;
        this.yaw = s.player.inside.yaw;
      } else {
        const z = inr.door.zone;
        this.lx = (z.x0 + z.x1) / 2 + 0.1;
        this.lz = (z.z0 + z.z1) / 2;
        this.yaw = Math.PI / 2; // face +X (into the RV from the curb-side door)
        g.vv!.doorTarget = 1;
        setTimeout(() => g.vv && (g.vv.doorTarget = 0), 900);
        g.audio.door();
      }
    } else if (from === 'drive') {
      this.lx = inr.driverSeat.x - 0.35;
      this.lz = inr.driverSeat.z - 0.65;
      this.yaw = Math.PI;
    }
    this.pitch = -0.05;
    this.rebuildColliders(true);
    this.unstick();
    g.camera.near = 0.03;
    g.camera.updateProjectionMatrix();
    complete(g, 'inspect');
  }

  exit(_to: ModeId) {
    this.writeState();
    this.g.ui.setPrompt(null);
    this.g.camera.near = 0.08;
    this.g.camera.updateProjectionMatrix();
  }

  writeState() {
    this.g.sim!.s.player.inside = { x: this.lx, z: this.lz, yaw: this.yaw };
  }

  timeScale() {
    return 6;
  }

  rebuildColliders(force = false) {
    const s = this.g.sim!.s;
    const v = activeVehicle(s);
    const items = floorItems(s, v.id);
    const sig = items.map((i) => (i.where.kind === 'floor' ? `${i.uid}${i.where.x}${i.where.z}${i.where.rot}${i.where.y}${i.state}${JSON.stringify(i.config)}` : '')).join('|');
    if (!force && sig === this.sig) return;
    this.sig = sig;
    const inr = this.g.phys!.def.interior;
    this.boxes = [];
    for (const it of items) {
      const d = defOf(it);
      if (!d.floor || d.floor.flat || it.where.kind !== 'floor') continue;
      if (itemElevation(this.g.phys!.def, { ...it.where, uid: it.uid, def: it.def, config: it.config, state: it.state }) >= 1.75) continue;
      this.boxes.push(footprint(d, it.where.x, it.where.z, it.where.rot));
    }
    for (const p of [inr.driverSeat, inr.passengerSeat]) this.boxes.push({ x0: p.x - 0.26, x1: p.x + 0.26, z0: p.z - 0.25, z1: p.z + 0.3 });
    // dashboard
    const dz = inr.cab.z1;
    this.boxes.push({ x0: -inr.halfWidth, x1: inr.halfWidth, z0: dz - 0.12, z1: dz + 1 });
  }

  /** Push out of furniture if spawned overlapping. */
  private unstick() {
    for (let i = 0; i < 20; i++) {
      const [x, z] = this.resolve(this.lx, this.lz);
      if (Math.abs(x - this.lx) < 1e-4 && Math.abs(z - this.lz) < 1e-4) break;
      this.lx = x;
      this.lz = z;
    }
  }

  private resolve(x: number, z: number): [number, number] {
    const inr = this.g.phys!.def.interior;
    const hw = inr.halfWidth;
    x = clamp(x, -hw + R, hw - R);
    z = clamp(z, inr.living.z0 + R, inr.cab.z1 - R);
    for (const b of this.boxes) {
      const qx = clamp(x, b.x0, b.x1), qz = clamp(z, b.z0, b.z1);
      const dx = x - qx, dz = z - qz;
      const d2 = dx * dx + dz * dz;
      if (d2 < R * R) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          x = qx + (dx / d) * R;
          z = qz + (dz / d) * R;
        } else {
          // inside: push to the nearest edge
          const opts = [[b.x0 - R, z], [b.x1 + R, z], [x, b.z0 - R], [x, b.z1 + R]] as [number, number][];
          let best = opts[0], bd = Infinity;
          for (const o of opts) {
            const dd = Math.hypot(o[0] - x, o[1] - z);
            if (dd < bd) { bd = dd; best = o; }
          }
          [x, z] = best;
        }
      }
    }
    return [x, z];
  }

  update(dt: number) {
    const g = this.g;
    const inp = g.input;
    const sens = 0.0024 * g.settings.sensitivity;
    if (!g.ui.blocking && !inp.pointerLocked && inp.clicked.has(0)) inp.requestLock();
    this.yaw -= inp.mouseDX * sens;
    this.pitch = clamp(this.pitch - inp.mouseDY * sens * (g.settings.invertY ? -1 : 1), -1.3, 1.2);
    this.rebuildColliders();
    const fwd = inp.axis(['S', 'ArrowDown'], ['W', 'ArrowUp']);
    const side = inp.axis(['A', 'ArrowLeft'], ['D', 'ArrowRight']);
    if (fwd || side) {
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
      let mx = fx * fwd + rx * side, mz = fz * fwd + rz * side;
      const l = Math.hypot(mx, mz);
      mx /= l;
      mz /= l;
      const sp = 1.35 * dt;
      [this.lx, this.lz] = this.resolve(this.lx + mx * sp, this.lz + mz * sp);
      g.audio.footstepTick(dt, 1.35, 'wood');
    }
    // camera: local eye → world through the vehicle body transform
    const vv = g.vv!;
    vv.body.updateMatrixWorld(true);
    const inr = g.phys!.def.interior;
    // step down and crouch under the lower cab headliner (and its mirror) when walking forward between the seats
    const cabK = clamp((this.lz - (inr.living.z1 - 0.3)) / 0.35, 0, 1);
    const floorY = inr.floorY + (inr.cabFloorY - inr.floorY) * cabK;
    const ceilY = inr.ceilingY + (inr.cabCeilingY - inr.ceilingY) * cabK;
    const eyeH = Math.min(EYE, ceilY - floorY - 0.12 - 0.23 * cabK);
    const eye = new THREE.Vector3(this.lx, floorY + eyeH, this.lz).applyMatrix4(vv.body.matrixWorld);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const q = new THREE.Quaternion().setFromRotationMatrix(vv.body.matrixWorld);
    dir.applyQuaternion(q);
    g.camera.position.copy(eye);
    g.camera.lookAt(eye.clone().add(dir));
    g.focus.copy(g.vv!.root.position);
    // interactions
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.15;
      this.targets = this.buildTargets();
    }
    this.pick();
    if (!g.ui.blocking && this.current && inp.wasPressed('E')) {
      const acts = this.current.actions.filter((a) => !a.hidden);
      if (acts.length === 1) {
        if (acts[0].disabled) g.ui.toast({ text: acts[0].disabled, kind: 'warn' });
        else acts[0].run();
      } else g.screens.actionMenu(this.current.label, acts);
      g.audio.click();
    }
    if (!g.ui.blocking && inp.wasPressed('F')) g.setMode('furnish');
  }

  private pick() {
    const g = this.g;
    let best: ITarget | null = null;
    let bestScore = Infinity;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    for (const t of this.targets) {
      const dx = t.x - this.lx, dz = t.z - this.lz;
      const d = Math.hypot(dx, dz);
      if (d > t.radius) continue;
      const cos = d > 0.05 ? (dx * fx + dz * fz) / d : 1;
      if (cos < 0.35 && d > 0.45) continue;
      const score = d * (1.6 - cos);
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
      const acts = best.actions.filter((a) => !a.hidden);
      g.ui.setPrompt('E', acts.length === 1 ? acts[0].label : best.label, acts.length === 1 && acts[0].disabled ? acts[0].disabled : acts.length > 1 ? `${acts.length} options` : '');
    } else g.ui.setPrompt('F', 'Furnishing mode', 'Tab: phone · E: interact');
  }

  interact(): boolean {
    const t = this.current;
    if (!t) return false;
    const acts = t.actions.filter((a) => !a.hidden);
    if (acts.length === 1 && !acts[0].disabled) acts[0].run();
    else this.g.screens.actionMenu(t.label, acts);
    return true;
  }

  buildTargets(): ITarget[] {
    const g = this.g;
    const sim = g.sim!;
    const s = sim.s;
    const v = activeVehicle(s);
    const inr = g.phys!.def.interior;
    const sc = g.screens;
    const out: ITarget[] = [];
    const dz = inr.door.zone;
    out.push({ id: 'door', label: 'Door', x: (dz.x0 + dz.x1) / 2 - 0.15, z: (dz.z0 + dz.z1) / 2, y: 1, radius: 1.0, actions: [{ label: 'Step outside', run: () => g.setMode('explore') }] });
    out.push({ id: 'seat', label: 'Driver’s seat', x: inr.driverSeat.x, z: inr.driverSeat.z - 0.45, y: 1, radius: 1.0, actions: [{ label: 'Take the wheel', run: () => g.setMode('drive') }] });
    out.push({ id: 'panel', label: 'RV systems panel', x: dz.x1 + 0.2, z: dz.z1 + 0.05, y: 1.4, radius: 0.9, actions: [{ label: 'Check RV systems', run: () => sc.openPhone('rv') }] });
    if (inr.cabover) {
      out.push({
        id: 'cabover', label: 'Cab-over bunk', x: 0, z: inr.cab.z0 + 0.25, y: 2, radius: 0.9,
        actions: [
          { label: 'Sleep in the cab-over bunk', run: () => sc.sleep(false) },
          { label: 'Nap (1 h)', run: () => sc.sleep(true) },
        ],
      });
    }
    for (const it of floorItems(s, v.id)) {
      const d = defOf(it);
      if (!d.floor || it.where.kind !== 'floor') continue;
      const [ux, uz] = usePoint(d, it.where.x, it.where.z, it.where.rot);
      const f = d.features ?? {};
      const acts: Action[] = [];
      if (f.bed) {
        acts.push({ label: 'Sleep until morning', run: () => sc.sleep(false) });
        acts.push({ label: 'Nap (1 h)', run: () => sc.sleep(true) });
      }
      if (f.galley) {
        acts.push({ label: 'Cook a meal...', run: () => sc.cook() });
        acts.push({ label: 'Wash up at the sink', run: () => sc.timed(() => sim.wash(), 'A quick wash at the sink.') });
      }
      if (f.fridge) acts.push({ label: 'Grab something to eat...', run: () => sc.eat() });
      if (f.toilet) acts.push({ label: 'Use the toilet', run: () => sc.timed(() => sim.toilet(), '') });
      if (f.shower) acts.push({ label: 'Take a shower', run: () => sc.timed(() => sim.rvShower(), 'Hot water, finally.') });
      if (f.table) acts.push({ label: 'Work remotely...', run: () => sc.remoteWork(true) });
      if (f.seat && !f.table) acts.push({ label: 'Sit and work on the laptop...', run: () => sc.remoteWork(false) });
      if (f.seat || f.table) acts.push({ label: 'Sit and relax', run: () => sc.timed(() => sim.relax(false), 'You put your feet up for a while.') });
      if ((f.seat || f.table) && !f.fridge) acts.push({ label: 'Have a snack...', run: () => sc.eat() });
      if (d.storage && !f.fridge) acts.push({ label: `Open ${d.name.toLowerCase()} storage`, run: () => sc.storage(`item:${it.uid}`) });
      if (f.fridge) acts.push({ label: 'View fridge contents', run: () => sc.storage(`item:${it.uid}`) });
      const hobbies = itemsInVehicle(s, v.id).filter((i) => i.where.kind === 'stored' && defOf(i).features?.activity);
      if (f.bed || f.seat) for (const hb of hobbies) acts.push({ label: defOf(hb).features!.activity!.kind === 'guitar' ? 'Play the guitar' : 'Read a book', run: () => sc.timed(() => sim.hobby(hb.uid), '') });
      if (!acts.length) continue;
      out.push({ id: it.uid, label: d.name, x: ux, z: uz, y: 1, radius: 1.15, actions: acts });
    }
    // loose floor space & cab console
    out.push({ id: 'floorstore', label: 'Floor storage', x: 0, z: (inr.living.z0 + inr.living.z1) / 2, y: 0.4, radius: 0.0, actions: [] });
    return out.filter((t) => t.radius > 0);
  }
}

function complete(g: Game, id: string) {
  g.sim!.objective(id);
}
