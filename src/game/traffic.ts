import * as THREE from 'three';
import { EDGES, pointAlong, type RoadEdge } from '../world/roads';
import { profileAt } from '../world/terrain';
import { carMesh } from '../render/npcVehicles';
import { CollisionWorld, type BoxCollider } from './collision';

// Simple traffic: cars follow road edges in the right-hand lane, choose a
// random next edge at junctions and keep their distance.

interface Car {
  mesh: THREE.Mesh;
  edge: RoadEdge;
  along: number;
  dir: 1 | -1;
  speed: number;
  cruise: number;
  collider: BoxCollider;
  hl: number;
  hw: number;
  stopT: number;
  honk: boolean;
}

const COLORS = ['#c23a2c', '#2a5a8a', '#e8e4dc', '#3a3a3e', '#7a8a5a', '#d8a030', '#5a6a7a', '#8a3a5a'];
const KINDS = ['sedan', 'sedan', 'suv', 'pickup', 'pickup', 'boxtruck'] as const;

const usable = (e: RoadEdge) => !e.def.loop && (e.def.kind === 'highway' || e.def.kind === 'mountain' || e.def.kind === 'street');
const POOL = EDGES.filter(usable);

export interface PlayerBox {
  x: number;
  z: number;
  heading: number;
  hw: number;
  hl: number;
}

export class Traffic {
  cars: Car[] = [];
  group = new THREE.Group();
  onHonk: ((x: number, z: number) => void) | null = null;

  constructor(private world: CollisionWorld, count: number) {
    for (let i = 0; i < count; i++) {
      const kind = KINDS[i % KINDS.length];
      const mesh = carMesh(COLORS[(i * 3) % COLORS.length], kind);
      mesh.castShadow = true;
      const hl = kind === 'boxtruck' ? 3.6 : kind === 'pickup' ? 2.7 : 2.35;
      const hw = kind === 'boxtruck' ? 1.15 : 0.92;
      const collider = CollisionWorld.makeBox(0, 0, hw, hl, 0, -1000, -999, 'traffic');
      world.dynamic.push(collider);
      const edge = POOL[(i * 7) % POOL.length];
      this.cars.push({ mesh, edge, along: (i * 97) % edge.length, dir: i % 2 ? 1 : -1, speed: 0, cruise: 1, collider, hl, hw, stopT: 0, honk: false });
      this.group.add(mesh);
    }
  }

  private respawn(c: Car, fx: number, fz: number) {
    for (let tries = 0; tries < 30; tries++) {
      const e = POOL[Math.floor(Math.random() * POOL.length)];
      const along = Math.random() * e.length;
      const p = pointAlong(e, along);
      const d = Math.hypot(p.x - fx, p.z - fz);
      if (d > 220 && d < 700) {
        c.edge = e;
        c.along = along;
        c.dir = Math.random() < 0.5 ? 1 : -1;
        c.speed = e.def.speed * 0.8;
        c.cruise = 0.85 + Math.random() * 0.2;
        return;
      }
    }
  }

  private nextEdge(c: Car) {
    const node = c.dir === 1 ? c.edge.def.to : c.edge.def.from;
    const options = POOL.filter((e) => e !== c.edge && (e.def.from === node || e.def.to === node));
    if (!options.length) {
      c.dir = c.dir === 1 ? -1 : 1;
      return;
    }
    const e = options[Math.floor(Math.random() * options.length)];
    c.edge = e;
    if (e.def.from === node) {
      c.dir = 1;
      c.along = 0.5;
    } else {
      c.dir = -1;
      c.along = e.length - 0.5;
    }
  }

  update(dt: number, focus: THREE.Vector3, player: PlayerBox | null) {
    for (const c of this.cars) {
      if (Math.hypot(c.mesh.position.x - focus.x, c.mesh.position.z - focus.z) > 950 || !c.mesh.userData.placed) {
        this.respawn(c, focus.x, focus.z);
        c.mesh.userData.placed = true;
      }
      let target = c.edge.def.speed * c.cruise;
      const remaining = c.dir === 1 ? c.edge.length - c.along : c.along;
      if (c.edge.def.kind === 'street' && remaining < 25) target = Math.min(target, 7);
      // curvature look-ahead
      const p0 = pointAlong(c.edge, c.along);
      const p1 = pointAlong(c.edge, c.along + c.dir * 30);
      const turn = Math.abs(p0.dx * p1.dz - p0.dz * p1.dx);
      if (turn > 0.25) target = Math.min(target, 11);
      // keep distance to cars ahead on the same edge/direction
      for (const o of this.cars) {
        if (o === c || o.edge !== c.edge || o.dir !== c.dir) continue;
        const gap = (o.along - c.along) * c.dir;
        if (gap > 0 && gap < 30) target = Math.min(target, Math.max(0, (gap - 9) * 0.6));
      }
      const fx = Math.sin(c.mesh.rotation.y), fz = Math.cos(c.mesh.rotation.y);
      if (player) {
        const dx = player.x - c.mesh.position.x, dz = player.z - c.mesh.position.z;
        const ahead = dx * fx + dz * fz;
        const lat = Math.abs(dx * fz - dz * fx);
        if (ahead > 0 && ahead < 32 && lat < player.hw + c.hw + 0.8) {
          target = Math.min(target, Math.max(0, (ahead - player.hl - c.hl - 3) * 0.5));
          if (ahead < player.hl + c.hl + 4 && !c.honk && c.speed < 1) {
            c.honk = true;
            this.onHonk?.(c.mesh.position.x, c.mesh.position.z);
          }
        } else c.honk = false;
      }
      if (c.stopT > 0) {
        c.stopT -= dt;
        target = 0;
      }
      const acc = target > c.speed ? 2.2 : 5.5;
      c.speed += Math.sign(target - c.speed) * Math.min(Math.abs(target - c.speed), acc * dt);
      c.along += c.speed * dt * c.dir;
      if (c.along > c.edge.length || c.along < 0) this.nextEdge(c);
      const p = pointAlong(c.edge, c.along);
      const tx = p.dx * c.dir, tz = p.dz * c.dir;
      const lane = Math.min(c.edge.def.width / 4 + 0.2, 2.6);
      const x = p.x + -tz * lane, z = p.z + tx * lane;
      const y = profileAt(c.edge, c.along) + 0.03;
      c.mesh.position.set(x, y, z);
      c.mesh.rotation.y = Math.atan2(tx, tz);
      CollisionWorld.moveBox(c.collider, x, z, c.mesh.rotation.y, y, y + 2.4);
    }
  }

  /** Called when the player bumps a car. */
  bump(collider: BoxCollider) {
    const c = this.cars.find((x) => x.collider === collider);
    if (c) {
      c.stopT = 3;
      c.speed = 0;
    }
  }
}
