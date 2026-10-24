import * as THREE from 'three';
import { terrainHeight } from '../world/terrain';

// Floating guidance markers (job points, docks, reserved site, destination).

export interface MarkerSpec {
  x: number;
  z: number;
  color: number;
  big?: boolean;
}

export class Markers {
  group = new THREE.Group();
  private pool: THREE.Group[] = [];
  private t = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  private make(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, transparent: true, opacity: 0.9 });
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), mat);
    gem.scale.y = 1.6;
    gem.position.y = 2.4;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    g.add(gem, ring);
    this.group.add(g);
    return g;
  }

  set(list: MarkerSpec[]) {
    while (this.pool.length < list.length) this.pool.push(this.make());
    this.pool.forEach((m, i) => {
      const spec = list[i];
      m.visible = !!spec;
      if (!spec) return;
      m.position.set(spec.x, terrainHeight(spec.x, spec.z), spec.z);
      m.scale.setScalar(spec.big ? 2.2 : 1);
      const gem = m.children[0] as THREE.Mesh, ring = m.children[1] as THREE.Mesh;
      (gem.material as THREE.MeshStandardMaterial).color.setHex(spec.color);
      (gem.material as THREE.MeshStandardMaterial).emissive.setHex(spec.color);
      (ring.material as THREE.MeshBasicMaterial).color.setHex(spec.color);
    });
  }

  update(dt: number) {
    this.t += dt;
    for (const m of this.pool) {
      if (!m.visible) continue;
      const gem = m.children[0];
      gem.position.y = 2.4 + Math.sin(this.t * 2) * 0.25;
      gem.rotation.y += dt * 1.5;
    }
  }
}
