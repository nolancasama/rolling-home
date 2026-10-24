import * as THREE from 'three';
import type { Look } from '../sim/types';

// Low-poly stylized person with procedural animation.

export type Pose = 'idle' | 'walk' | 'run' | 'sit' | 'carry';

function mat(color: string, rough = 0.85) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough });
}

export class CharacterModel {
  root = new THREE.Group();
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private hair = new THREE.Group();
  private mats: Record<'skin' | 'hair' | 'shirt' | 'pants' | 'shoes', THREE.MeshStandardMaterial>;
  private phase = 0;
  carryObject: THREE.Object3D | null = null;
  private carrySlot = new THREE.Group();

  constructor(look: Look, private simple = false) {
    this.mats = {
      skin: mat(look.skin, 0.7), hair: mat(look.hair, 0.9), shirt: mat(look.shirt), pants: mat(look.pants), shoes: mat('#2a2622'),
    };
    this.build();
    this.setLook(look);
  }

  private build() {
    const { skin, shirt, pants, shoes } = this.mats;
    const r = this.root;
    r.add(this.hips);
    this.hips.position.y = 0.92;
    // legs
    for (const [g, x] of [[this.legL, 0.1], [this.legR, -0.1]] as [THREE.Group, number][]) {
      g.position.set(x, 0, 0);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.84, 8), pants);
      leg.position.y = -0.42;
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.22), shoes);
      shoe.position.set(0, -0.86, 0.04);
      g.add(leg, shoe);
      this.hips.add(g);
    }
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.2), pants);
    pelvis.position.y = 0.02;
    this.hips.add(pelvis);
    // torso
    this.torso.position.y = 0.08;
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.52, 10), shirt);
    chest.scale.set(1, 1, 0.62);
    chest.position.y = 0.27;
    this.torso.add(chest);
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), shirt);
    shoulders.scale.set(1.05, 0.35, 0.64);
    shoulders.position.y = 0.52;
    this.torso.add(shoulders);
    this.hips.add(this.torso);
    // arms
    for (const [g, x] of [[this.armL, 0.235], [this.armR, -0.235]] as [THREE.Group, number][]) {
      g.position.set(x, 0.5, 0);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.34, 8), shirt);
      upper.position.y = -0.17;
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.3, 8), skin);
      fore.position.y = -0.47;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skin);
      hand.position.y = -0.64;
      g.add(upper, fore, hand);
      this.torso.add(g);
    }
    // head
    this.head.position.y = 0.6;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8), skin);
    neck.position.y = 0.02;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.125, 14, 10), skin);
    skull.scale.set(1, 1.1, 1.02);
    skull.position.y = 0.17;
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), skin);
    nose.position.set(0, 0.16, 0.125);
    const eyeMat = mat('#1e1e22', 0.4);
    for (const x of [-0.045, 0.045]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), eyeMat);
      eye.position.set(x, 0.2, 0.112);
      this.head.add(eye);
    }
    this.head.add(neck, skull, nose, this.hair);
    this.torso.add(this.head);
    this.carrySlot.position.set(0, 0.25, 0.32);
    this.torso.add(this.carrySlot);
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = !this.simple;
      }
    });
  }

  setLook(look: Look) {
    this.mats.skin.color.set(look.skin);
    this.mats.hair.color.set(look.hair);
    this.mats.shirt.color.set(look.shirt);
    this.mats.pants.color.set(look.pants);
    for (const c of [...this.hair.children]) this.hair.remove(c);
    const hm = this.mats.hair;
    const add = (g: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(g, hm);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.castShadow = true;
      this.hair.add(m);
    };
    const cap = new THREE.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
    switch (look.hairStyle % 4) {
      case 0: // short
        add(cap, 0, 0.19, -0.005, 1, 1.05, 1.04);
        break;
      case 1: // curly
        add(cap, 0, 0.19, 0, 1.08, 1.1, 1.08);
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          add(new THREE.SphereGeometry(0.05, 6, 5), Math.cos(a) * 0.11, 0.27 + Math.sin(i) * 0.02, Math.sin(a) * 0.1 - 0.01);
        }
        break;
      case 2: // long / bun
        add(cap, 0, 0.19, -0.01, 1.04, 1.1, 1.06);
        add(new THREE.SphereGeometry(0.075, 8, 6), 0, 0.22, -0.14);
        add(new THREE.BoxGeometry(0.24, 0.2, 0.06), 0, 0.08, -0.1);
        break;
      default: {
        // baseball cap
        const capM = new THREE.Mesh(new THREE.SphereGeometry(0.138, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(look.shirt));
        capM.position.y = 0.2;
        this.hair.add(capM);
        const brim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.015, 0.12), mat(look.shirt));
        brim.position.set(0, 0.2, 0.15);
        this.hair.add(brim);
        add(cap, 0, 0.16, -0.02, 1.02, 0.8, 1.04);
      }
    }
  }

  setCarry(obj: THREE.Object3D | null) {
    if (this.carryObject) this.carrySlot.remove(this.carryObject);
    this.carryObject = obj;
    if (obj) this.carrySlot.add(obj);
  }

  animate(dt: number, speed: number, pose: Pose) {
    const moving = pose === 'walk' || pose === 'run';
    const freq = pose === 'run' ? 9.5 : 6.2;
    if (moving) this.phase += dt * freq * Math.min(1.4, Math.max(0.4, speed / (pose === 'run' ? 4.5 : 1.6)));
    else this.phase *= Math.pow(0.02, dt);
    const sw = moving ? Math.sin(this.phase) * (pose === 'run' ? 0.85 : 0.5) : 0;
    const lerp = (a: number, b: number) => a + (b - a) * Math.min(1, dt * 12);
    if (pose === 'sit') {
      this.hips.position.y = lerp(this.hips.position.y, 0.5);
      this.legL.rotation.x = lerp(this.legL.rotation.x, -1.45);
      this.legR.rotation.x = lerp(this.legR.rotation.x, -1.45);
      this.armL.rotation.x = lerp(this.armL.rotation.x, -0.4);
      this.armR.rotation.x = lerp(this.armR.rotation.x, -0.4);
      this.torso.rotation.x = lerp(this.torso.rotation.x, -0.08);
      return;
    }
    const bob = moving ? Math.abs(Math.cos(this.phase)) * (pose === 'run' ? 0.06 : 0.03) : Math.sin(performance.now() / 900) * 0.006;
    this.hips.position.y = lerp(this.hips.position.y, 0.92 + bob);
    this.legL.rotation.x = sw;
    this.legR.rotation.x = -sw;
    this.torso.rotation.x = lerp(this.torso.rotation.x, pose === 'run' ? 0.12 : 0.02);
    if (pose === 'carry' || this.carryObject) {
      this.armL.rotation.x = lerp(this.armL.rotation.x, -1.15);
      this.armR.rotation.x = lerp(this.armR.rotation.x, -1.15);
      this.armL.rotation.z = lerp(this.armL.rotation.z, -0.15);
      this.armR.rotation.z = lerp(this.armR.rotation.z, 0.15);
    } else {
      this.armL.rotation.x = -sw * 0.9;
      this.armR.rotation.x = sw * 0.9;
      this.armL.rotation.z = lerp(this.armL.rotation.z, 0.06);
      this.armR.rotation.z = lerp(this.armR.rotation.z, -0.06);
    }
  }
}
