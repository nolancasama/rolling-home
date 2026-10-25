import * as THREE from 'three';
import type { VehicleDef } from '../../data/types';
import { clamp } from '../../sim/geo';

// Design Mode camera: orbits, pans and zooms around a target in vehicle-local
// meters (the vehicle may sit on a slope; the view follows its body frame).

export class DesignCamera {
  target = new THREE.Vector3();
  yaw = 0;
  pitch = 1;
  dist = 8;
  private eyeLocal = new THREE.Vector3();

  constructor(private def: VehicleDef) {
    this.reset();
  }

  reset() {
    const inr = this.def.interior;
    this.target.set(0, inr.floorY, (inr.living.z0 + inr.living.z1) / 2);
    // From behind and above the door side: the whole floor plan reads at a glance.
    this.yaw = -0.45;
    this.pitch = 1.02;
    this.dist = Math.max(4.6, this.def.dims.length * 0.72);
  }

  /** Camera forward and right on the floor plane. */
  basis(): { forward: THREE.Vector3; right: THREE.Vector3 } {
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    return { forward, right: new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw)) };
  }

  orbit(dYaw: number, dPitch: number) {
    this.yaw += dYaw;
    this.pitch = clamp(this.pitch + dPitch, 0.32, 1.53);
  }

  /** Move the target across the floor plan (screen-relative). */
  pan(dx: number, dz: number) {
    const { forward, right } = this.basis();
    this.target.addScaledVector(right, dx).addScaledVector(forward, dz);
    this.clampTarget();
  }

  /** Zoom in steps; zooming in drifts toward the pointed floor spot, like a building game. */
  zoom(steps: number, toward?: THREE.Vector3) {
    const before = this.dist;
    this.dist = clamp(this.dist * Math.pow(1.12, steps), 2.2, 16);
    if (toward && this.dist < before) {
      this.target.x += (toward.x - this.target.x) * 0.16;
      this.target.z += (toward.z - this.target.z) * 0.16;
      this.clampTarget();
    }
  }

  top() {
    this.yaw = 0;
    this.pitch = 1.53;
  }

  focus(local: THREE.Vector3) {
    this.target.set(local.x, this.def.interior.floorY, local.z);
    this.dist = Math.min(this.dist, 4.5);
    this.clampTarget();
  }

  private clampTarget() {
    const inr = this.def.interior;
    this.target.x = clamp(this.target.x, inr.living.x0 - 0.5, inr.living.x1 + 0.5);
    this.target.z = clamp(this.target.z, inr.living.z0 - 0.5, inr.cab.z1 + 0.3);
    this.target.y = inr.floorY;
  }

  /** Place the scene camera from the body frame. */
  apply(camera: THREE.PerspectiveCamera, body: THREE.Object3D, focus: THREE.Vector3) {
    const cp = Math.cos(this.pitch);
    this.eyeLocal.set(
      this.target.x - Math.sin(this.yaw) * cp * this.dist,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z - Math.cos(this.yaw) * cp * this.dist,
    );
    const eye = body.localToWorld(this.eyeLocal.clone());
    const at = body.localToWorld(this.target.clone());
    camera.position.copy(eye);
    camera.lookAt(at);
    focus.copy(at);
  }
}
