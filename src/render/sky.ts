import * as THREE from 'three';

// Gradient sky dome with sun glow and stars, plus the sun/hemisphere lights
// and fog, all driven by the game clock.

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // keep the dome at the far plane
}`;

const frag = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uStars;
uniform float uTime;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, h));
  col = mix(col, uGround, smoothstep(0.02, -0.25, h));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 900.0) * 6.0 + pow(sd, 60.0) * 0.35 + pow(sd, 6.0) * 0.12);
  if (uStars > 0.01 && h > 0.0) {
    vec3 g = floor(d * 260.0);
    float s = hash(g);
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 40.0);
    col += vec3(step(0.9965, s) * tw * uStars * smoothstep(0.0, 0.25, h));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

interface Key {
  h: number;
  zenith: string;
  horizon: string;
  sun: string;
  sunI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  stars: number;
}

const KEYS: Key[] = [
  { h: 0, zenith: '#0b1530', horizon: '#1d2a4a', sun: '#8aa0d8', sunI: 0.12, hemiSky: '#3a4a78', hemiGround: '#1a1a22', hemiI: 0.42, stars: 1 },
  { h: 4.8, zenith: '#101a38', horizon: '#2a3150', sun: '#8aa0d8', sunI: 0.1, hemiSky: '#3a4a78', hemiGround: '#1a1a22', hemiI: 0.4, stars: 0.9 },
  { h: 6.0, zenith: '#3a5a92', horizon: '#f0a070', sun: '#ffb070', sunI: 0.9, hemiSky: '#a8b8d8', hemiGround: '#6a5040', hemiI: 0.62, stars: 0.1 },
  { h: 7.5, zenith: '#5a92d0', horizon: '#f2d0a8', sun: '#ffe0b0', sunI: 2.0, hemiSky: '#c8daf0', hemiGround: '#8a6a4a', hemiI: 0.85, stars: 0 },
  { h: 12, zenith: '#4f8fd8', horizon: '#cfe2f2', sun: '#fff4e0', sunI: 2.6, hemiSky: '#d8e8f8', hemiGround: '#9a7a58', hemiI: 0.95, stars: 0 },
  { h: 16.5, zenith: '#5a90d0', horizon: '#f0dcc0', sun: '#ffe6c0', sunI: 2.3, hemiSky: '#d0dcf0', hemiGround: '#9a7050', hemiI: 0.9, stars: 0 },
  { h: 18.6, zenith: '#4a5aa0', horizon: '#f49060', sun: '#ff9a50', sunI: 1.3, hemiSky: '#b8a8c8', hemiGround: '#6a4a3a', hemiI: 0.7, stars: 0.05 },
  { h: 19.8, zenith: '#26305e', horizon: '#9a5a6a', sun: '#c07a90', sunI: 0.35, hemiSky: '#5a5a88', hemiGround: '#2a2228', hemiI: 0.5, stars: 0.5 },
  { h: 21, zenith: '#0e1834', horizon: '#26304e', sun: '#8aa0d8', sunI: 0.14, hemiSky: '#3a4a78', hemiGround: '#1a1a22', hemiI: 0.42, stars: 1 },
  { h: 24, zenith: '#0b1530', horizon: '#1d2a4a', sun: '#8aa0d8', sunI: 0.12, hemiSky: '#3a4a78', hemiGround: '#1a1a22', hemiI: 0.42, stars: 1 },
];

const ca = new THREE.Color(), cb = new THREE.Color();
function lerpColor(a: string, b: string, t: number, out: THREE.Color): THREE.Color {
  ca.set(a);
  cb.set(b);
  return out.copy(ca).lerp(cb, t);
}

export class Sky {
  dome: THREE.Mesh;
  sun = new THREE.DirectionalLight(0xffffff, 2);
  hemi = new THREE.HemisphereLight(0xffffff, 0x886644, 0.9);
  fog: THREE.Fog;
  uniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGround: { value: new THREE.Color('#6a5a4a') },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uStars: { value: 0 },
    uTime: { value: 0 },
  };
  sunDir = new THREE.Vector3();
  /** 0 at night .. 1 at full day. */
  daylight = 1;
  private shadowSize = 70;

  constructor(scene: THREE.Scene, shadowMapSize: number) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), mat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);
    this.fog = new THREE.Fog(0xcfe2f2, 380, 1500);
    scene.fog = this.fog;
    scene.add(this.hemi);
    this.sun.castShadow = shadowMapSize > 0;
    if (shadowMapSize > 0) {
      this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
      this.setShadowSize(this.shadowSize);
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.04;
      this.sun.shadow.camera.near = 1;
      this.sun.shadow.camera.far = 600;
    }
    scene.add(this.sun);
    scene.add(this.sun.target);
  }

  setShadowSize(size: number) {
    this.shadowSize = size;
    const c = this.sun.shadow.camera;
    c.left = -size;
    c.right = size;
    c.top = size;
    c.bottom = -size;
    c.updateProjectionMatrix();
  }

  setFogRange(near: number, far: number) {
    this.fog.near = near;
    this.fog.far = far;
  }

  /** hour 0..24; focus = point the shadow camera follows. */
  update(hour: number, focus: THREE.Vector3, realTime: number) {
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].h <= hour) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = THREE.MathUtils.clamp((hour - a.h) / (b.h - a.h), 0, 1);
    const u = this.uniforms;
    lerpColor(a.zenith, b.zenith, t, u.uZenith.value);
    lerpColor(a.horizon, b.horizon, t, u.uHorizon.value);
    lerpColor(a.sun, b.sun, t, u.uSunColor.value);
    u.uStars.value = THREE.MathUtils.lerp(a.stars, b.stars, t);
    u.uTime.value = realTime;
    // Sun path: rises in the east (+X), passes south (+Z), sets in the west.
    const dayT = (hour - 6) / 12.5;
    let el: number, az: number;
    if (dayT >= 0 && dayT <= 1) {
      el = Math.sin(Math.PI * dayT) * THREE.MathUtils.degToRad(64);
      az = Math.PI * dayT;
      this.daylight = THREE.MathUtils.clamp(Math.sin(Math.PI * dayT) * 3, 0, 1);
    } else {
      // moon
      const nt = ((hour + 24 - 18.5) % 24) / 11.5;
      el = Math.sin(Math.PI * THREE.MathUtils.clamp(nt, 0, 1)) * THREE.MathUtils.degToRad(40) + 0.05;
      az = Math.PI * nt;
      this.daylight = 0;
    }
    this.sunDir.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
    u.uSunDir.value.copy(this.sunDir);
    const sunI = THREE.MathUtils.lerp(a.sunI, b.sunI, t);
    this.sun.intensity = sunI * (this.sunDir.y > 0.02 ? 1 : 0.4);
    lerpColor(a.sun, b.sun, t, this.sun.color);
    lerpColor(a.hemiSky, b.hemiSky, t, this.hemi.color);
    lerpColor(a.hemiGround, b.hemiGround, t, this.hemi.groundColor);
    this.hemi.intensity = THREE.MathUtils.lerp(a.hemiI, b.hemiI, t);
    this.fog.color.copy(u.uHorizon.value).lerp(u.uZenith.value, 0.15);
    // Shadow camera follows the focus, snapped to texels to avoid shimmering.
    const snap = (this.shadowSize * 2) / Math.max(1, this.sun.shadow.mapSize.x);
    const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + this.sunDir.x * 250, focus.y + Math.max(0.15, this.sunDir.y) * 250, fz + this.sunDir.z * 250);
    this.dome.position.copy(focus);
  }
}
