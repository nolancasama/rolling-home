import * as THREE from 'three';
import type { VehicleDef } from '../data/types';
import type { GameState } from '../sim/types';
import { hourOf } from '../sim/core';
import { fixtureLit } from '../sim/utilities';
import { defOf, installedItems } from '../sim/vehicle';

/** Converts photometric fixture output to the stylized scene's exposure. */
export const INTERIOR_LIGHT_SCALE = 0.075;

export function kelvinColor(kelvin: number): THREE.Color {
  const t = Math.max(1000, Math.min(40000, kelvin)) / 100;
  const r = t <= 66 ? 255 : 329.6987 * Math.pow(t - 60, -.1332);
  const g = t <= 66 ? 99.4708 * Math.log(t) - 161.1196 : 288.1222 * Math.pow(t - 60, -.07551);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177 * Math.log(t - 10) - 305.0448;
  return new THREE.Color().setRGB(...[r, g, b].map(v => THREE.MathUtils.clamp(v / 255, 0, 1)) as [number, number, number], THREE.SRGBColorSpace);
}

/** All ten lights stay in the scene, including when switched off. */
export class InteriorLights {
  readonly group = new THREE.Group();
  readonly points = Array.from({ length: 8 }, () => new THREE.PointLight(0xffffff, 0, 6, 2));
  readonly spots = Array.from({ length: 2 }, () => new THREE.SpotLight(0xffffff, 0, 5, Math.PI / 8, .55, 2));
  private lenses = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>>();
  private assignments: { uid: string; pool: string; lit: boolean; intensity: number }[] = [];
  private cameraLocal = new THREE.Vector3();

  constructor(private def: VehicleDef) {
    this.group.name = 'interior-light-pool';
    this.group.add(...this.points, ...this.spots);
    for (const light of this.spots) this.group.add(light.target);
    const shadow = this.points[0];
    shadow.shadow.mapSize.set(512, 512);
    shadow.shadow.camera.near = .06;
    shadow.shadow.camera.far = 6;
    shadow.shadow.bias = -.0003;
    shadow.shadow.normalBias = .012;
  }

  setHighQuality(high: boolean) { this.points[0].castShadow = high; }

  update(s: GameState, vehicleId: string, camera: THREE.Vector3, occupied: boolean, minutes: number) {
    const v = s.vehicles.find(v => v.id === vehicleId);
    if (!v) return;
    this.group.updateWorldMatrix(true, false);
    this.cameraLocal.copy(camera);
    this.group.worldToLocal(this.cameraLocal);
    const powered = v.batteryWh > 0 || v.hookups.power || v.generatorOn;
    const entries = installedItems(s, vehicleId).filter(it => !!defOf(it).light).map(it => {
      const d = defOf(it), spec = d.light!, w = it.where;
      const pos = new THREE.Vector3();
      if (w.kind === 'floor') {
        const elevation = d.floor?.mount === 'ceiling' ? this.def.interior.ceilingY - this.def.interior.floorY - d.floor.height : w.y ?? d.floor?.elevation ?? 0;
        pos.set(w.x, this.def.interior.floorY + elevation + (d.floor?.mount === 'ceiling' ? -.025 : d.floor?.height ?? .05), w.z);
      } else pos.set(-this.def.interior.halfWidth - .1, this.def.interior.ceilingY - .2, .15);
      const lit = powered && fixtureLit(it.light, { hour: hourOf(minutes), occupied, sleeping: false, awning: v.awning, exterior: spec.kind === 'exterior' });
      const dim = spec.dimmable ? THREE.MathUtils.clamp(it.light?.dim ?? 1, .1, 1) : 1;
      const color = spec.rgb && it.light?.color ? new THREE.Color(it.light.color) : kelvinColor(it.light?.kelvin ?? spec.kelvin[0]);
      return { it, spec, pos, lit, dim, color, rank: lit ? spec.lumens * dim / (1 + pos.distanceToSquared(this.cameraLocal)) : -1 };
    });
    const ids = new Set(entries.map(e => e.it.uid));
    for (const [uid, mesh] of this.lenses) if (!ids.has(uid)) {
      this.group.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); this.lenses.delete(uid);
    }
    for (const e of entries) {
      let lens = this.lenses.get(e.it.uid);
      if (!lens) {
        const strip = e.spec.kind === 'strip' || e.spec.kind === 'accent' || e.spec.kind === 'exterior';
        const geo = strip ? new THREE.BoxGeometry(e.it.config?.length ?? .6, .012, .025) : new THREE.SphereGeometry(e.spec.kind === 'recessed' ? .035 : .07, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
        lens = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#fff4df', emissive: '#fff4df', roughness: .3, toneMapped: false }));
        lens.userData.uid = e.it.uid;
        this.lenses.set(e.it.uid, lens); this.group.add(lens);
      }
      lens.position.copy(e.pos);
      lens.rotation.y = e.it.where.kind === 'floor' ? e.it.where.rot * Math.PI / 2 : 0;
      lens.material.emissive.copy(e.color);
      lens.material.emissiveIntensity = e.lit ? 2.8 * e.dim : 0;
      lens.material.color.copy(e.color).multiplyScalar(e.lit ? 1 : .65);
    }
    const ranked = entries.filter(e => e.lit).sort((a,b) => b.rank - a.rank);
    const ceilings = ranked.filter(e => e.spec.kind === 'ceiling' || e.spec.kind === 'recessed' || e.spec.kind === 'pendant');
    const shadowEntry = ceilings.sort((a,b) => b.spec.lumens * b.dim - a.spec.lumens * a.dim)[0];
    const points = [shadowEntry, ...ranked.filter(e => e !== shadowEntry && e.spec.kind !== 'reading').flatMap(e => {
      if (e.spec.kind !== 'strip' && e.spec.kind !== 'accent') return [e];
      const length = e.it.config?.length ?? defOf(e.it).floor?.footprint[0] ?? .6;
      const count = Math.max(1, Math.ceil(length / .5));
      const rotation = e.it.where.kind === 'floor' ? e.it.where.rot * Math.PI / 2 : 0;
      return Array.from({ length: count }, (_, i) => ({
        ...e, spec: { ...e.spec, lumens: e.spec.lumens / count },
        pos: e.pos.clone().add(new THREE.Vector3((i + .5) * length / count - length / 2, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation)),
      }));
    })];
    this.points[0].shadow.autoUpdate = !!shadowEntry;
    const spots = ranked.filter(e => e.spec.kind === 'reading');
    this.assignments = entries.map(e => ({ uid: e.it.uid, pool: 'emissive', lit: e.lit, intensity: 0 }));
    for (const [pool, entries, name] of [[this.points, points, 'point'], [this.spots, spots, 'spot']] as const) {
      pool.forEach((light, i) => {
        const e = entries[i];
        light.intensity = e ? e.spec.lumens / (4 * Math.PI) * INTERIOR_LIGHT_SCALE * e.dim : 0;
        if (!e) return;
        light.position.copy(e.pos); light.color.copy(e.color);
        if (light instanceof THREE.SpotLight) {
          light.angle = (e.spec.beam ?? 45) * Math.PI / 360;
          light.target.position.copy(e.pos).add(new THREE.Vector3(0, -1, .3));
        }
        const state = this.assignments.find(a => a.uid === e.it.uid)!;
        state.pool = `${name}.${i}`; state.intensity = light.intensity;
      });
    }
  }

  get state() { return { pointCount: 8, spotCount: 2, assignments: this.assignments.map(e => ({ ...e })) }; }
  dispose() {
    for (const mesh of this.lenses.values()) { mesh.geometry.dispose(); mesh.material.dispose(); }
    this.lenses.clear();
    for (const l of [...this.points, ...this.spots]) l.dispose();
    this.group.clear();
  }
}
