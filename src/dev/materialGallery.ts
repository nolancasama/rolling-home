import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MATERIAL_LIST } from '../data/materials';
import { configureMaterialAnisotropy, finishMaterial, interiorAmbient, interiorBounce, releaseFinishMaterial } from '../render/materials';

// A standalone Vite entry: this module is never imported by the game or its production entry.
const style = document.createElement('style');
style.textContent = `
  *{box-sizing:border-box}body{margin:0;background:#e7e4dd;color:#343a3d;font:18px "Segoe UI",sans-serif;overflow:hidden}
  canvas{display:block;position:absolute;inset:0;width:100%;height:100%}
  header{position:absolute;top:28px;left:4%;right:4%;display:flex;align-items:center;justify-content:space-between;z-index:2}
  h1{font-size:26px;font-weight:600;margin:0;letter-spacing:.02em}header p{margin:6px 0;font-size:15px;color:#727675}
  nav{display:flex;gap:16px;align-items:center;font-size:16px}button{border:1px solid #acb1ac;padding:9px 18px;border-radius:5px;background:#f4f2ed;cursor:pointer;color:inherit}
  #labels{position:absolute;inset:0;pointer-events:none}.label{position:absolute;width:22%;text-align:center;transform:translate(-50%,0)}
  .label strong{display:block;font-weight:600;font-size:19px;margin-bottom:6px}.label span{font-size:14px;color:#6e7471}.label small{display:block;font-size:13px;color:#8a8e88;margin-top:4px}
  footer{position:absolute;bottom:22px;left:4%;font-size:14px;color:#727675}
`;
document.head.append(style);
const header = document.createElement('header');
header.innerHTML = '<div><h1>ROLLING HOME / MATERIAL STUDIO</h1><p>Procedural PBR · neutral studio · one meter sample tiles</p></div><nav><button id="previous">← Previous</button><span id="page"></span><button id="next">Next →</button></nav>';
document.body.append(header);
const labels = document.createElement('div'); labels.id = 'labels'; document.body.append(labels);
const footer = document.createElement('footer');
footer.textContent = 'Sphere Ø 1.15 m  /  tile 1 × 1 m  ·  generated albedo, normal and roughness  ·  no external assets';
document.body.append(footer);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
configureMaterialAnisotropy(renderer.capabilities.getMaxAnisotropy());
const scene = new THREE.Scene(); scene.background = new THREE.Color('#e7e4dd');
const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
const environment = pmrem.fromScene(room, .05); scene.environment = environment.texture;
room.dispose(); pmrem.dispose();
const camera = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, .1, 50);
camera.position.set(0, 0, 15); camera.lookAt(0, 0, 0);
// Roughly the in-game daytime interior: attenuated sky, room bounce and one soft key light, so swatches
// show the colors players will see (the earlier, brighter studio washed every material out).
interiorAmbient.value = .75;
interiorBounce.value.setScalar(.5);
const hemi = new THREE.HemisphereLight(0xffffff, 0xc1b8a4, .8); scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-5, 7, 9); scene.add(key);
const fill = new THREE.DirectionalLight(0xe7f0ff, .4); fill.position.set(7, 2, 5); scene.add(fill);
const group = new THREE.Group(); scene.add(group);
const sphereGeometry = new THREE.SphereGeometry(.575, 56, 36);
// Sphere UVs represent circumference and arc length in meters.
const uv = sphereGeometry.getAttribute('uv');
for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 1.15, uv.getY(i) * Math.PI * .575);
const tileGeometry = new THREE.BoxGeometry(1, 1, .035);
const pageSize = 8, pageCount = Math.ceil(MATERIAL_LIST.length / pageSize);
const materials: THREE.Material[] = [];
let currentPage = 0, pageToken = 0;
const api = {
  ready: false,
  pageCount,
  currentPage,
  materials: MATERIAL_LIST.map(def => ({ id: def.id, name: def.name, kind: def.surfaces[0] })),
  page(index: number): void { renderPage(index); },
};
(window as Window & { __gallery?: typeof api }).__gallery = api;

function renderPage(index: number): void {
  api.ready = false;
  const token = ++pageToken;
  currentPage = Math.max(0, Math.min(pageCount - 1, Math.floor(index)));
  api.currentPage = currentPage;
  group.clear(); labels.replaceChildren();
  for (const material of materials) releaseFinishMaterial(material);
  materials.length = 0;
  document.querySelector('#page')!.textContent = `${currentPage + 1} / ${pageCount}`;
  const visible = MATERIAL_LIST.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  visible.forEach((def, i) => {
    const col = i % 4, row = Math.floor(i / 4), x = -6 + col * 4, y = row === 0 ? 1.65 : -1.75;
    const material = finishMaterial({ mat: def.id }, def.surfaces[0], { interior: false }); materials.push(material);
    const sphere = new THREE.Mesh(sphereGeometry, material); sphere.position.set(x - .68, y + .2, .15); sphere.rotation.y = -.35;
    const tile = new THREE.Mesh(tileGeometry, material); tile.position.set(x + .72, y + .2, .05); tile.rotation.set(.04, -.12, 0);
    group.add(sphere, tile);
    const label = document.createElement('div'); label.className = 'label';
    label.style.left = `${12.5 + col * 25}%`; label.style.top = `${row === 0 ? 42 : 80}%`;
    const title = document.createElement('strong'); title.textContent = def.name;
    const detail = document.createElement('span'); detail.textContent = `${def.group} · ${def.pattern}${def.motif ? ` / ${def.motif}` : ''}`;
    const id = document.createElement('small'); id.textContent = def.id;
    label.append(title, detail, id); labels.append(label);
  });
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  // Readiness is semantic: compilation plus two submitted frames, rather than a timer.
  requestAnimationFrame(() => {
    renderer.render(scene, camera);
    requestAnimationFrame(() => { if (token === pageToken) { renderer.render(scene, camera); api.ready = true; } });
  });
}
document.querySelector('#previous')!.addEventListener('click', () => renderPage((currentPage + pageCount - 1) % pageCount));
document.querySelector('#next')!.addEventListener('click', () => renderPage((currentPage + 1) % pageCount));
window.addEventListener('keydown', event => {
  if (event.key === 'ArrowRight') renderPage((currentPage + 1) % pageCount);
  if (event.key === 'ArrowLeft') renderPage((currentPage + pageCount - 1) % pageCount);
});
window.addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  const width = 9 * innerWidth / innerHeight;
  camera.left = -width / 2; camera.right = width / 2; camera.updateProjectionMatrix(); renderer.render(scene, camera);
});
renderPage(0);
