import { WORLD } from '../data/map';
import type { VehicleDef } from '../data/types';
import { frontAxleZ, rearAxleZ } from '../data/vehicles';
import type { Performance } from '../sim/maintenance';
import { clamp, localToWorld } from '../sim/geo';
import { groundAt, SURFACE_GRIP, SURFACE_ROLL, SURFACE_ROUGH, type Surface } from '../world/terrain';
import type { RoadEdge } from '../world/roads';
import type { Collider, CollisionWorld } from './collision';

// Approachable arcade vehicle model. Condition and load change how it feels
// through the Performance multipliers from the simulation.

export interface DriveInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
}

const G = 9.81;

export class VehiclePhysics {
  x = 0;
  z = 0;
  y = 0;
  heading = 0;
  speed = 0;
  yawRate = 0;
  steerAngle = 0;
  pitch = 0;
  roll = 0;
  visPitch = 0;
  visRoll = 0;
  reverse = false;
  engineOn = false;
  mass = 3000;
  perf: Performance | null = null;
  fuelEmpty = false;
  // per-step outputs
  impact = 0;
  traveled = 0;
  brakeEnergy = 0;
  accel = 0;
  latAccel = 0;
  surface: Surface = 'asphalt';
  road: RoadEdge | null = null;
  rough = 0;
  private t = 0;
  private stuckBlocked = 0;

  constructor(public def: VehicleDef) {}

  place(x: number, z: number, heading: number) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.yawRate = 0;
    this.steerAngle = 0;
    this.settle();
  }

  /** Recompute height/pitch/roll from the ground under the wheels. */
  settle() {
    const g = this.groundSample();
    this.y = g.y;
    this.pitch = g.pitch;
    this.roll = g.roll;
  }

  private groundSample() {
    const d = this.def.dims;
    const zf = frontAxleZ(this.def), zr = rearAxleZ(this.def), tw = d.track / 2;
    const pts: [number, number][] = [[tw, zf], [-tw, zf], [tw, zr], [-tw, zr]];
    const ys: number[] = [];
    let surf: Surface = 'asphalt';
    let road: RoadEdge | null = null;
    pts.forEach(([lx, lz], i) => {
      const [wx, wz] = localToWorld(lx, lz, this.x, this.z, this.heading);
      const g = groundAt(wx, wz);
      ys.push(g.y);
      if (i === 0) {
        surf = g.surface;
        road = g.road;
      }
    });
    const front = (ys[0] + ys[1]) / 2, rear = (ys[2] + ys[3]) / 2;
    const left = (ys[0] + ys[2]) / 2, right = (ys[1] + ys[3]) / 2;
    const y = rear + ((front - rear) * (0 - zr)) / (zf - zr);
    return {
      y, pitch: -Math.atan2(front - rear, zf - zr), roll: Math.atan2(left - right, d.track), surface: surf, road,
      slope: (front - rear) / (zf - zr),
    };
  }

  step(dt: number, inp: DriveInput, world: CollisionWorld, ignore: (c: Collider) => boolean) {
    this.impact = 0;
    this.traveled = 0;
    this.brakeEnergy = 0;
    const steps = Math.max(1, Math.ceil(dt / (1 / 90)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.sub(h, inp, world, ignore);
  }

  private sub(dt: number, inp: DriveInput, world: CollisionWorld, ignore: (c: Collider) => boolean) {
    const hd = this.def.handling;
    const p = this.perf;
    if (!p) return;
    this.t += dt;
    const g = this.groundSample();
    this.surface = g.surface;
    this.road = g.road;
    this.rough = SURFACE_ROUGH[g.surface];
    const grip = SURFACE_GRIP[g.surface] * hd.grip * p.grip;
    const v = this.speed;
    const vAbs = Math.abs(v);
    // gear logic: S at standstill engages reverse; W at standstill goes forward
    if (vAbs < 0.4) {
      if (inp.brake > 0.5 && inp.throttle < 0.1) this.reverse = true;
      else if (inp.throttle > 0.1) this.reverse = false;
    }
    // steering
    const speedFactor = 1 / (1 + Math.pow(vAbs / 13, 2) * 1.3);
    const wander = p.wander * Math.sin(this.t * 0.9) * Math.sin(this.t * 0.37 + 1.3);
    const pull = vAbs > 3 ? p.drift + wander : 0;
    const target = clamp(inp.steer, -1, 1) * hd.maxSteer * (0.32 + 0.68 * speedFactor) + pull;
    const rate = hd.steerRate * p.steerResponse * dt;
    this.steerAngle += clamp(target - this.steerAngle, -rate, rate);
    // longitudinal forces
    const m = this.mass;
    let force = 0;
    const engine = this.engineOn && !this.fuelEmpty;
    if (!this.reverse) {
      const throttle = engine ? inp.throttle : 0;
      const P = hd.powerKw * 1000 * p.power;
      const fMax = m * 3.0 * Math.min(1, grip + 0.15);
      let fe = throttle * Math.min(P / Math.max(vAbs, 2.5), fMax);
      const vmax = hd.maxSpeed * p.topSpeed;
      if (vAbs > vmax * 0.92) fe *= clamp(1 - (vAbs - vmax * 0.92) / (vmax * 0.08), 0, 1);
      force += fe;
      if (throttle < 0.05 && v > 0.2) force -= m * 0.35; // engine braking
    } else if (engine && inp.brake > 0.05 && v > -hd.reverseMax) {
      force -= inp.brake * m * 1.6;
    }
    force -= Math.sign(v) * hd.drag * v * v;
    if (vAbs > 0.05) force -= Math.sign(v) * m * G * 0.011 * SURFACE_ROLL[g.surface];
    force -= m * G * Math.sin(Math.atan(g.slope)) * Math.cos(0);
    let a = force / m;
    // braking (does not cross zero)
    let brake = 0;
    if (!this.reverse) brake = inp.brake;
    else brake = inp.throttle; // W brakes while reversing
    if (inp.handbrake) brake = Math.max(brake, 0.85);
    const decel = brake * hd.brakeDecel * p.brake * Math.min(1, grip + 0.2);
    let nv = v + a * dt;
    if (decel > 0) {
      const dv = decel * dt;
      if (Math.abs(nv) <= dv) nv = 0;
      else nv -= Math.sign(nv) * dv;
      if (vAbs > 4) this.brakeEnergy += vAbs * dv;
    }
    // stop creeping when nearly stationary with no input
    if (Math.abs(nv) < 0.08 && inp.throttle < 0.05 && !(this.reverse && inp.brake > 0.05)) {
      if (Math.abs(g.slope) < 0.08 || brake > 0) nv = 0;
    }
    this.accel = (nv - v) / dt;
    this.speed = nv;
    // yaw with a lateral grip limit (understeer when pushing too hard)
    const wb = this.def.dims.wheelbase;
    let yawT = (this.speed * Math.tan(this.steerAngle)) / wb;
    const latMax = G * grip * 0.95;
    if (Math.abs(this.speed * yawT) > latMax && Math.abs(this.speed) > 0.5) yawT = (Math.sign(yawT) * latMax) / Math.abs(this.speed);
    this.yawRate += (yawT - this.yawRate) * Math.min(1, dt * hd.yawResponse * p.steerResponse);
    this.latAccel = this.speed * this.yawRate;
    this.heading += this.yawRate * dt;
    const px = this.x, pz = this.z;
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    // water & world bounds act as walls
    const here = groundAt(this.x, this.z);
    if (here.surface === 'water') {
      this.x = px;
      this.z = pz;
      this.impact = Math.max(this.impact, Math.abs(this.speed) * 0.3);
      this.speed *= -0.1;
    }
    this.x = clamp(this.x, WORLD.playMinX, WORLD.playMaxX);
    this.z = clamp(this.z, WORLD.playMinZ, WORLD.playMaxZ);
    // collisions
    const d = this.def.dims;
    const gy = this.groundSample();
    const contacts = world.boxContacts(this.x, this.z, d.width / 2, d.length / 2, this.heading, gy.y + 0.35, gy.y + d.height, ignore);
    for (const c of contacts) {
      this.x += c.nx * c.depth;
      this.z += c.nz * c.depth;
      let vx = Math.sin(this.heading) * this.speed, vz = Math.cos(this.heading) * this.speed;
      const vn = vx * c.nx + vz * c.nz;
      if (vn < 0) {
        vx -= c.nx * vn * 1.2;
        vz -= c.nz * vn * 1.2;
        this.impact = Math.max(this.impact, -vn);
        this.yawRate *= 0.4;
      }
      this.speed = vx * Math.sin(this.heading) + vz * Math.cos(this.heading);
    }
    this.stuckBlocked = contacts.length ? this.stuckBlocked + dt : 0;
    this.traveled += Math.hypot(this.x - px, this.z - pz);
    // suspension (visual): settle toward the ground with some body motion
    const gs = this.groundSample();
    this.y += (gs.y - this.y) * Math.min(1, dt * 18);
    this.pitch += (gs.pitch - this.pitch) * Math.min(1, dt * 10);
    this.roll += (gs.roll - this.roll) * Math.min(1, dt * 10);
    const bounce = this.rough * Math.min(1, Math.abs(this.speed) / 12) * 0.012 * (1 + (p.vibration ?? 0));
    // rotation.x > 0 dips the nose (braking dive); rotation.z > 0 lifts the left side (left turn body roll)
    this.visPitch = this.pitch - clamp(this.accel * 0.006, -0.03, 0.03) + Math.sin(this.t * 23) * bounce;
    this.visRoll = this.roll + clamp(this.latAccel * 0.009 * (1 + p.roofPenalty), -0.05, 0.05) + Math.sin(this.t * 19 + 1) * bounce;
  }
}
