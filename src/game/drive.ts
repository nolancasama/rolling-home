import * as THREE from 'three';
import { clamp, localToWorld } from '../sim/geo';
import { applyDrivingWear, applyImpact, fuelForKm, performance } from '../sim/maintenance';
import { looseUnsecured } from '../sim/storage';
import { activeVehicle } from '../sim/vehicle';
import { computeWeight } from '../sim/weight';
import { note } from '../sim/core';
import { compressionAt, nextManeuver } from '../world/roads';
import { terrainHeight } from '../world/terrain';
import type { Game, Mode, ModeId } from './game';

// Driving: physics stepping, cameras, fuel/wear accounting, GPS and parking aids.

export class DriveMode implements Mode {
  cam: 'chase' | 'cockpit' = 'chase';
  braking = false;
  lightMode: 'auto' | 'on' | 'off' = 'auto';
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private discT = 0;
  private refuseNotified = false;
  private looseT = 0;
  private wearAcc = { km: 0, rough: 0, brake: 0, harsh: 0 };
  private wearT = 0;
  gps: ReturnType<typeof nextManeuver> | null = null;
  parkDist: number | null = null;
  ready = false;
  /** Automation: overrides keyboard input when set. */
  auto: { throttle: number; brake: number; steer: number; handbrake?: boolean } | null = null;

  constructor(private g: Game) {}

  enter(from: ModeId) {
    const g = this.g;
    this.cam = g.settings.driveCam;
    const v = activeVehicle(g.sim!.s);
    v.engineOn = true;
    v.parkingBrake = false;
    g.phys!.engineOn = true;
    g.phys!.perf = performance(g.sim!.s, v.id);
    g.phys!.mass = computeWeight(g.sim!.s, v.id).total;
    g.phys!.fuelEmpty = v.fuel <= 0.05;
    this.snapCamera();
    g.audio.door();
    g.audio.startEngine();
    this.ready = false;
    this.refuseNotified = false;
    void from;
    // pre-trip check
    g.screens.pretrip(() => {
      this.ready = true;
    }, () => {
      g.setMode('interior');
    });
  }

  exit(to: ModeId) {
    const g = this.g;
    const v = activeVehicle(g.sim!.s);
    this.flushWear();
    v.engineOn = false;
    v.parkingBrake = true;
    g.phys!.engineOn = false;
    g.phys!.speed = 0;
    v.pose = { x: g.phys!.x, z: g.phys!.z, heading: g.phys!.heading };
    g.audio.stopEngine();
    g.ui.setPrompt(null);
    g.sim!.changed();
    void to;
  }

  lightsOn(night: boolean): boolean {
    if (this.lightMode === 'on') return true;
    if (this.lightMode === 'off') return false;
    return night && this.g.settings.autoLights;
  }

  timeScale() {
    const p = this.g.phys!;
    if (Math.abs(p.speed) < 1) return 6;
    return compressionAt(p.x, p.z);
  }

  snapCamera() {
    const p = this.g.phys!;
    const back = this.chaseOffset();
    this.camPos.set(p.x - Math.sin(p.heading) * back.d, p.y + back.h, p.z - Math.cos(p.heading) * back.d);
    this.camLook.set(p.x, p.y + 1.5, p.z);
  }

  private chaseOffset() {
    const L = this.g.phys!.def.dims.length;
    return { d: L * 1.15 + 4.5, h: this.g.phys!.def.dims.height + 1.6 };
  }

  update(dt: number) {
    const g = this.g;
    const inp = g.input;
    const p = g.phys!;
    const sim = g.sim!;
    const s = sim.s;
    const v = activeVehicle(s);
    if (inp.wasPressed('C')) {
      this.cam = this.cam === 'chase' ? 'cockpit' : 'chase';
      g.settings.driveCam = this.cam;
    }
    if (inp.wasPressed('L')) this.lightMode = this.lightMode === 'auto' ? 'on' : this.lightMode === 'on' ? 'off' : 'auto';
    const blocked = g.ui.blocking || !this.ready;
    let throttle = blocked ? 0 : inp.isDown('W') || inp.isDown('ArrowUp') ? 1 : 0;
    let brake = blocked ? 0 : inp.isDown('S') || inp.isDown('ArrowDown') ? 1 : 0;
    let steer = blocked ? 0 : inp.axis(['D', 'ArrowRight'], ['A', 'ArrowLeft']);
    if (this.auto && !g.ui.blocking) {
      throttle = this.auto.throttle;
      brake = this.auto.brake;
      steer = this.auto.steer;
    }
    const w = computeWeight(s, v.id);
    if (w.status === 'refuse') {
      throttle = 0;
      if (!this.refuseNotified) {
        this.refuseNotified = true;
        note(s, `Too overloaded to drive safely: ${w.messages.join('; ')}. Remove weight first.`, 'bad');
      }
    }
    if (g.settings.steeringAssist && p.perf) steer -= p.perf.drift * 2.5;
    p.fuelEmpty = v.fuel <= 0.05;
    const handbrake = (!blocked && inp.isDown('Space')) || !!this.auto?.handbrake;
    this.braking = (brake > 0 && !p.reverse) || (p.reverse && throttle > 0) || handbrake;
    p.step(dt, { throttle, brake, steer, handbrake }, g.world.collision, (c) => c.tag === 'player-vehicle');
    // impacts
    if (p.impact > 1.5) {
      applyImpact(s, v, p.impact);
      g.audio.thud(Math.min(1, p.impact / 10));
      const c = g.world.collision.boxContacts(p.x, p.z, p.def.dims.width / 2 + 0.3, p.def.dims.length / 2 + 0.3, p.heading, p.y, p.y + 3, (cc) => cc.tag === 'player-vehicle');
      for (const k of c) if (k.other.tag === 'traffic' && k.other.kind === 'box') g.world.traffic.bump(k.other);
      if (p.impact > 3) note(s, 'Bump! That will leave a mark on the paint.', 'warn');
    }
    // distance → fictional km, fuel, wear
    const comp = compressionAt(p.x, p.z);
    const km = (p.traveled * comp) / 1000;
    if (km > 0) {
      const perf = p.perf ?? performance(s, v.id);
      v.fuel = Math.max(0, v.fuel - fuelForKm(s, v.id, km, Math.abs(p.speed), perf) * (0.6 + 0.4 * throttle + (p.reverse ? 0.3 : 0)));
      s.stats.kmTotal += km;
      s.stats.today.km += km;
      this.wearAcc.km += km;
      this.wearAcc.rough = Math.max(this.wearAcc.rough, p.rough);
      this.wearAcc.harsh = Math.max(this.wearAcc.harsh, throttle * Math.min(1, perf.loadRatio - 0.6));
      if (p.road) g.edgeDriven[p.road.def.id] = (g.edgeDriven[p.road.def.id] ?? 0) + p.traveled;
    }
    this.wearAcc.brake += p.brakeEnergy * comp * 0.2;
    if (Math.abs(p.speed) < 0.3 && v.engineOn) v.fuel = Math.max(0, v.fuel - (p.def.idleLph * dt * 6) / 3600);
    this.wearT += dt;
    if (this.wearT > 1) this.flushWear();
    // loose cargo shifting on harsh maneuvers
    this.looseT -= dt;
    if ((Math.abs(p.accel) > 4.2 || Math.abs(p.latAccel) > 4.2) && this.looseT <= 0) {
      const loose = looseUnsecured(s, v.id);
      if (loose.length) {
        this.looseT = 4;
        for (const it of loose) if (it.cargo) it.cargo.damage = Math.min(1, it.cargo.damage + (it.cargo.fragile ? 0.18 : 0.07));
        g.audio.thud(0.4);
        note(s, `Crash in the back! ${loose.length} loose item${loose.length > 1 ? 's' : ''} slid around. Strap cargo down before driving.`, 'warn');
      }
    }
    // exploration of major roads (60% of the edge driven)
    for (const id in g.edgeDriven) {
      if (!s.explored[id]) {
        const e = g.edgeDriven[id];
        const edge = p.road && p.road.def.id === id ? p.road : null;
        if (edge && e > edge.length * 0.6) {
          s.explored[id] = true;
          if (edge.def.kind === 'highway' || edge.def.kind === 'mountain') note(s, `${edge.def.name} explored: assisted travel unlocked on it.`, 'info');
        }
      }
    }
    // discoveries
    this.discT -= dt;
    if (this.discT <= 0) {
      this.discT = 0.5;
      v.pose = { x: p.x, z: p.z, heading: p.heading };
      sim.discover(p.x, p.z);
    }
    // GPS
    if (g.route) {
      this.gps = nextManeuver(g.route, p.x, p.z);
      if (this.gps.remaining < 30) {
        note(s, 'You have arrived at your destination.', 'good');
        g.route = null;
        g.routeDest = null;
        this.gps = null;
      }
    } else this.gps = null;
    // parking sensor (reversing or slow)
    this.parkDist = null;
    if (g.settings.parkingGuides && Math.abs(p.speed) < 4) this.parkDist = this.obstacleDistance(p.reverse ? -1 : 1);
    // exit controls
    if (!g.ui.blocking && Math.abs(p.speed) < 0.5) {
      g.ui.setPrompt('E', 'Get out', 'I: go to the living area · C: camera · L: lights');
      if (inp.wasPressed('E')) {
        g.setMode('explore');
        return;
      }
      if (inp.wasPressed('I')) {
        g.setMode('interior');
        return;
      }
    } else g.ui.setPrompt(null);
    this.updateCamera(dt);
    g.focus.set(p.x, p.y, p.z);
  }

  private flushWear() {
    const g = this.g;
    if (!g.sim || this.wearAcc.km <= 0) return;
    const s = g.sim.s;
    const v = activeVehicle(s);
    const perf = g.phys!.perf ?? performance(s, v.id);
    applyDrivingWear(s, v, { km: this.wearAcc.km, rough: this.wearAcc.rough, brakeEnergy: this.wearAcc.brake, harsh: this.wearAcc.harsh }, perf);
    this.wearAcc = { km: 0, rough: 0, brake: 0, harsh: 0 };
    this.wearT = 0;
    g.phys!.perf = performance(s, v.id);
  }

  private obstacleDistance(dir: 1 | -1): number | null {
    const p = this.g.phys!;
    const L = p.def.dims.length / 2, W = p.def.dims.width / 2;
    for (let d = 0.2; d <= 4; d += 0.2) {
      for (const lx of [-W + 0.1, 0, W - 0.1]) {
        const [x, z] = localToWorld(lx, dir * (L + d), p.x, p.z, p.heading);
        if (this.g.world.collision.pointBlocked(x, z, p.y + 1, 0.05)) return d;
      }
    }
    return null;
  }

  private updateCamera(dt: number) {
    const g = this.g;
    const p = g.phys!;
    const vv = g.vv!;
    if (this.cam === 'cockpit') {
      vv.body.updateMatrixWorld(true);
      const inr = p.def.interior;
      const fy = inr.cabFloorY;
      const eye = new THREE.Vector3(inr.driverSeat.x, fy + 1.22, inr.driverSeat.z - 0.08).applyMatrix4(vv.body.matrixWorld);
      const lookL = new THREE.Vector3(inr.driverSeat.x, fy + 1.1, inr.driverSeat.z + 10).applyMatrix4(vv.body.matrixWorld);
      const look = g.input.isDown('Q') ? new THREE.Vector3(inr.driverSeat.x + 10, fy + 1.1, inr.driverSeat.z).applyMatrix4(vv.body.matrixWorld) : g.input.isDown('X') ? new THREE.Vector3(inr.driverSeat.x - 10, fy + 1.1, inr.driverSeat.z).applyMatrix4(vv.body.matrixWorld) : lookL;
      g.camera.position.copy(eye);
      g.camera.lookAt(look);
      g.camera.near = 0.05;
      g.camera.updateProjectionMatrix();
      vv.exterior.visible = true;
      return;
    }
    g.camera.near = 0.2;
    g.camera.updateProjectionMatrix();
    const off = this.chaseOffset();
    const lookBack = g.input.isDown('Q');
    const hd = p.heading + (p.reverse && p.speed < -1 ? Math.PI : 0) + (lookBack ? Math.PI : 0);
    const want = new THREE.Vector3(p.x - Math.sin(hd) * off.d, p.y + off.h, p.z - Math.cos(hd) * off.d);
    const gy = terrainHeight(want.x, want.z) + 1.2;
    if (want.y < gy) want.y = gy;
    const k = 1 - Math.exp(-dt * 4.5);
    this.camPos.lerp(want, k);
    this.camLook.lerp(new THREE.Vector3(p.x + Math.sin(p.heading) * 3, p.y + 1.6, p.z + Math.cos(p.heading) * 3), 1 - Math.exp(-dt * 8));
    g.camera.position.copy(this.camPos);
    g.camera.lookAt(this.camLook);
    void clamp;
  }
}
