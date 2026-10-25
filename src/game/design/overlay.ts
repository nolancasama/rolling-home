import * as THREE from 'three';
import type { Rect, VehicleDef } from '../../data/types';

// Design Mode helpers drawn in the vehicle body's local frame: grid, utility
// zones, the candidate footprint, other-state envelopes, the access zone,
// magnet guides and dimension lines with screen-space labels.

export type Status = 'ok' | 'warn' | 'block';

const STATUS_COLOR: Record<Status, number> = { ok: 0x3fbf76, warn: 0xe0a028, block: 0xe0503e };

export interface DimLine {
  a: THREE.Vector3;
  b: THREE.Vector3;
  label: string;
  accent?: boolean;
}

function rectLoop(r: Rect, y: number): THREE.Vector3[] {
  return [new THREE.Vector3(r.x0, y, r.z0), new THREE.Vector3(r.x1, y, r.z0), new THREE.Vector3(r.x1, y, r.z1), new THREE.Vector3(r.x0, y, r.z1)];
}

export class DesignOverlay {
  readonly group = new THREE.Group();
  private grid: THREE.LineSegments;
  private zoneMeshes: { kind: 'plumbing' | 'gas' | 'door'; mesh: THREE.Mesh }[] = [];
  private footprint: THREE.LineLoop;
  private envelopes = new THREE.Group();
  private access: THREE.Mesh;
  private guides: THREE.LineSegments;
  private dims: THREE.LineSegments;
  private highlight: THREE.LineSegments;
  private dimList: DimLine[] = [];
  private labels: HTMLElement[] = [];
  private y: number;

  constructor(private vd: VehicleDef) {
    const inr = vd.interior;
    this.y = inr.floorY + 0.014;
    this.group.name = 'design-overlay';
    const top = (o: THREE.Object3D, order: number) => { o.renderOrder = order; o.frustumCulled = false; return o; };
    // grid every 0.25 m over the living floor
    const pts: number[] = [];
    const l = inr.living;
    for (let x = Math.ceil(l.x0 / 0.25) * 0.25; x <= l.x1 + 1e-6; x += 0.25) pts.push(x, this.y, l.z0, x, this.y, l.z1);
    for (let z = Math.ceil(l.z0 / 0.25) * 0.25; z <= l.z1 + 1e-6; z += 0.25) pts.push(l.x0, this.y, z, l.x1, this.y, z);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.grid = top(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x5a4a3a, transparent: true, opacity: 0.22, depthWrite: false })), 3) as THREE.LineSegments;
    this.group.add(this.grid);
    const zone = (r: Rect, kind: 'plumbing' | 'gas' | 'door', color: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set((r.x0 + r.x1) / 2, this.y - 0.004, (r.z0 + r.z1) / 2);
      top(m, 2);
      this.group.add(m);
      this.zoneMeshes.push({ kind, mesh: m });
    };
    for (const p of inr.plumbing) zone(p, 'plumbing', 0x3a8ad0);
    for (const p of inr.gas) zone(p, 'gas', 0xd06a3a);
    zone(inr.door.zone, 'door', 0xe8902c);
    const lineMat = (color: number) => new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true });
    this.footprint = top(new THREE.LineLoop(new THREE.BufferGeometry(), lineMat(STATUS_COLOR.ok)), 10) as THREE.LineLoop;
    this.access = top(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x7ad0c4, transparent: true, opacity: 0.2, depthWrite: false, depthTest: false })), 9) as THREE.Mesh;
    this.access.rotation.x = -Math.PI / 2;
    this.guides = top(new THREE.LineSegments(new THREE.BufferGeometry(), lineMat(0x2fd0c0)), 10) as THREE.LineSegments;
    this.dims = top(new THREE.LineSegments(new THREE.BufferGeometry(), lineMat(0x1f2a33)), 11) as THREE.LineSegments;
    this.highlight = top(new THREE.LineSegments(new THREE.BufferGeometry(), lineMat(0x2fd0c0)), 12) as THREE.LineSegments;
    this.group.add(this.footprint, this.envelopes, this.access, this.guides, this.dims, this.highlight);
    this.clearCandidate();
  }

  setGrid(on: boolean) {
    this.grid.visible = on;
  }

  /** Zones show faintly; the ones a candidate needs are emphasised. */
  setZoneEmphasis(need: { plumbing?: boolean; gas?: boolean }) {
    for (const z of this.zoneMeshes) {
      const strong = (z.kind === 'plumbing' && need.plumbing) || (z.kind === 'gas' && need.gas);
      (z.mesh.material as THREE.MeshBasicMaterial).opacity = strong ? 0.34 : z.kind === 'door' ? 0.2 : 0.12;
    }
  }

  setCandidate(rect: Rect, status: Status, envelopes: Rect[], access: Rect | null) {
    this.footprint.geometry.dispose();
    this.footprint.geometry = new THREE.BufferGeometry().setFromPoints(rectLoop(rect, this.y + 0.004));
    (this.footprint.material as THREE.LineBasicMaterial).color.setHex(STATUS_COLOR[status]);
    this.footprint.visible = true;
    for (const c of [...this.envelopes.children]) {
      this.envelopes.remove(c);
      (c as THREE.Line).geometry.dispose();
    }
    for (const r of envelopes) {
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(rectLoop(r, this.y + 0.003)),
        new THREE.LineDashedMaterial({ color: 0xe0a028, dashSize: 0.06, gapSize: 0.04, depthTest: false, transparent: true }));
      line.computeLineDistances();
      line.renderOrder = 10;
      this.envelopes.add(line);
    }
    if (access) {
      this.access.visible = true;
      this.access.scale.set(access.x1 - access.x0, access.z1 - access.z0, 1);
      this.access.position.set((access.x0 + access.x1) / 2, this.y + 0.002, (access.z0 + access.z1) / 2);
    } else this.access.visible = false;
  }

  clearCandidate() {
    this.footprint.visible = false;
    this.access.visible = false;
    for (const c of [...this.envelopes.children]) {
      this.envelopes.remove(c);
      (c as THREE.Line).geometry.dispose();
    }
    this.setGuides([]);
  }

  setGuides(guides: { axis: 'x' | 'z'; at: number }[]) {
    const l = this.vd.interior.living;
    const pts: number[] = [];
    for (const g of guides) {
      if (g.axis === 'x') pts.push(g.at, this.y + 0.005, l.z0, g.at, this.y + 0.005, l.z1);
      else pts.push(l.x0, this.y + 0.005, g.at, l.x1, this.y + 0.005, g.at);
    }
    this.guides.geometry.dispose();
    this.guides.geometry = new THREE.BufferGeometry();
    this.guides.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  }

  /** Outline the selected surface (zone rects) or wall run / window (plan lines). */
  setHighlight(rects: Rect[], lines: [THREE.Vector3, THREE.Vector3][]) {
    const pts: number[] = [];
    const y = this.y + 0.006;
    for (const r of rects) {
      const loop = rectLoop(r, y);
      for (let i = 0; i < 4; i++) pts.push(...loop[i].toArray(), ...loop[(i + 1) % 4].toArray());
    }
    for (const [a, b] of lines) pts.push(a.x, y, a.z, b.x, y, b.z);
    this.highlight.geometry.dispose();
    this.highlight.geometry = new THREE.BufferGeometry();
    this.highlight.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  }

  /** Dimension lines in local meters; labels are placed each frame by updateLabels. */
  setDims(lines: DimLine[]) {
    this.dimList = lines;
    const pts: number[] = [];
    for (const d of lines) {
      pts.push(d.a.x, d.a.y, d.a.z, d.b.x, d.b.y, d.b.z);
      // small end ticks across the line on the floor plane
      const dir = new THREE.Vector3().subVectors(d.b, d.a).setY(0).normalize();
      const n = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(0.05);
      for (const p of [d.a, d.b]) pts.push(p.x - n.x, p.y, p.z - n.z, p.x + n.x, p.y, p.z + n.z);
    }
    this.dims.geometry.dispose();
    this.dims.geometry = new THREE.BufferGeometry();
    this.dims.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  }

  /** Project dimension labels to the screen (DOM layer above the canvas). */
  updateLabels(camera: THREE.Camera, body: THREE.Object3D, layer: HTMLElement | null) {
    if (!layer) return;
    while (this.labels.length < this.dimList.length) {
      const el = document.createElement('div');
      el.className = 'design-label';
      layer.appendChild(el);
      this.labels.push(el);
    }
    const w = window.innerWidth, h = window.innerHeight;
    this.labels.forEach((el, i) => {
      const d = this.dimList[i];
      if (!d) {
        el.style.display = 'none';
        return;
      }
      const p = d.a.clone().add(d.b).multiplyScalar(0.5);
      body.localToWorld(p).project(camera);
      if (p.z > 1) {
        el.style.display = 'none';
        return;
      }
      el.style.display = 'block';
      el.textContent = d.label;
      el.classList.toggle('accent', !!d.accent);
      el.style.left = `${((p.x + 1) / 2) * w}px`;
      el.style.top = `${((1 - p.y) / 2) * h}px`;
    });
  }

  dispose() {
    for (const el of this.labels) el.remove();
    this.labels = [];
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose?.();
    });
    this.group.removeFromParent();
  }
}
