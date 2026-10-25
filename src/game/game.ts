import * as THREE from 'three';
import { TIME } from '../data/config';
import { itemDef } from '../data/items';
import { buildItemModel } from '../render/furniture';
import { terrainHeight } from '../world/terrain';
import { VEHICLES } from '../data/vehicles';
import { AudioEngine } from '../audio/audio';
import { localToWorld } from '../sim/geo';
import { newGame, type NewGameOptions } from '../sim/newgame';
import { Sim } from '../sim/sim';
import type { PlayerMode } from '../sim/types';
import { activeVehicle, vdef } from '../sim/vehicle';
import { performance as vehiclePerformance } from '../sim/maintenance';
import { computeWeight } from '../sim/weight';
import type { Route } from '../world/roads';
import { CharacterModel } from '../render/character';
import { Markers, type MarkerSpec } from '../render/markers';
import { VehicleView } from '../render/vehicleView';
import { DOCKS, ODD_JOBS } from '../data/content';
import { ANCHOR_BY_ID, CAMPGROUND_BY_ID } from '../data/map';
import { inReservedSite } from '../sim/camping';
import { oddPoints } from '../sim/jobs';
import { UI } from '../ui/ui';
import { ScreenHub } from '../ui/screens';
import { Hud } from '../ui/hud';
import { CollisionWorld, type BoxCollider } from './collision';
import { DriveMode } from './drive';
import { ExploreMode } from './explore';
import { DesignMode } from './design/designMode';
import { Input } from './input';
import { InteriorMode } from './interior';
import { loadSettings, qualityParams, readSlot, saveSettings, writeSlot, type Settings, type SlotId } from './settings';
import { VehiclePhysics } from './vehiclePhysics';
import { WorldView } from './worldView';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { configureMaterialAnisotropy, setInteriorEnvironment } from '../render/materials';
import { InteriorPost } from '../render/interiorPost';

export type ModeId = 'menu' | PlayerMode | 'design';

export interface Mode {
  enter(from: ModeId): void;
  exit(to: ModeId): void;
  update(dt: number): void;
  /** Game seconds per real second. */
  timeScale(): number;
}

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  input: Input;
  ui: UI;
  hud: Hud;
  screens: ScreenHub;
  audio: AudioEngine;
  settings: Settings;
  world = new WorldView();
  sim: Sim | null = null;
  vv: VehicleView | null = null;
  phys: VehiclePhysics | null = null;
  vehCollider: BoxCollider = CollisionWorld.makeBox(0, 0, 1, 1, 0, -1000, -999, 'player-vehicle');
  char: CharacterModel;
  mode: ModeId = 'menu';
  modes: Record<Exclude<ModeId, 'menu'>, Mode>;
  explore: ExploreMode;
  interior: InteriorMode;
  drive: DriveMode;
  design: DesignMode;
  route: Route | null = null;
  routeDest: string | null = null;
  focus = new THREE.Vector3();
  private pendingMinutes = 0;
  private advanceTimer = 0;
  private autosaveTimer = 0;
  private last = performance.now();
  private menuT = 0;
  private menuVehicle: VehicleView | null = null;
  hudHidden = false;
  fps = 60;
  /** Rendering only: never advances the save clock or consumes utilities. */
  previewMinutes: number | null = null;
  /** Tone-mapping exposure the eye adaptation is easing toward (brighter with the camera indoors). */
  targetExposure = 1.05;
  post: InteriorPost | null = null;
  private fpsAcc = 0;
  private fpsN = 0;
  /** Seconds of real time spent driving each road edge (exploration). */
  edgeDriven: Record<string, number> = {};
  started = false;

  constructor(canvas: HTMLCanvasElement) {
    this.settings = loadSettings();
    const qp = qualityParams(this.settings.quality);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: qp.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qp.pixelRatio));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = qp.shadows > 0;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.localClippingEnabled = true;
    configureMaterialAnisotropy(this.renderer.capabilities.getMaxAnisotropy());
    // Soft bounce light for RV interiors (interior materials only; created before any vehicle view).
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    setInteriorEnvironment(pmrem.fromScene(new RoomEnvironment(), 0.04).texture);
    pmrem.dispose();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.06, 4200);
    if (this.settings.quality === 'high') this.post = new InteriorPost(this.renderer, this.scene, this.camera);
    this.input = new Input(canvas);
    this.ui = new UI();
    this.audio = new AudioEngine(this.settings);
    this.char = new CharacterModel({ skin: '#e0b090', hair: '#3a2a1a', hairStyle: 0, shirt: '#3a7a9a', pants: '#2a2a3a' });
    this.explore = new ExploreMode(this);
    this.interior = new InteriorMode(this);
    this.drive = new DriveMode(this);
    this.design = new DesignMode(this);
    this.modes = { explore: this.explore, interior: this.interior, drive: this.drive, design: this.design };
    this.hud = new Hud(this);
    this.screens = new ScreenHub(this);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  async init() {
    const qp = qualityParams(this.settings.quality);
    this.ui.loading('Getting ready', 0);
    await this.world.build(this.scene, qp, (label, f) => this.ui.loading(label, f));
    this.scene.add(this.char.root);
    this.char.root.visible = false;
    this.markers = new Markers(this.scene);
    this.world.traffic.onHonk = (x, z) => this.audio.honk(x, z);
    this.setupMenuScene();
    this.ui.loading(null);
    this.screens.mainMenu();
    requestAnimationFrame(() => this.loop());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post?.resize(w, h, this.renderer.getPixelRatio());
  }

  applySettings() {
    saveSettings(this.settings);
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
    this.audio.setVolumes(this.settings);
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ menu backdrop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private menuChair: THREE.Object3D | null = null;

  private setupMenuScene() {
    // Free dispersed camping at Red Rock Flats at golden hour.
    this.menuVehicle = new VehicleView('menu', 'van', false);
    const phys = new VehiclePhysics(VEHICLES.van);
    phys.place(-1381, 502, 0.35);
    this.menuVehicle.setPose(phys.x, phys.y, phys.z, phys.heading, phys.pitch, phys.roll);
    this.menuVehicle.setAppearance(0.2, 0.55);
    this.scene.add(this.menuVehicle.root);
    if (!this.menuChair) {
      this.menuChair = buildItemModel(itemDef('camp_chair'));
      const [cx, cz] = localToWorld(-2.6, 0.8, phys.x, phys.z, phys.heading);
      this.menuChair.position.set(cx, terrainHeight(cx, cz), cz);
      this.menuChair.rotation.y = phys.heading - Math.PI / 2 - 0.4;
    }
    this.scene.add(this.menuChair);
  }

  private updateMenu(dt: number) {
    this.menuT += dt;
    const mv = this.menuVehicle;
    if (!mv) return;
    const p = mv.root.position;
    const a = this.menuT * 0.045 + 3.6;
    const cx = p.x + Math.cos(a) * 12, cz = p.z + Math.sin(a) * 12;
    const cy = Math.max(p.y + 2.6 + Math.sin(this.menuT * 0.2) * 0.3, terrainHeight(cx, cz) + 1.6);
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(p.x, p.y + 1.5, p.z);
    this.focus.copy(p);
    this.world.update(dt, null, 17.7 * 60, this.focus, null);
    mv.update(dt, 0, 0, false, false);
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ game lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  startNew(opts: NewGameOptions) {
    this.attach(new Sim(newGame(opts)));
    this.sim!.journal(`${opts.name || 'You'} set out in a ${VEHICLES[opts.vehicle].shortName.toLowerCase()} with ${this.sim!.s.cash.toFixed(0)} dollars.`);
    this.save('auto');
  }

  loadJSON(json: string): string | null {
    const r = Sim.fromJSON(json);
    if (!r.ok) return r.reason;
    this.attach(r.sim);
    return null;
  }

  loadSlot(slot: SlotId): string | null {
    const raw = readSlot(slot);
    if (!raw) return 'That save slot is empty.';
    return this.loadJSON(raw);
  }

  private attach(sim: Sim) {
    this.sim?.dispose();
    this.sim = sim;
    this.started = true;
    this.edgeDriven = {};
    this.route = null;
    this.routeDest = null;
    sim.onChange(() => this.ui.invalidate());
    sim.onNote((n) => {
      this.ui.toast(n);
      if (n.kind === 'money') this.audio.cash();
      else if (n.kind === 'discovery') this.audio.chime();
      else if (n.kind === 'bad') this.audio.error();
    });
    if (this.menuVehicle) {
      this.scene.remove(this.menuVehicle.root);
      this.menuVehicle.dispose();
      this.menuVehicle = null;
    }
    if (this.menuChair) this.scene.remove(this.menuChair);
    this.char.setLook(sim.s.player.look);
    this.rebuildVehicle();
    this.ui.closeAll();
    this.audio.start();
    const mode = sim.s.player.mode;
    this.mode = 'menu';
    this.setMode(mode === 'drive' ? 'interior' : mode);
  }

  /** (Re)create the active vehicle's view + physics from the sim state. */
  rebuildVehicle() {
    const s = this.sim!.s;
    const v = activeVehicle(s);
    if (this.vv) {
      this.scene.remove(this.vv.root);
      this.vv.dispose();
    }
    this.vv = new VehicleView(v.id, v.def);
    this.scene.add(this.vv.root);
    this.phys = new VehiclePhysics(vdef(v));
    this.phys.place(v.pose.x, v.pose.z, v.pose.heading);
    this.vv.sync(s, true);
    this.vv.setAppearance(v.dirt, v.body);
    const d = vdef(v).dims;
    this.vehCollider = CollisionWorld.makeBox(v.pose.x, v.pose.z, d.width / 2, d.length / 2, v.pose.heading, this.phys.y + 0.2, this.phys.y + d.height, 'player-vehicle');
    this.world.collision.dynamic = this.world.collision.dynamic.filter((c) => c.tag !== 'player-vehicle');
    this.world.collision.dynamic.push(this.vehCollider);
    this.updateVehicleView(0);
  }

  updateVehicleView(dt: number) {
    if (!this.vv || !this.phys || !this.sim) return;
    const p = this.phys;
    this.vv.setPose(p.x, p.y, p.z, p.heading, p.visPitch || p.pitch, p.visRoll || p.roll);
    const d = this.phys.def.dims;
    CollisionWorld.moveBox(this.vehCollider, p.x, p.z, p.heading, p.y + 0.2, p.y + d.height);
    // While designing, the vehicle shows the draft (nothing is real until it is confirmed).
    const s = this.mode === 'design' && this.design.draft ? this.design.draft.s : this.sim.s;
    const night = this.world.sky.daylight < 0.35;
    const lights = this.mode === 'drive' ? this.drive.lightsOn(night) : false;
    const inside = this.mode === 'interior' || this.mode === 'design';
    const day = this.world.sky.daylight;
    const cockpit = this.mode === 'drive' && this.drive.cam === 'cockpit';
    const fill = cockpit ? 0.5 + 2.2 * day : this.mode === 'interior' ? .65 * day : 0;
    this.vv.update(dt, this.mode === 'drive' ? p.speed : 0, p.steerAngle, lights, this.mode === 'drive' && this.drive.braking, fill);
    this.vv.updateInterior(dt, s, this.camera.position, inside, this.previewMinutes ?? this.sim.s.time.minutes, this.settings.quality === 'high', this.world.sky.daylight);
  }

  setMode(m: ModeId, opts: { quiet?: boolean } = {}) {
    const prev = this.mode;
    if (prev !== 'menu') this.modes[prev].exit(m);
    this.mode = m;
    if (m !== 'menu') {
      this.modes[m].enter(prev);
      if (this.sim && m !== 'design') this.sim.setMode(m);
    }
    this.input.endFrame();
    void opts;
  }

  toMenu() {
    this.ui.closeAll();
    if (this.mode !== 'menu') this.modes[this.mode].exit('menu');
    this.mode = 'menu';
    this.sim?.dispose();
    this.sim = null;
    this.started = false;
    if (this.vv) {
      this.scene.remove(this.vv.root);
      this.vv.dispose();
      this.vv = null;
    }
    this.char.root.visible = false;
    this.world.collision.dynamic = this.world.collision.dynamic.filter((c) => c.tag !== 'player-vehicle');
    this.setupMenuScene();
    this.audio.stopEngine();
    this.input.releaseLock();
    this.screens.mainMenu();
  }

  save(slot: SlotId): boolean {
    if (!this.sim) return false;
    this.writePoseToState();
    const ok = writeSlot(slot, this.sim.serialize(new Date().toISOString()));
    if (slot !== 'auto') this.ui.toast({ text: ok ? 'Game saved.' : 'Could not save (storage unavailable or full).', kind: ok ? 'good' : 'bad' });
    return ok;
  }

  /** Copy controller positions into the sim state (before save/sim queries). */
  writePoseToState() {
    if (!this.sim || !this.phys) return;
    const s = this.sim.s;
    const v = activeVehicle(s);
    v.pose = { x: this.phys.x, z: this.phys.z, heading: this.phys.heading };
    if (this.mode === 'explore') this.explore.writeState();
    if (this.mode === 'interior') this.interior.writeState();
  }

  /** Time is frozen while menus, the phone (except while driving) or Design Mode are open. */
  timeFrozen(): boolean {
    if (!this.sim || this.mode === 'menu' || this.mode === 'design') return true;
    return this.ui.pausing;
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ assisted travel & sleep transitions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async assistedTravel(destNode: string, label: string) {
    if (!this.sim) return;
    this.writePoseToState();
    const card = document.createElement('div');
    card.className = 'fade-card';
    card.innerHTML = '';
    const big = document.createElement('div');
    big.className = 'big';
    big.textContent = `On the road to ${label}`;
    const small = document.createElement('div');
    small.className = 'small';
    small.textContent = 'Time, fuel, wear and your needs all keep counting.';
    const track = document.createElement('div');
    track.className = 'travel-track';
    track.appendChild(document.createElement('div'));
    card.append(big, small, track);
    let err: string | null = null;
    await this.ui.fade(async () => {
      await new Promise((r) => setTimeout(r, 1800));
      const r = this.sim!.assistedTravel(destNode);
      if (!r.ok) err = r.reason;
      else {
        const v = activeVehicle(this.sim!.s);
        this.phys!.place(v.pose.x, v.pose.z, v.pose.heading);
        this.route = null;
        this.routeDest = null;
        this.updateVehicleView(0);
        this.sim!.discover(v.pose.x, v.pose.z);
        if (this.mode === 'drive') this.drive.snapCamera();
      }
    }, 450, card);
    if (err) this.ui.toast({ text: err, kind: 'bad' });
    else this.save('auto');
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private loop() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc > 1) {
      this.fps = this.fpsN / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
    try {
      this.frame(dt);
    } catch (e) {
      console.error(e);
    }
    requestAnimationFrame(() => this.loop());
  }

  private frame(dt: number) {
    this.input.blocked = this.ui.blocking;
    if (this.mode === 'menu' || !this.sim) {
      this.updateMenu(dt);
      this.ui.frame();
      this.renderer.render(this.scene, this.camera);
      this.input.endFrame();
      return;
    }
    // global keys
    if (this.input.rawPressed('Escape')) this.screens.escape();
    else if (this.input.rawPressed('Tab') && this.mode !== 'design') this.screens.togglePhone();
    else if (this.input.wasPressed('H')) this.hudHidden = !this.hudHidden;
    else if (this.input.wasPressed('M') && this.mode !== 'design') this.screens.openPhone('map');
    const mode = this.modes[this.mode];
    mode.update(dt);
    // time
    if (!this.timeFrozen()) {
      this.pendingMinutes += (dt * mode.timeScale()) / 60;
      this.advanceTimer += dt;
      if (this.advanceTimer > 0.2 || this.pendingMinutes > 2) {
        const act = this.mode === 'explore' ? this.explore.activity() : this.mode === 'drive' ? 'drive' : 'idle';
        this.sim.advance(this.pendingMinutes, this.sim.ctxFor(act));
        this.pendingMinutes = 0;
        this.advanceTimer = 0;
        this.ui.invalidate();
      }
    }
    // vehicle physics perf refresh (cheap enough a few times a second)
    if (this.phys && this.mode === 'drive' && (!this.phys.perf || Math.random() < 0.1)) {
      const s = this.sim.s;
      const v = activeVehicle(s);
      this.phys.perf = vehiclePerformance(s, v.id);
      this.phys.mass = computeWeight(s, v.id).total;
    }
    this.updateVehicleView(dt);
    const pl = this.phys ? { x: this.phys.x, z: this.phys.z, heading: this.phys.heading, hw: this.phys.def.dims.width / 2, hl: this.phys.def.dims.length / 2 } : null;
    this.world.update(dt, this.sim.s, this.previewMinutes ?? this.sim.s.time.minutes, this.focus, pl);
    this.updateMarkers(dt);
    this.audio.update(dt, this);
    this.hud.update(dt);
    this.ui.frame();
    // Adapt from the actual camera position, including the cockpit and future walk previews.
    const localEye = this.vv?.body.worldToLocal(this.camera.position.clone());
    const inr = this.vv?.def.interior;
    const indoors = !!localEye && !!inr && Math.abs(localEye.x) < inr.halfWidth && localEye.z > inr.living.z0 && localEye.z < inr.cab.z1 && localEye.y > inr.cabFloorY && localEye.y < inr.ceilingY;
    this.targetExposure = 1.05 * (indoors ? 1.2 : 1);
    this.renderer.toneMappingExposure += (this.targetExposure - this.renderer.toneMappingExposure) * (1 - Math.exp(-dt / .8));
    if (this.settings.quality === 'high' && this.post) this.post.render();
    else this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
    this.autosaveTimer += dt;
    if (this.autosaveTimer > 300) {
      this.autosaveTimer = 0;
      if (!this.ui.blocking) this.save('auto');
    }
  }

  interiorFromOutside() {
    if (this.vv) this.vv.doorTarget = 1;
    this.setMode('interior');
  }

  driveFromOutside() {
    this.audio.door();
    this.setMode('drive');
  }

  /** Show a marker on a reserved campsite (and route there with GPS). */
  markSite(x: number, z: number) {
    this.siteMarker = { x, z };
  }

  siteMarker: { x: number; z: number } | null = null;
  private markerT = 0;

  updateMarkers(dt: number) {
    if (!this.markers || !this.sim) return;
    this.markers.update(dt);
    this.markerT -= dt;
    if (this.markerT > 0) return;
    this.markerT = 0.3;
    const s = this.sim.s;
    const list: MarkerSpec[] = [];
    for (const j of s.jobs.active) {
      if (j.offer.kind === 'odd') {
        const od = ODD_JOBS[j.offer.odd];
        const pts = oddPoints(j);
        if (od.mechanic === 'visit') {
          const done = new Set(((s.flags[`odd:${j.offer.id}`] as string | undefined) ?? '').split(',').filter(Boolean).map(Number));
          pts.forEach(([x, z], i) => { if (!done.has(i)) list.push({ x, z, color: 0xffc040 }); });
        } else if (s.player.carrying?.kind === 'job' && s.player.carrying.jobId === j.offer.id && od.drop) list.push({ x: od.drop[0], z: od.drop[1], color: 0x40d080 });
        else {
          const [x, z] = pts[Math.min(j.progress, pts.length - 1)];
          list.push({ x, z, color: 0xffc040 });
        }
      } else {
        const dockId = j.status === 'loaded' ? j.offer.dropoff : j.offer.pickup;
        const a = ANCHOR_BY_ID[DOCKS[dockId].anchor];
        list.push({ x: a.x, z: a.z, color: j.status === 'loaded' ? 0x40d080 : 0x4aa8ff, big: true });
      }
    }
    const r = s.reservation;
    if (r) {
      const site = CAMPGROUND_BY_ID[r.camp].sites.find((x) => x.id === r.site);
      if (site && !inReservedSite(s)) list.push({ x: site.x, z: site.z, color: 0xff7a4a, big: true });
    }
    if (this.route) {
      const [x, z] = this.route.points[this.route.points.length - 1];
      list.push({ x, z, color: 0x30b0e0, big: true });
    }
    this.markers.set(list);
  }

  markers: Markers | null = null;

  /** World-space door point of the RV (outside). */
  vehicleDoorOutside(): THREE.Vector3 {
    const def = this.phys!.def;
    const o = def.interior.door.outside;
    const [x, z] = localToWorld(o.x, o.z, this.phys!.x, this.phys!.z, this.phys!.heading);
    return new THREE.Vector3(x, this.phys!.y, z);
  }

  driverDoorOutside(): THREE.Vector3 {
    const def = this.phys!.def;
    const [x, z] = localToWorld(def.dims.width / 2 + 0.7, def.interior.driverSeat.z, this.phys!.x, this.phys!.z, this.phys!.heading);
    return new THREE.Vector3(x, this.phys!.y, z);
  }

  startMinutes() {
    return TIME.startMinutes;
  }
}
