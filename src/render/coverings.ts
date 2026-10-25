import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Finish, VehicleDef, WindowDef, WindowTreatment } from '../data/types';
import type { ItemInstance, VehicleState } from '../sim/types';
import { itemDef } from '../data/items';
import { resolveDef } from '../sim/families';
import { closedTransmission } from '../sim/finishes';
import { finishMaterial, releaseFinishMaterial } from './materials';

type CutawayLevel = false | 'up' | 'cut' | 'down';
type FabricMaterial = THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
interface Cloth {
  mesh: THREE.Mesh<THREE.PlaneGeometry, FabricMaterial>;
  nx: number;
  ny: number;
}
interface WindowView {
  window: WindowDef;
  group: THREE.Group;
  treatment: WindowTreatment;
  signature: string;
  open: number;
  target: number;
  bottom: number;
  width: number;
  top: number;
  depth: number;
  cloth: Cloth[];
  rails: THREE.Mesh[];
  rings: THREE.Mesh[];
  materials: FabricMaterial[];
  posedOpen?: number;
  posedLayer?: string;
}
const bareWindow: WindowTreatment = {
  type: 'none', fabric: { mat: 'win_linen' }, hardware: 'white', mount: 'inside', open: 1,
};
const clamp01 = (n: number) => THREE.MathUtils.clamp(n, 0, 1);
const hardwareFinish: Record<WindowTreatment['hardware'], Finish> = {
  white: { mat: 'paint_satin', color: '#eeeae2' }, black: { mat: 'metal_black' },
  brass: { mat: 'metal_brass' }, chrome: { mat: 'metal_chrome' }, wood: { mat: 'factory_trim_oak' },
};

/** Window-local X runs across the opening; +Z always points into the room. */
export class Coverings {
  readonly group = new THREE.Group();
  private readonly views = new Map<string, WindowView>();
  private readonly plane: THREE.Plane;
  private readonly ownsPlane: boolean;
  private readonly localPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e5);
  private readonly cabGlassArea: number;

  constructor(private readonly def: VehicleDef, clippingPlane?: THREE.Plane) {
    this.group.name = 'window-coverings';
    this.plane = clippingPlane ?? this.localPlane.clone();
    this.ownsPlane = !clippingPlane;
    // Windshield and the two cab door panes are protected shell glazing, rather than WindowDefs.
    const cabWidth = Math.min(def.interior.halfWidth * 2, 1.9);
    this.cabGlassArea = cabWidth * .62 + 2 * .48 * .52;
  }

  sync(vehicle: VehicleState, items: readonly ItemInstance[] = []): void {
    for (const window of this.def.interior.windows) {
      const treatment = vehicle.custom.windows[window.id] ?? window.factory ?? bareWindow;
      const bottom = this.curtainBottom(window, treatment, vehicle.id, items);
      // Openness and day/night selection only deform existing geometry: neither rebuilds materials.
      const { open: _open, layer: _layer, ...appearance } = treatment;
      const signature = JSON.stringify([appearance, bottom]);
      let view = this.views.get(window.id);
      if (!view || view.signature !== signature) {
        const previousOpen = view?.open ?? clamp01(treatment.open);
        if (view) this.destroyView(view);
        view = this.buildWindow(window, treatment, signature, bottom, previousOpen);
        this.views.set(window.id, view);
      }
      view.treatment = treatment;
      view.target = clamp01(treatment.open);
    }
  }

  update(dt: number): void {
    if (this.ownsPlane) {
      this.group.updateWorldMatrix(true, false);
      this.plane.copy(this.localPlane).applyMatrix4(this.group.matrixWorld);
    }
    for (const view of this.views.values()) {
      const step = Math.max(0, dt) / .6;
      view.open += Math.sign(view.target - view.open) * Math.min(Math.abs(view.target - view.open), step);
      this.pose(view);
    }
  }

  /** A supplied shell plane is updated by InteriorShell, so both sets of geometry clip identically. */
  setCutaway(level: CutawayLevel): void {
    if (!this.ownsPlane) return;
    this.localPlane.constant = level === 'cut' ? this.def.interior.floorY + 1
      : level === 'down' ? this.def.interior.floorY + .12 : 1e5;
  }

  get ambientFactor(): number {
    let total = this.cabGlassArea, transmitted = this.cabGlassArea;
    for (const view of this.views.values()) {
      const w = view.window;
      const area = (w.a1 - w.a0) * (w.y1 - w.y0);
      total += area;
      transmitted += area * (view.open + (1 - view.open) * closedTransmission(view.treatment));
    }
    return .2 + .65 * transmitted / total;
  }

  /** JSON-only semantic state for screenshot harnesses to wait on a completed animation. */
  get animationState(): ReadonlyArray<Readonly<{ id: string; type: string; open: number; target: number; settled: boolean; layer: string }>> {
    return [...this.views.values()].map(v => ({
      id: v.window.id, type: v.treatment.type, open: v.open, target: v.target,
      settled: Math.abs(v.open - v.target) < .001, layer: v.treatment.layer ?? 'day',
    }));
  }

  dispose(): void {
    for (const view of this.views.values()) this.destroyView(view);
    this.views.clear();
  }

  private curtainBottom(w: WindowDef, treatment: WindowTreatment, vehicleId: string, items: readonly ItemInstance[]): number {
    if (treatment.length !== 'long' || !['curtains', 'sheer'].includes(treatment.type)) return w.y0 - (treatment.mount === 'outside' ? .04 : .005);
    let bottom = this.def.interior.floorY + .035;
    for (const item of items) {
      const p = item.where;
      if (p.kind !== 'floor' || p.vehicle !== vehicleId) continue;
      const floor = resolveDef(itemDef(item.def), item).floor;
      if (!floor || floor.flat || floor.mount === 'ceiling') continue;
      const [fw, fd] = floor.footprint;
      const hx = (p.rot % 2 ? fd : fw) / 2, hz = (p.rot % 2 ? fw : fd) / 2;
      const top = this.def.interior.floorY + (p.y ?? floor.elevation ?? 0) + floor.height;
      // Only furniture below the opening limits the hem (uppers don't pull it to the ceiling).
      if (top > w.y0 + .1) continue;
      const overlaps = w.side === 'left' || w.side === 'right'
        ? p.z + hz > w.a0 - .05 && p.z - hz < w.a1 + .05
          && (w.side === 'left' ? p.x + hx > this.def.interior.halfWidth - .22 : p.x - hx < -this.def.interior.halfWidth + .22)
        : p.x + hx > w.a0 - .05 && p.x - hx < w.a1 + .05
          && (w.side === 'rear' ? p.z - hz < this.def.interior.living.z0 + .22 : p.z + hz > this.def.interior.living.z1 - .22);
      if (overlaps) bottom = Math.max(bottom, top + .03);
    }
    return Math.min(w.y0 + .1, bottom);
  }

  private buildWindow(window: WindowDef, treatment: WindowTreatment, signature: string, bottom: number, open: number): WindowView {
    const group = new THREE.Group();
    group.name = `covering:${window.id}`;
    group.userData.window = window.id;
    const centre = (window.a0 + window.a1) / 2, hw = this.def.interior.halfWidth;
    if (window.side === 'left') { group.position.set(hw, 0, centre); group.rotation.y = -Math.PI / 2; }
    else if (window.side === 'right') { group.position.set(-hw, 0, centre); group.rotation.y = Math.PI / 2; }
    else if (window.side === 'rear') group.position.set(centre, 0, this.def.interior.living.z0);
    else { group.position.set(centre, 0, this.def.interior.living.z1); group.rotation.y = Math.PI; }
    const outside = treatment.mount === 'outside';
    // The frame lip overlaps the cloth edges, preventing bright slits around a closed shade.
    const width = window.a1 - window.a0 + (outside ? .1 : -.016);
    const top = Math.min(this.def.interior.ceilingY - .065, window.y1 + (outside ? .055 : -.045));
    const depth = outside ? .075 : .03;
    const view: WindowView = { window, group, treatment, signature, bottom, width, top, depth, open, target: open, cloth: [], rails: [], rings: [], materials: [] };
    this.group.add(group);

    // Invisible glazing target remains pickable even for a bare window.
    const pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false, side: THREE.DoubleSide, clippingPlanes: [this.plane] });
    const pick = new THREE.Mesh(new THREE.PlaneGeometry(window.a1 - window.a0, window.y1 - window.y0), pickMat);
    pick.position.set(0, (window.y0 + window.y1) / 2, .008);
    pick.userData.window = window.id;
    group.add(pick);
    if (treatment.type === 'none' && !treatment.valance) return view;

    const acquire = (finish: Finish, translucent = false): FabricMaterial => {
      const material = finishMaterial(finish, 'window', { clippingPlanes: [this.plane], side: THREE.DoubleSide,
        transparent: translucent, opacity: translucent ? (treatment.type === 'sheer' ? .37 : .7) : 1,
        depthWrite: !translucent });
      view.materials.push(material);
      return material;
    };
    const hardware = acquire(hardwareFinish[treatment.hardware]);
    const sheer = treatment.type === 'sheer' || treatment.type === 'solar_roller';
    const fabric = acquire(treatment.fabric, sheer || treatment.type === 'day_night');
    const darkFabric = treatment.type === 'day_night' ? acquire(treatment.fabric2 ?? { mat: 'win_pleat_blackout' }) : fabric;
    const hardwareGeometry: THREE.BufferGeometry[] = [];
    const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      hardwareGeometry.push(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z));
    };
    const cloth = (mat: FabricMaterial, nx: number, ny: number, shadows = !sheer): Cloth => {
      const geometry = new THREE.PlaneGeometry(1, 1, nx, ny);
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.userData.window = window.id;
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      group.add(mesh);
      const result = { mesh, nx, ny };
      view.cloth.push(result);
      return result;
    };
    const rail = () => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, .025, .026), hardware);
      mesh.userData.window = window.id;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      view.rails.push(mesh);
    };
    if (treatment.type === 'curtains' || treatment.type === 'sheer') {
      const rod = new THREE.CylinderGeometry(.011, .011, width + (outside ? .1 : -.04), 10).rotateZ(Math.PI / 2).translate(0, top + .025, depth);
      hardwareGeometry.push(rod);
      const finialX = width / 2 + (outside ? .06 : -.02);
      for (const x of [-finialX, finialX]) {
        hardwareGeometry.push(new THREE.SphereGeometry(.022, 10, 8).translate(x, top + .025, depth));
        box(x * .89, top + .025, depth / 2, .024, .035, depth);
      }
      cloth(fabric, 48, 8); cloth(fabric, 48, 8);
      // Two merged ring sets move with the gathering panels and connect their top hems to the rod.
      for (let panel = 0; panel < 2; panel++) {
        const loops: THREE.BufferGeometry[] = [];
        for (let i = 0; i <= 8; i++) loops.push(new THREE.TorusGeometry(.023, .002, 5, 10).rotateY(Math.PI / 2).translate(i / 8, 0, 0));
        const merged = mergeGeometries(loops);
        loops.forEach(g => g.dispose());
        if (merged) {
          const rings = new THREE.Mesh(merged, hardware);
          rings.castShadow = true; rings.userData.window = window.id;
          group.add(rings); view.rings.push(rings);
        }
      }
    } else if (treatment.type !== 'none') {
      box(0, top + .015, depth, width + .025, .055, .06);
      if (treatment.type === 'privacy_screen') {
        cloth(fabric, 2, 2);
        for (const x of [-width / 2 + .025, width / 2 - .025]) for (const y of [bottom + .025, top - .025])
          hardwareGeometry.push(new THREE.SphereGeometry(.009, 8, 6).translate(x, y, depth + .005));
      } else if (treatment.type === 'day_night') {
        cloth(fabric, 2, 48, false); cloth(darkFabric, 2, 48, true); rail(); rail();
      } else {
        cloth(fabric, treatment.type === 'roman' ? 24 : 2, treatment.type === 'roman' ? 48 : treatment.type === 'insulated' ? 60 : 48);
        rail();
      }
      // Brackets land against the wall; end caps are included in the cassette.
      for (const x of [-width / 2, width / 2]) box(x, top + .015, depth / 2, .026, .05, depth);
    }
    if (hardwareGeometry.length) {
      const merged = mergeGeometries(hardwareGeometry);
      hardwareGeometry.forEach(g => g.dispose());
      if (merged) {
        const mesh = new THREE.Mesh(merged, hardware);
        mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.window = window.id;
        group.add(mesh);
      }
    }
    if (treatment.valance) {
      const valanceMat = acquire(treatment.valance);
      const valance = new THREE.Mesh(new THREE.BoxGeometry(width + .055, .155, .035, 24, 3, 1), valanceMat);
      // A shallow scalloped padded face, mounted to the same rail rather than floating in front.
      const positions = valance.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        if (positions.getY(i) < 0) positions.setY(i, positions.getY(i) + .012 * Math.cos(x * Math.PI * 8 / width));
      }
      valance.geometry.computeVertexNormals();
      const uv = valance.geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * width, uv.getY(i) * .155);
      valance.position.set(0, top - .045, depth + .035);
      valance.castShadow = true; valance.receiveShadow = true; valance.userData.window = window.id;
      group.add(valance);
    }
    this.pose(view);
    return view;
  }

  private deform(cloth: Cloth, left: number, top: number, width: number, height: number, depth: number,
    mode: 'flat' | 'curtain' | 'pleat' | 'roman' | 'cell', fabricWidth = width, fabricHeight = height): void {
    const pos = cloth.mesh.geometry.getAttribute('position');
    const uv = cloth.mesh.geometry.getAttribute('uv');
    for (let row = 0; row <= cloth.ny; row++) for (let col = 0; col <= cloth.nx; col++) {
      const i = row * (cloth.nx + 1) + col, u = col / cloth.nx, v = row / cloth.ny;
      const fold = mode === 'curtain' ? Math.sin(u * Math.PI * 16) * .014
        : mode === 'pleat' || mode === 'cell' ? (row % 2 ? .013 : -.013)
        : mode === 'roman' ? Math.pow(Math.sin(v * Math.PI * 6), 2) * .032 : 0;
      pos.setXYZ(i, left + u * width, top - v * height, depth + fold);
      uv.setXY(i, u * fabricWidth, (1 - v) * fabricHeight);
    }
    pos.needsUpdate = true; uv.needsUpdate = true;
    cloth.mesh.geometry.computeVertexNormals();
  }

  private pose(v: WindowView): void {
    const type = v.treatment.type;
    if (type === 'none') return;
    if (v.posedOpen === v.open && v.posedLayer === v.treatment.layer) return;
    v.posedOpen = v.open;
    v.posedLayer = v.treatment.layer;
    const height = Math.max(.04, v.top - v.bottom), closed = 1 - v.open;
    if (type === 'curtains' || type === 'sheer') {
      const panel = v.width * (.5 * closed + .105 * v.open);
      this.deform(v.cloth[0], -v.width / 2, v.top, panel, height, v.depth, 'curtain', v.width * .65, height);
      this.deform(v.cloth[1], v.width / 2 - panel, v.top, panel, height, v.depth, 'curtain', v.width * .65, height);
      for (let i = 0; i < v.rings.length; i++) {
        v.rings[i].position.set(i === 0 ? -v.width / 2 : v.width / 2 - panel, v.top + .025, v.depth);
        v.rings[i].scale.x = panel;
      }
      return;
    }
    if (type === 'privacy_screen') {
      // A snap-in screen is removed into its frame rather than rolled on a cassette.
      v.cloth[0].mesh.visible = v.open < .999;
      this.deform(v.cloth[0], -v.width / 2, v.top, v.width, height * closed, v.depth, 'flat', v.width, height * closed);
      return;
    }
    const drop = .035 + (height - .035) * closed;
    if (type === 'day_night') {
      const night = v.treatment.layer === 'night';
      const firstHeight = night ? .025 : Math.max(.025, drop - .025);
      const secondHeight = night ? Math.max(.025, drop - .025) : .025;
      this.deform(v.cloth[0], -v.width / 2, v.top, v.width, firstHeight, v.depth, 'pleat');
      this.deform(v.cloth[1], -v.width / 2, v.top - firstHeight, v.width, secondHeight, v.depth, 'pleat');
      v.rails[0].position.set(0, v.top - firstHeight, v.depth + .005);
      v.rails[1].position.set(0, v.top - firstHeight - secondHeight, v.depth + .005);
    } else {
      const mode = type === 'pleated' ? 'pleat' : type === 'roman' ? 'roman' : type === 'insulated' ? 'cell' : 'flat';
      this.deform(v.cloth[0], -v.width / 2, v.top, v.width, drop, v.depth, mode);
      v.rails[0].position.set(0, v.top - drop, v.depth + .005);
    }
  }

  private destroyView(view: WindowView): void {
    view.group.removeFromParent();
    view.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      if (object.material instanceof THREE.MeshBasicMaterial) object.material.dispose();
    });
    view.materials.forEach(releaseFinishMaterial);
  }
}
