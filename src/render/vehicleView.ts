import * as THREE from 'three';
import { VEHICLES } from '../data/vehicles';
import type { VehicleDef } from '../data/types';
import type { GameState, ItemInstance } from '../sim/types';
import { defOf, itemsInVehicle, mattressOn } from '../sim/vehicle';
import { buildAwning, buildItemModel } from './furniture';
import { buildBody, buildInterior, makeWheel, type BodyParts, type InteriorParts } from './vehicleBody';

const BLANKETS = ['#3f8f8a', '#c8673e', '#5a6a9a', '#8a5a7a'];
const PACKED = new Set(['furniture', 'appliance', 'system', 'mattress', 'outdoor', 'tool', 'part']);

export class VehicleView {
  def: VehicleDef;
  root = new THREE.Group();
  body = new THREE.Group();
  exterior = new THREE.Group();
  parts: BodyParts;
  interior: InteriorParts;
  furniture = new THREE.Group();
  cargo = new THREE.Group();
  roofCargo = new THREE.Group();
  extras = new THREE.Group();
  wheels: THREE.Group[] = [];
  steerPivots: THREE.Group[] = [];
  awning: { group: THREE.Group; canopy: THREE.Group } | null = null;
  headlights: THREE.SpotLight | null = null;
  doorT = 0;
  doorTarget = 0;
  private sig = '';
  private wheelSpin = 0;
  cutaway = false;
  /** Meshes of installed items by uid (for furnishing picking/highlight). */
  itemMeshes = new Map<string, THREE.Object3D>();

  constructor(public vehicleId: string, defId: VehicleDef['id'], withHeadlights = true) {
    this.def = VEHICLES[defId];
    this.parts = buildBody(this.def);
    this.interior = buildInterior(this.def);
    this.exterior.add(this.parts.group);
    this.body.add(this.exterior, this.interior.group, this.furniture, this.cargo, this.roofCargo, this.extras);
    this.root.add(this.body);
    for (let i = 0; i < 4; i++) {
      const pos = this.parts.wheelPos[i];
      const pivot = new THREE.Group();
      pivot.position.copy(pos);
      const dual = this.parts.dual && i >= 2;
      const w = makeWheel(this.def, dual);
      pivot.add(w);
      this.root.add(pivot);
      this.wheels.push(w);
      this.steerPivots.push(pivot);
    }
    if (withHeadlights) {
      const s = new THREE.SpotLight(0xfff0d0, 0, 60, 0.6, 0.5, 1.2);
      s.position.set(0, 1.1, this.def.dims.length / 2);
      s.target.position.set(0, 0, this.def.dims.length / 2 + 20);
      this.body.add(s, s.target);
      this.headlights = s;
    }
    this.root.name = `vehicle-${vehicleId}`;
  }

  setPose(x: number, y: number, z: number, heading: number, pitch = 0, roll = 0) {
    this.root.position.set(x, y, z);
    this.root.rotation.set(0, heading, 0);
    this.body.rotation.set(pitch, 0, roll, 'YXZ');
  }

  setCutaway(on: boolean) {
    this.cutaway = on;
    this.exterior.visible = !on;
    for (const o of this.interior.upper) o.visible = !on;
    for (const w of this.wheels) w.visible = !on;
    this.extras.visible = !on;
    this.roofCargo.visible = !on;
  }

  /** Rebuild furniture/cargo/extras when the layout or loads change. */
  sync(s: GameState, force = false) {
    const items = itemsInVehicle(s, this.vehicleId);
    const sig = items
      .map((i) => {
        const w = i.where;
        if (w.kind === 'floor') return `${i.uid}:f:${w.x.toFixed(2)}:${w.z.toFixed(2)}:${w.rot}:${i.condition < 0.45 ? 1 : 0}`;
        if (w.kind === 'slot') return `${i.uid}:s:${w.slot}`;
        if (w.kind === 'mattress') return `${i.uid}:m:${w.bed}`;
        if (w.kind === 'stored' && (w.comp === 'floor' || w.comp === 'roof' || i.cargo || w.comp === 'cabover')) return `${i.uid}:c:${w.comp}`;
        return '';
      })
      .filter(Boolean)
      .join('|');
    const v = s.vehicles.find((x) => x.id === this.vehicleId);
    const awn = v ? `${v.awning}` : '';
    if (!force && sig + awn === this.sig) return;
    this.sig = sig + awn;
    this.rebuild(s, items);
  }

  private rebuild(s: GameState, items: ItemInstance[]) {
    for (const g of [this.furniture, this.cargo, this.roofCargo, this.extras]) {
      for (const c of [...g.children]) g.remove(c);
    }
    this.itemMeshes.clear();
    const floorY = this.def.interior.floorY;
    let bi = 0;
    for (const it of items) {
      const w = it.where;
      if (w.kind !== 'floor') continue;
      const d = defOf(it);
      const mat = d.features?.bed?.usesMattress ? mattressOn(s, it.uid) : null;
      const model = buildItemModel(d, { mattress: mat ? defOf(mat) : null, condition: it.condition, blanket: BLANKETS[bi++ % BLANKETS.length] });
      model.position.set(w.x, floorY, w.z);
      model.rotation.y = (w.rot * Math.PI) / 2;
      model.userData.uid = it.uid;
      this.furniture.add(model);
      this.itemMeshes.set(it.uid, model);
    }
    // cargo + loose items in fixed compartments
    const byComp = new Map<string, ItemInstance[]>();
    for (const it of items) {
      const w = it.where;
      if (w.kind !== 'stored') continue;
      const comp = this.def.compartments.find((c) => c.id === w.comp);
      if (!comp) continue;
      if (!it.cargo && comp.id !== 'floor' && comp.id !== 'roof' && comp.id !== 'cabover') continue;
      let l = byComp.get(comp.id);
      if (!l) byComp.set(comp.id, (l = []));
      l.push(it);
    }
    for (const [compId, list] of byComp) {
      const comp = this.def.compartments.find((c) => c.id === compId)!;
      const bx = comp.box;
      // simple shelf packing inside the compartment box
      let x = -bx.w / 2, z = -bx.l / 2, y = 0, rowD = 0, layerH = 0;
      const sorted = [...list].sort((a, b) => volume(b) - volume(a));
      for (const it of sorted) {
        const dims = it.cargo ? it.cargo.dims : defOf(it).dims;
        let [L, W, H] = dims;
        if (L > bx.l && W <= bx.l) [L, W] = [W, L];
        if (x + W > bx.w / 2 + 0.01) {
          x = -bx.w / 2;
          z += rowD + 0.02;
          rowD = 0;
        }
        if (z + L > bx.l / 2 + 0.05) {
          z = -bx.l / 2;
          x = -bx.w / 2;
          y += layerH + 0.01;
          layerH = 0;
          rowD = 0;
        }
        const d = defOf(it);
        // furniture and gear travel packed: show a box with the packed size
        const packed = !it.cargo && PACKED.has(d.category);
        const model = it.cargo ? buildItemModel({ ...d, model: 'crate' }, { dims: [L, W, H] }) : buildItemModel(packed ? { ...d, model: 'box' } : d);
        model.position.set(bx.x + x + W / 2, bx.y + y, bx.z + z + L / 2);
        if (!it.cargo && it.secured === false && compId === 'floor') model.rotation.y = 0.2;
        (comp.high ? this.roofCargo : this.cargo).add(model);
        x += W + 0.02;
        rowD = Math.max(rowD, L);
        layerH = Math.max(layerH, H);
      }
    }
    // exterior system items
    const roofTop = this.def.id === 'van' ? 2.66 : 3.3;
    const solar = items.filter((i) => i.where.kind === 'slot' && defOf(i).features?.solar);
    let sz = this.def.id === 'van' ? -2.4 : -3.2;
    for (const p of solar) {
      const m = buildItemModel(defOf(p));
      const L = defOf(p).dims[0];
      m.position.set(this.def.id === 'van' ? 0 : 0.3, roofTop + 0.04, sz + L / 2);
      this.extras.add(m);
      sz += L + 0.08;
    }
    const fans = items.filter((i) => i.where.kind === 'slot' && defOf(i).features?.fan);
    fans.forEach((f, k) => {
      const m = buildItemModel(defOf(f));
      m.position.set(-0.4, roofTop, 0.3 - k * 0.6);
      this.extras.add(m);
    });
    // awning
    const hasAwning = items.some((i) => i.where.kind === 'slot' && defOf(i).features?.awning);
    if (hasAwning) {
      if (!this.awning) this.awning = buildAwning(3.2, '#d86a3a');
      this.awning.group.position.copy(this.parts.awningMount);
      this.extras.add(this.awning.group);
      const v = s.vehicles.find((x) => x.id === this.vehicleId);
      this.awning.canopy.visible = !!v?.awning;
    }
  }

  update(dt: number, speed: number, steer: number, lightsOn: boolean, braking: boolean, interiorLight: number, cabFill = 0) {
    this.interior.cabFill.intensity = cabFill;
    this.wheelSpin += (speed * dt) / this.def.dims.wheelRadius;
    for (const w of this.wheels) w.rotation.x = this.wheelSpin;
    this.steerPivots[0].rotation.y = steer;
    this.steerPivots[1].rotation.y = steer;
    // door animation
    this.doorT += Math.sign(this.doorTarget - this.doorT) * Math.min(Math.abs(this.doorTarget - this.doorT), dt * 2.2);
    this.parts.doorOpen(this.doorT);
    this.parts.headlightMat.emissiveIntensity = lightsOn ? 2.2 : 0;
    this.parts.tailMat.emissiveIntensity = braking ? 2.5 : lightsOn ? 0.9 : 0.15;
    if (this.headlights) this.headlights.intensity = lightsOn ? 40 : 0;
    this.interior.light.intensity = interiorLight;
    this.interior.lampMat.emissiveIntensity = interiorLight > 0.1 ? 1.2 : 0.15;
    const wheel = this.interior.group.getObjectByName('steering');
    if (wheel) wheel.rotation.z = -steer * 6;
  }

  setAppearance(dirt: number, body: number) {
    const base = new THREE.Color(this.def.paint.body);
    const dirtCol = new THREE.Color('#9a8060');
    this.parts.paint.color.copy(base).lerp(dirtCol, dirt * 0.45);
    this.parts.paint.roughness = 0.45 + dirt * 0.45 + (1 - body) * 0.1;
    this.parts.rust.visible = body < 0.62;
    (this.parts.rust.material as THREE.MeshStandardMaterial).opacity = Math.min(0.8, 0.25 + (0.62 - body) * 1.6);
  }

  dispose() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}

function volume(it: ItemInstance): number {
  const d = it.cargo ? it.cargo.dims : defOf(it).dims;
  return d[0] * d[1] * d[2];
}
