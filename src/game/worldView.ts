import * as THREE from 'three';
import { NPCS } from '../data/content';
import { CAMPGROUNDS, PLACES } from '../data/map';
import { occupiedSites } from '../sim/camping';
import { dayOf, hourOf, weekdayOf } from '../sim/core';
import { localToWorld } from '../sim/geo';
import { npcStop } from '../sim/npcs';
import { hashString } from '../sim/rng';
import type { GameState } from '../sim/types';
import { EDGES } from '../world/roads';
import { buildHeights, terrainHeight } from '../world/terrain';
import { buildBuildings } from '../render/buildings';
import { CharacterModel } from '../render/character';
import { buildItemModel } from '../render/furniture';
import { genericCamper, NPC_VEHICLE_SIZE, semiTruck, vanlifeVan, vintageMotorhome } from '../render/npcVehicles';
import { buildProps, cullProps, type PropsView } from '../render/props';
import { buildRoads } from '../render/roadMesh';
import { Sky } from '../render/sky';
import { buildTerrain, type TerrainView } from '../render/terrainMesh';
import { itemDef } from '../data/items';
import { CollisionWorld, type Collider } from './collision';
import { Traffic, type PlayerBox } from './traffic';

export interface Quality {
  shadows: number;
  vegetation: number;
  traffic: number;
  fogFar: number;
}

interface NpcView {
  id: string;
  char: CharacterModel;
  vehicle: THREE.Mesh;
  chair: THREE.Object3D;
  colliders: Collider[];
  at: string;
}

interface Walker {
  model: CharacterModel;
  path: [number, number][];
  t: number;
  dir: 1 | -1;
  speed: number;
  pause: number;
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export class WorldView {
  group = new THREE.Group();
  collision = new CollisionWorld();
  sky!: Sky;
  terrain!: TerrainView;
  props!: PropsView;
  traffic!: Traffic;
  campers = new THREE.Group();
  private camperColliders: Collider[] = [];
  private npcViews: NpcView[] = [];
  private walkers: Walker[] = [];
  private lastKey = '';
  time = 0;

  async build(scene: THREE.Scene, q: Quality, progress: (label: string, f: number) => void) {
    progress('Shaping the land', 0.05);
    await nextFrame();
    buildHeights();
    progress('Painting the desert', 0.3);
    await nextFrame();
    this.terrain = buildTerrain();
    this.group.add(this.terrain.group);
    progress('Paving the roads', 0.5);
    await nextFrame();
    this.group.add(buildRoads());
    progress('Building the towns', 0.62);
    await nextFrame();
    this.group.add(buildBuildings(this.collision));
    progress('Planting trees', 0.72);
    await nextFrame();
    this.props = buildProps(this.collision, q.vegetation);
    this.group.add(this.props.group);
    progress('Inviting the neighbours', 0.9);
    await nextFrame();
    this.sky = new Sky(scene, q.shadows);
    this.sky.setFogRange(Math.min(380, q.fogFar * 0.3), q.fogFar);
    this.traffic = new Traffic(this.collision, q.traffic);
    this.group.add(this.traffic.group, this.campers);
    this.buildWalkers();
    scene.add(this.group);
    progress('Ready', 1);
  }

  private buildWalkers() {
    const looks = [
      { skin: '#e8c4a8', hair: '#3a2a1a', hairStyle: 0, shirt: '#c8553d', pants: '#3a4a6a' },
      { skin: '#8a5a3a', hair: '#1a1410', hairStyle: 1, shirt: '#e8b83c', pants: '#2a2a2a' },
      { skin: '#d8a888', hair: '#c8a060', hairStyle: 2, shirt: '#5a8a6a', pants: '#5a4a3a' },
      { skin: '#b07a58', hair: '#2a1a10', hairStyle: 3, shirt: '#3a6a9a', pants: '#4a4a4a' },
    ];
    let k = 0;
    for (const e of EDGES) {
      if (e.def.kind !== 'street' || e.length < 60 || e.def.id.startsWith('pl_cg') || e.def.id.startsWith('mc_resort')) continue;
      if (k % 2 === 1) {
        k++;
        continue;
      }
      const off = e.def.width / 2 + 1.6;
      const side = k % 4 === 0 ? 1 : -1;
      const path: [number, number][] = [];
      for (let i = 0; i < e.xs.length; i += 3) {
        const a = Math.max(0, i - 1), b = Math.min(e.xs.length - 1, i + 1);
        const tx = e.xs[b] - e.xs[a], tz = e.zs[b] - e.zs[a];
        const l = Math.hypot(tx, tz) || 1;
        path.push([e.xs[i] + (-tz / l) * off * side, e.zs[i] + (tx / l) * off * side]);
      }
      const model = new CharacterModel(looks[k % looks.length], true);
      this.group.add(model.root);
      this.walkers.push({ model, path, t: Math.random() * (path.length - 1), dir: 1, speed: 1.2 + Math.random() * 0.4, pause: 0 });
      k++;
    }
  }

  /** Refresh campers and NPC travelers when the day or reservation changes. */
  refreshPopulation(s: GameState) {
    const key = `${dayOf(s.time.minutes)}|${s.reservation?.site ?? ''}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    for (const c of [...this.campers.children]) this.campers.remove(c);
    for (const c of this.camperColliders) this.collision.removeStatic(c);
    this.camperColliders = [];
    const npcSites = new Set<string>();
    for (const id in NPCS) {
      const st = npcStop(s, id);
      if (st?.site) npcSites.add(st.site);
    }
    for (const camp of CAMPGROUNDS) {
      const occ = occupiedSites(s, camp.id);
      for (const site of camp.sites) {
        if (!occ[site.id] || npcSites.has(site.id)) continue;
        const m = genericCamper(hashString(site.id + camp.id));
        const y = terrainHeight(site.x, site.z);
        m.position.set(site.x, y + 0.05, site.z);
        m.rotation.y = site.heading;
        this.campers.add(m);
        const sz = NPC_VEHICLE_SIZE.camper;
        this.camperColliders.push(this.collision.addBox(site.x, site.z, sz.hw, sz.hl, site.heading, y, y + 3.2, 'camper'));
      }
    }
    // NPC travelers
    for (const n of this.npcViews) {
      this.group.remove(n.char.root, n.vehicle, n.chair);
      for (const c of n.colliders) this.collision.removeStatic(c);
    }
    this.npcViews = [];
    for (const id in NPCS) {
      const st = npcStop(s, id);
      if (!st) continue;
      const def = NPCS[id];
      const vehicle = def.vehicle === 'vintage' ? vintageMotorhome() : def.vehicle === 'vanlife' ? vanlifeVan() : semiTruck();
      const y = terrainHeight(st.x, st.z);
      vehicle.position.set(st.x, y + 0.05, st.z);
      vehicle.rotation.y = st.heading;
      const char = new CharacterModel(def.look, true);
      const [cx, cz] = localToWorld(-2.6, 1.0, st.x, st.z, st.heading);
      char.root.position.set(cx, terrainHeight(cx, cz), cz);
      char.root.rotation.y = st.heading - Math.PI / 2;
      const chair = buildItemModel(itemDef('camp_chair'));
      chair.position.set(cx, terrainHeight(cx, cz), cz);
      chair.rotation.y = st.heading - Math.PI / 2;
      this.group.add(vehicle, char.root, chair);
      const sz = NPC_VEHICLE_SIZE[def.vehicle];
      const colliders = [this.collision.addBox(st.x, st.z, sz.hw, sz.hl, st.heading, y, y + 3.4, 'npcvehicle')];
      this.npcViews.push({ id, char, vehicle, chair, colliders, at: st.place });
    }
  }

  npcPosition(id: string): THREE.Vector3 | null {
    const n = this.npcViews.find((x) => x.id === id);
    return n ? n.char.root.position : null;
  }

  update(dt: number, s: GameState | null, minutes: number, focus: THREE.Vector3, player: PlayerBox | null) {
    this.time += dt;
    const hour = hourOf(minutes);
    this.sky.update(hour, focus, this.time);
    cullProps(this.props, focus.x, focus.z, this.sky.fog.far + 60);
    const wu = this.terrain.water.material as THREE.ShaderMaterial;
    wu.uniforms.uTime.value = this.time;
    wu.uniforms.uSunDir.value.copy(this.sky.sunDir);
    wu.uniforms.uSunColor.value.copy(this.sky.sun.color).multiplyScalar(this.sky.daylight);
    wu.uniforms.uSky.value.copy(this.sky.uniforms.uHorizon.value);
    const night = this.sky.daylight < 0.25;
    this.props.lampMat.emissiveIntensity = night ? 2.4 : 0;
    this.props.lampPools.visible = night;
    const wd = weekdayOf(minutes);
    this.props.market.visible = wd === 5 && hour >= 7.5 && hour < 14.5;
    this.props.campfire.visible = wd === 4 && hour >= 19 && hour < 23.5;
    if (this.props.campfire.visible) {
      const flame = this.props.campfire.children[0];
      flame.scale.y = 1 + Math.sin(this.time * 9) * 0.12 + Math.sin(this.time * 23) * 0.06;
    }
    if (s) this.refreshPopulation(s);
    this.traffic.update(dt, focus, player);
    for (const n of this.npcViews) n.char.animate(dt, 0, 'sit');
    for (const w of this.walkers) this.walk(w, dt, focus);
  }

  private walk(w: Walker, dt: number, focus: THREE.Vector3) {
    const far = Math.hypot(w.model.root.position.x - focus.x, w.model.root.position.z - focus.z) > 260;
    w.model.root.visible = !far;
    if (far) return;
    if (w.pause > 0) {
      w.pause -= dt;
      w.model.animate(dt, 0, 'idle');
      return;
    }
    const i = Math.floor(w.t), f = w.t - i;
    const a = w.path[Math.max(0, Math.min(w.path.length - 1, i))];
    const b = w.path[Math.max(0, Math.min(w.path.length - 1, i + 1))];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    w.t += (w.dir * w.speed * dt) / seg;
    if (w.t >= w.path.length - 1 || w.t <= 0) {
      w.dir = w.dir === 1 ? -1 : 1;
      w.t = Math.max(0, Math.min(w.path.length - 1.001, w.t));
      w.pause = 2 + Math.random() * 4;
    }
    const x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f;
    w.model.root.position.set(x, terrainHeight(x, z), z);
    w.model.root.rotation.y = Math.atan2((b[0] - a[0]) * w.dir, (b[1] - a[1]) * w.dir);
    w.model.animate(dt, w.speed, 'walk');
  }

  placeName(x: number, z: number): string {
    for (const p of PLACES) if (Math.hypot(x - p.x, z - p.z) < p.radius) return p.name;
    return '';
  }
}
