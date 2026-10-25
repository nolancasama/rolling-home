import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** High-only HDR bloom; ordinary painted surfaces stay below the threshold. */
export class InteriorPost {
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  private cpuMs = 0;
  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1920, 1080), .14, .35, 1.8);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }
  resize(w: number, h: number, pixelRatio: number) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
  }
  render() {
    const start = performance.now();
    this.composer.render();
    this.cpuMs += (performance.now() - start - this.cpuMs) * .05;
  }
  get metrics() { return { cpuSubmitMs: this.cpuMs, bloom: this.bloom.enabled, ao: false }; }
}
