import * as THREE from 'three';
import { ITEM_LIST, itemDef } from '../../data/items';
import type { Finish, ItemConfig, ItemDef, Rect } from '../../data/types';
import type { Result } from '../../sim/core';
import { normalizeConfig, resolveDef } from '../../sim/families';
import { accessZone, checkPlacement, facing, footprint, freeWallSpan, itemElevation, layoutOf, type PlacementIssue } from '../../sim/furnish';
import { clamp } from '../../sim/geo';
import * as reno from '../../sim/renovation';
import type { GameState, ItemInstance } from '../../sim/types';
import { defOf, mattressOn } from '../../sim/vehicle';
import { buildItemModel } from '../../render/furniture';
import type { Game, Mode, ModeId } from '../game';
import { DesignCamera } from './camera';
import { DesignOverlay, type DimLine, type Status } from './overlay';
import { clearances, edgeMagnet, FINE, GRID, nearestWall, onWall, snap, type WallSide } from './snap';

// Design Mode: renovate the RV on a draft copy of the game. Nothing is bought,
// moved or charged until the player confirms; cancelling drops the draft.

export type WallsLevel = 'up' | 'cut' | 'down';
export type Tool = 'select' | 'measure';

export interface Candidate {
  x: number;
  z: number;
  rot: number;
  y?: number;
}

type SessionKind =
  | { kind: 'new'; defId: string; config?: ItemConfig; finish?: Record<string, Finish>; state?: string }
  | { kind: 'owned'; uid: string }
  | { kind: 'move'; uids: string[]; anchor: string; start: Record<string, Candidate>; grab: { dx: number; dz: number } };

export type Session = SessionKind & {
  cand: Candidate;
  issues: PlacementIssue[];
  /** Set from code or keys: the pointer does not move the candidate until the mouse moves. */
  pinned: boolean;
  /** Started by dragging an item: it lands when the button is released. */
  dragging: boolean;
};

export const CATALOG_CATEGORIES = [
  { id: 'all', label: 'All' }, { id: 'owned', label: 'Owned' }, { id: 'kitchen', label: 'Kitchen' }, { id: 'bath', label: 'Bath' },
  { id: 'beds', label: 'Beds' }, { id: 'seating', label: 'Seating' }, { id: 'tables', label: 'Tables' }, { id: 'storage', label: 'Storage' },
  { id: 'lighting', label: 'Lighting' }, { id: 'decor', label: 'Decor' }, { id: 'systems', label: 'Systems' },
] as const;

export function catalogCategory(def: ItemDef): string {
  const f = def.features ?? {};
  if (def.slot) return 'systems';
  if (def.light) return 'lighting';
  if (f.toilet || f.shower) return 'bath';
  if (f.galley || f.fridge || f.microwave || f.hood) return 'kitchen';
  if (def.category === 'mattress' || (f.bed && !f.seat)) return 'beds';
  if (f.table) return 'tables';
  if (f.seat) return 'seating';
  if (def.family?.id === 'cabinet' || def.storage) return 'storage';
  return 'decor';
}

export interface CatalogEntry {
  def: ItemDef;
  category: string;
  owned: ItemInstance[];
}

/** Time-of-day previews (render only; the game clock does not move). */
export const PREVIEW_HOURS: { hour: number | null; label: string }[] = [
  { hour: null, label: 'Now' }, { hour: 9, label: 'Morning' }, { hour: 13, label: 'Noon' }, { hour: 19.5, label: 'Evening' }, { hour: 23, label: 'Night' },
];

const GHOST_UID = '__design_ghost';
const BODY_R = 0.22;

function ghostMaterial(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.7 });
}

export function formatLength(m: number, units: 'imperial' | 'metric'): string {
  const metric = `${m.toFixed(2)} m`;
  if (units === 'metric') return metric;
  const inches = Math.round(m / 0.0254);
  return `${metric} · ${Math.floor(inches / 12)}′ ${inches % 12}″`;
}

export class DesignMode implements Mode {
  draft: reno.Draft | null = null;
  selected: string[] = [];
  hovered: string | null = null;
  session: Session | null = null;
  tool: Tool = 'select';
  walls: WallsLevel = 'cut';
  showGrid = true;
  pro = false;
  query = '';
  category = 'all';
  /** Bumped on every draft edit; panels re-render from it. */
  version = 0;
  previewIndex = 0;
  walking = false;
  labelLayer: HTMLElement | null = null;
  measure: { a: THREE.Vector3 | null; b: THREE.Vector3 | null; band: 'floor' | 'upper'; text: string } = { a: null, b: null, band: 'floor', text: '' };
  cam: DesignCamera | null = null;
  private overlay: DesignOverlay | null = null;
  private ghosts: THREE.Object3D[] = [];
  private hidden: THREE.Object3D[] = [];
  private mats: Record<Status, THREE.MeshStandardMaterial>;
  private boxes: THREE.Box3Helper[] = [];
  private ray = new THREE.Raycaster();
  private floorPoint: THREE.Vector3 | null = null;
  private lastMouse = { x: -1, y: -1 };
  private press: { uid: string | null; x: number; y: number; shift: boolean } | null = null;
  private rightPress: { x: number; y: number } | null = null;
  private lastClick = { t: 0, uid: '' };
  private summaryCache: { key: string; value: reno.RenovationSummary } | null = null;
  private walk = { x: 0, z: 0, yaw: 0, pitch: -0.05 };
  private guides: { axis: 'x' | 'z'; at: number }[] = [];

  constructor(private g: Game) {
    this.mats = { ok: ghostMaterial(0x5fd07a), warn: ghostMaterial(0xe8b040), block: ghostMaterial(0xe05a4a) };
  }

  // ───────────── lifecycle ─────────────

  get s(): GameState {
    return this.draft!.s;
  }

  get vid(): string {
    return this.draft!.vid;
  }

  private get vd() {
    return this.g.phys!.def;
  }

  private get clearance(): number {
    return this.vd.interior.ceilingY - this.vd.interior.floorY;
  }

  enter(_from: ModeId) {
    const g = this.g;
    this.draft = g.sim!.beginDesign();
    this.cam = new DesignCamera(this.vd);
    this.selected = [];
    this.session = null;
    this.tool = 'select';
    this.walking = false;
    this.previewIndex = 0;
    g.previewMinutes = null;
    this.measure = { a: null, b: null, band: 'floor', text: '' };
    this.overlay = new DesignOverlay(this.vd);
    g.vv!.body.add(this.overlay.group);
    this.overlay.setGrid(this.showGrid);
    g.vv!.setCutaway(this.walls);
    g.input.releaseLock();
    g.input.dragLook = true;
    this.changed(true);
    g.screens.designPanel();
    g.ui.setPrompt(null);
  }

  exit(_to: ModeId) {
    const g = this.g;
    this.endSession();
    this.clearBoxes();
    this.overlay?.dispose();
    this.overlay = null;
    if (this.walking) g.input.releaseLock();
    this.walking = false;
    g.vv!.setCutaway(false);
    g.previewMinutes = null;
    g.ui.closeId('design-review');
    g.ui.closeId('design');
    this.draft = null;
    g.vv!.sync(g.sim!.s, true);
  }

  timeScale() {
    return 0;
  }

  /** After every draft edit: re-render the draft and refresh the panels. */
  changed(force = false) {
    this.version++;
    this.summaryCache = null;
    this.selected = this.selected.filter((uid) => this.onFloor(uid));
    this.g.vv!.sync(this.s, force);
    this.g.ui.invalidate();
  }

  private onFloor(uid: string): boolean {
    const it = this.s.items[uid];
    return !!it && it.where.kind === 'floor' && it.where.vehicle === this.vid;
  }

  /** Report an edit's outcome to the player. */
  apply(r: Result): boolean {
    if (!r.ok) {
      this.g.ui.toast({ text: r.reason, kind: 'bad' });
      this.g.audio.error();
      return false;
    }
    this.changed();
    this.g.audio.click();
    return true;
  }

  context() {
    return reno.renovationContext(this.g.sim!.s, this.vid);
  }

  summary(): reno.RenovationSummary {
    const key = `${this.version}:${this.pro}`;
    if (this.summaryCache?.key === key) return this.summaryCache.value;
    const value = reno.summary(this.draft!, { ...this.context(), pro: this.pro });
    this.summaryCache = { key, value };
    return value;
  }

  catalog(): CatalogEntry[] {
    const owned = new Map<string, ItemInstance[]>();
    for (const it of Object.values(this.s.items)) {
      if (it.where.kind !== 'stored' || it.where.vehicle !== this.vid) continue;
      const d = defOf(it);
      if (!d.floor && !d.slot && d.category !== 'mattress') continue;
      const list = owned.get(it.def) ?? [];
      list.push(it);
      owned.set(it.def, list);
    }
    const out: CatalogEntry[] = [];
    for (const def of ITEM_LIST) {
      if (!def.floor && !def.slot && def.category !== 'mattress') continue;
      if (def.category === 'outdoor' || def.category === 'cargo') continue;
      const mine = owned.get(def.id) ?? [];
      if (def.usedOnly && !mine.length) continue;
      out.push({ def: resolveDef(def, {}), category: catalogCategory(def), owned: mine });
    }
    return out;
  }

  // ───────────── editing entry points (panel, keys, test API) ─────────────

  /** Start placing a catalog item (systems install at once, mattresses go on the selected bed). */
  startNew(defId: string, opts: { config?: ItemConfig; finish?: Record<string, Finish>; state?: string } = {}) {
    const def = itemDef(defId);
    if (def.slot) {
      this.apply(reno.addFromCatalog(this.draft!, defId, { slot: def.slot.kind }));
      return;
    }
    if (def.category === 'mattress') {
      this.putMattress(defId);
      return;
    }
    if (!def.floor) return;
    const config = def.family ? normalizeConfig(def, opts.config, this.clearance) : undefined;
    this.beginSession({ kind: 'new', defId, config, finish: opts.finish, state: opts.state });
  }

  /** Place an item from this RV's storage. */
  startOwned(uid: string) {
    const it = this.s.items[uid];
    if (!it) return;
    const d = defOf(it);
    if (d.slot) {
      this.apply(reno.placeOwned(this.draft!, uid, { slot: d.slot.kind }));
      return;
    }
    if (d.category === 'mattress') {
      this.putMattress(uid);
      return;
    }
    if (it.where.kind === 'floor') this.startMove([uid], uid);
    else this.beginSession({ kind: 'owned', uid });
  }

  startMove(uids: string[], anchor = uids[0]) {
    const start: Record<string, Candidate> = {};
    for (const uid of uids) {
      const w = this.s.items[uid]?.where;
      if (w?.kind !== 'floor') return;
      start[uid] = { x: w.x, z: w.z, rot: w.rot, y: w.y };
    }
    const grab = this.floorPoint ? { dx: start[anchor].x - this.floorPoint.x, dz: start[anchor].z - this.floorPoint.z } : { dx: 0, dz: 0 };
    this.beginSession({ kind: 'move', uids, anchor, start, grab });
  }

  /** Mattresses go onto the selected bed (or the only bed that takes them). */
  private putMattress(defOrUid: string) {
    const size = (this.s.items[defOrUid] ? defOf(this.s.items[defOrUid]) : itemDef(defOrUid)).features?.mattress?.size;
    const beds = layoutOf(this.s, this.vid).filter((l) => itemDef(l.def).features?.bed?.mattressSize === size);
    const bed = beds.find((b) => this.selected.includes(b.uid)) ?? (beds.length === 1 ? beds[0] : undefined);
    if (!bed) {
      this.g.ui.toast({ text: 'Select the bed this mattress should go on first.', kind: 'warn' });
      return;
    }
    this.apply(reno.swapMattress(this.draft!, bed.uid, defOrUid));
  }

  rotateSelected(dir = 1) {
    if (this.session) return this.rotateCandidate(dir);
    if (this.selected.length !== 1) return;
    const uid = this.selected[0];
    const d = defOf(this.s.items[uid]);
    if (d.floor?.mount === 'wall' || d.floor?.againstWall) {
      this.g.ui.toast({ text: 'Wall pieces always face into the room. Drag it to another wall instead.', kind: 'info' });
      return;
    }
    this.apply(reno.rotate(this.draft!, uid, dir));
  }

  removeSelected() {
    if (this.session || !this.selected.length) return;
    let changed = false;
    for (const uid of [...this.selected]) {
      const r = reno.remove(this.draft!, uid);
      if (!r.ok) this.g.ui.toast({ text: r.reason, kind: 'bad' });
      else changed = true;
    }
    if (changed) {
      this.selected = [];
      this.changed();
      this.g.audio.click();
    }
  }

  duplicateSelected() {
    if (this.session || !this.selected.length) return;
    const it = this.s.items[this.selected[0]];
    this.startNew(it.def, { config: it.config, finish: it.finish, state: it.state });
  }

  nudgeSelected(dx: number, dz: number, dy = 0) {
    if (this.session) {
      const c = this.session.cand;
      this.session.cand = { ...c, x: c.x + dx, z: c.z + dz, ...(dy && c.y != null ? { y: c.y + dy } : {}) };
      this.session.pinned = true;
      this.validate();
      return;
    }
    if (!this.selected.length) return;
    const moves = this.selected.map((uid) => {
      const w = this.s.items[uid].where as Extract<ItemInstance['where'], { kind: 'floor' }>;
      const d = defOf(this.s.items[uid]);
      return { uid, x: w.x + dx, z: w.z + dz, ...(dy && d.floor?.mount === 'wall' ? { y: (w.y ?? d.floor.elevation ?? 0) + dy } : {}) };
    });
    this.apply(reno.moveItems(this.draft!, moves));
  }

  undo() {
    this.endSession();
    this.apply(reno.undo(this.draft!));
  }

  redo() {
    this.endSession();
    this.apply(reno.redo(this.draft!));
  }

  setWalls(level: WallsLevel) {
    this.walls = level;
    if (!this.walking) this.g.vv!.setCutaway(level);
    this.g.ui.invalidate();
  }

  toggleGrid() {
    this.showGrid = !this.showGrid;
    this.overlay?.setGrid(this.showGrid);
    this.g.ui.invalidate();
  }

  cyclePreview(index = (this.previewIndex + 1) % PREVIEW_HOURS.length) {
    this.previewIndex = index;
    const h = PREVIEW_HOURS[index].hour;
    this.g.previewMinutes = h == null ? null : Math.floor(this.g.sim!.s.time.minutes / 1440) * 1440 + h * 60;
    this.g.ui.invalidate();
  }

  setTool(tool: Tool) {
    this.endSession();
    this.tool = tool;
    this.measure.a = this.measure.b = null;
    this.measure.text = '';
    this.overlay?.setDims([]);
    this.g.ui.invalidate();
  }

  /** Done: review the changes (or simply leave when nothing changed). */
  done() {
    if (this.session) return this.endSession();
    if (!this.summary().changed) return this.g.setMode('interior');
    this.g.screens.designReview();
  }

  discard() {
    this.g.setMode('interior');
  }

  confirm(): Result {
    const r = this.g.sim!.commitDesign(this.draft!, { pro: this.pro });
    if (!r.ok) {
      this.g.ui.toast({ text: r.reason, kind: 'bad' });
      return r;
    }
    const time = r.minutes >= 1 ? ` · ${Math.round(r.minutes)} min of work` : '';
    this.g.ui.toast({ text: `Renovation done${r.cost > 0 ? `: $${Math.round(r.cost).toLocaleString('en-US')}` : ''}${time}.`, kind: 'good' });
    this.g.audio.chime();
    this.g.setMode('interior');
    this.g.save('auto');
    return r;
  }

  /** Escape: cancel placement, then the tool, then the selection, then leave via review. */
  escape() {
    if (this.walking) return this.toggleWalk();
    if (this.session) return this.endSession();
    if (this.tool !== 'select') return this.setTool('select');
    if (this.selected.length) {
      this.selected = [];
      this.g.ui.invalidate();
      return;
    }
    this.done();
  }

  focusSelected() {
    const it = this.selected.length ? this.s.items[this.selected[0]] : null;
    if (it?.where.kind === 'floor') this.cam!.focus(new THREE.Vector3(it.where.x, 0, it.where.z));
  }

  // ───────────── placement sessions ─────────────

  private beginSession(kind: SessionKind) {
    this.endSession();
    this.tool = 'select';
    const def = this.sessionDef(kind);
    let cand: Candidate;
    if (kind.kind === 'move') cand = { ...kind.start[kind.anchor] };
    else {
      const inr = this.vd.interior;
      const p = this.floorPoint ?? new THREE.Vector3(0, 0, (inr.living.z0 + inr.living.z1) / 2);
      cand = this.candidateAt(p, def, { x: p.x, z: p.z, rot: 0, y: def.floor?.mount === 'wall' ? def.floor.elevation : undefined }, false);
    }
    this.session = { ...kind, cand, issues: [], pinned: false, dragging: false } as Session;
    this.buildGhosts();
    this.validate();
    this.g.ui.invalidate();
  }

  /** Rebuild the ghost after the session's size or options changed (new parametric items). */
  refreshSession() {
    const sess = this.session;
    if (!sess) return;
    for (const o of this.ghosts) o.removeFromParent();
    this.ghosts = [];
    this.buildGhosts();
    const p = this.floorPoint;
    if (p && !sess.pinned) sess.cand = this.candidateAt(p, this.sessionDef(sess), sess.cand, false);
    this.validate();
  }

  endSession() {
    for (const o of this.ghosts) o.removeFromParent();
    this.ghosts = [];
    for (const o of this.hidden) o.visible = true;
    this.hidden = [];
    this.overlay?.clearCandidate();
    this.overlay?.setDims([]);
    this.overlay?.setZoneEmphasis({});
    if (this.session) {
      this.session = null;
      this.g.ui.invalidate();
    }
  }

  /** Resolved definition the session places (anchor item for group moves). */
  sessionDef(kind: SessionKind = this.session!): ItemDef {
    if (kind.kind === 'new') return resolveDef(itemDef(kind.defId), { config: kind.config, state: kind.state });
    return defOf(this.s.items[kind.kind === 'owned' ? kind.uid : kind.anchor]);
  }

  private sessionUid(sess: Session): string {
    return sess.kind === 'new' ? GHOST_UID : sess.kind === 'owned' ? sess.uid : sess.anchor;
  }

  private buildGhosts() {
    const sess = this.session!;
    const vv = this.g.vv!;
    const uids = sess.kind === 'move' ? sess.uids : [this.sessionUid(sess)];
    for (const uid of uids) {
      const inst = this.s.items[uid];
      const def = uid === GHOST_UID ? this.sessionDef(sess) : defOf(inst);
      const mat = inst && def.features?.bed?.usesMattress ? mattressOn(this.s, uid) : null;
      const model = buildItemModel(def, { mattress: mat ? defOf(mat) : null });
      model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          (o as THREE.Mesh).material = this.mats.ok;
          (o as THREE.Mesh).castShadow = false;
        }
      });
      model.userData.ghostFor = uid;
      vv.body.add(model);
      this.ghosts.push(model);
      const own = vv.itemMeshes.get(uid);
      if (own) {
        own.visible = false;
        this.hidden.push(own);
      }
    }
  }

  private rotateCandidate(dir: number) {
    const sess = this.session;
    if (!sess) return;
    const d = this.sessionDef(sess);
    if (d.floor?.mount === 'wall' || d.floor?.againstWall) {
      this.g.ui.toast({ text: 'Wall pieces always face into the room.', kind: 'info' });
      return;
    }
    if (sess.kind === 'move' && sess.uids.length > 1) {
      this.g.ui.toast({ text: 'Rotate pieces one at a time.', kind: 'info' });
      return;
    }
    sess.cand = { ...sess.cand, rot: (((sess.cand.rot + dir) % 4) + 4) % 4 };
    this.validate();
  }

  /** Footprints of items that stand in the way (excluding the ones being placed). */
  private standingRects(exclude: Set<string>): Rect[] {
    const vd = this.vd;
    return layoutOf(this.s, this.vid).filter((l) => !exclude.has(l.uid)).flatMap((l) => {
      const d = resolveDef(itemDef(l.def), l);
      const y = itemElevation(vd, l);
      return d.floor?.flat || y >= 1.75 ? [] : [footprint(d, l.x, l.z, l.rot)];
    });
  }

  /** Candidate for a floor point: grid snap, wall grab and edge magnets (Alt places freely). */
  candidateAt(p: THREE.Vector3, def: ItemDef, prev: Candidate, alt: boolean): Candidate {
    const vd = this.vd, fl = def.floor!;
    const exclude = new Set(this.session?.kind === 'move' ? this.session.uids : this.session ? [this.sessionUid(this.session)] : []);
    const others = this.standingRects(exclude);
    const living = vd.interior.living;
    this.guides = [];
    if (fl.mount === 'wall' || fl.againstWall) {
      const side: WallSide = nearestWall(vd, p.x, p.z).side;
      const along = side === 'rear' ? p.x : p.z;
      const pos = onWall(vd, def, side, snap(along, alt ? FINE : GRID));
      const cand: Candidate = { ...pos, ...(fl.mount === 'wall' ? { y: prev.y ?? fl.elevation ?? 1.45 } : {}) };
      if (!alt) {
        const m = edgeMagnet(footprint(def, cand.x, cand.z, cand.rot), others, living, side === 'rear' ? ['x'] : ['z']);
        cand.x += m.dx;
        cand.z += m.dz;
        this.guides = m.guides;
      }
      return cand;
    }
    const step = alt ? FINE : GRID;
    const cand: Candidate = { x: snap(p.x, step), z: snap(p.z, step), rot: prev.rot };
    if (!alt) {
      const m = edgeMagnet(footprint(def, cand.x, cand.z, cand.rot), others, living);
      cand.x += m.dx;
      cand.z += m.dz;
      this.guides = m.guides;
    }
    return cand;
  }

  /** Validate the candidate on the draft and update the ghost, footprint, envelopes and dimensions. */
  validate() {
    const sess = this.session;
    if (!sess) return;
    const def = this.sessionDef(sess);
    const c = sess.cand;
    const uid = this.sessionUid(sess);
    const base = sess.kind === 'new' ? { def: sess.defId, config: sess.config, state: sess.state } : (() => {
      const it = this.s.items[uid];
      return { def: it.def, config: it.config, state: it.state };
    })();
    sess.issues = checkPlacement(this.s, this.vid, { uid, ...base, x: c.x, z: c.z, rot: c.rot, y: c.y });
    const status: Status = sess.issues.some((i) => i.severity === 'block') ? 'block' : sess.issues.length ? 'warn' : 'ok';
    const vd = this.vd, inr = vd.interior;
    const y = def.floor!.mount === 'ceiling' ? this.clearance - def.floor!.height : def.floor!.mount === 'wall' ? c.y ?? 0 : 0;
    // ghosts (group moves keep their offsets from the anchor)
    const dx = sess.kind === 'move' ? c.x - sess.start[sess.anchor].x : 0, dz = sess.kind === 'move' ? c.z - sess.start[sess.anchor].z : 0;
    for (const ghost of this.ghosts) {
      const gid = ghost.userData.ghostFor as string;
      const own = sess.kind === 'move' && gid !== sess.anchor ? sess.start[gid] : null;
      const gd = own ? defOf(this.s.items[gid]) : def;
      const gy = own ? (gd.floor!.mount === 'ceiling' ? this.clearance - gd.floor!.height : own.y ?? 0) : y;
      ghost.position.set(own ? own.x + dx : c.x, inr.floorY + gy + 0.004, own ? own.z + dz : c.z);
      ghost.rotation.y = ((own ? own.rot : c.rot) * Math.PI) / 2;
      ghost.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = this.mats[status];
      });
    }
    const rect = footprint(def, c.x, c.z, c.rot);
    const envelopes: Rect[] = [];
    const states = def.floor!.states ?? [];
    const current = states.find((st) => st.id === (base.state ?? states[0]?.id));
    for (const st of states) {
      if (st === current) continue;
      const other = resolveDef(itemDef(base.def), { config: base.config, state: st.id });
      let x = c.x, z = c.z;
      if (def.floor!.againstWall) {
        const [fx, fz] = facing(c.rot);
        const dd = other.floor!.footprint[1] - def.floor!.footprint[1];
        x += (fx * dd) / 2;
        z += (fz * dd) / 2;
      }
      envelopes.push(footprint(other, x, z, c.rot));
    }
    this.overlay?.setCandidate(rect, status, envelopes, accessZone(def, c.x, c.z, c.rot));
    this.overlay?.setGuides(this.guides);
    this.overlay?.setZoneEmphasis({ plumbing: !!def.floor!.plumbing, gas: !!def.floor!.propane });
    // live clearances to the nearest obstacle on each side
    const exclude = new Set(sess.kind === 'move' ? sess.uids : [uid]);
    const units = this.g.settings.units;
    const dims: DimLine[] = [];
    const yLine = inr.floorY + 0.03;
    for (const cl of clearances(rect, this.standingRects(exclude), inr.living)) {
      const gap = Math.abs(cl.to - cl.from);
      if (gap < 0.005 || gap > 1.6) continue;
      const a = cl.dir === 'left' || cl.dir === 'right' ? new THREE.Vector3(cl.from, yLine, cl.at) : new THREE.Vector3(cl.at, yLine, cl.from);
      const b = cl.dir === 'left' || cl.dir === 'right' ? new THREE.Vector3(cl.to, yLine, cl.at) : new THREE.Vector3(cl.at, yLine, cl.to);
      dims.push({ a, b, label: formatLength(gap, units) });
    }
    this.overlay?.setDims(dims);
    this.g.ui.invalidate();
  }

  /** Commit the candidate to the draft. */
  place(): boolean {
    const sess = this.session;
    if (!sess) return false;
    this.validate();
    const block = sess.issues.find((i) => i.severity === 'block');
    if (block) {
      this.g.ui.toast({ text: block.text, kind: 'bad' });
      this.g.audio.error();
      if (sess.dragging) this.endSession();
      return false;
    }
    const c = sess.cand;
    const at = { x: c.x, z: c.z, rot: c.rot, ...(c.y != null ? { y: c.y } : {}) };
    let r: Result<object>;
    let selected: string[];
    if (sess.kind === 'new') {
      const added = reno.addFromCatalog(this.draft!, sess.defId, at, { config: sess.config, finish: sess.finish, state: sess.state });
      r = added;
      selected = added.ok ? [added.uid] : [];
    } else if (sess.kind === 'owned') {
      r = reno.placeOwned(this.draft!, sess.uid, at);
      selected = [sess.uid];
    } else {
      const dx = c.x - sess.start[sess.anchor].x, dz = c.z - sess.start[sess.anchor].z;
      const moves = sess.uids.map((uid) => (uid === sess.anchor ? { uid, ...at } : { uid, x: sess.start[uid].x + dx, z: sess.start[uid].z + dz }));
      const same = sess.uids.length === 1 && Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6 && c.rot === sess.start[sess.anchor].rot && c.y === sess.start[sess.anchor].y;
      if (same) {
        this.endSession();
        return true;
      }
      r = reno.moveItems(this.draft!, moves);
      selected = sess.uids;
    }
    this.endSession();
    if (!this.apply(r)) return false;
    this.selected = selected;
    this.g.ui.invalidate();
    return true;
  }

  /** Move the candidate to an exact spot (keys, test API). */
  moveCandidate(x: number, z: number, rot?: number, y?: number) {
    const sess = this.session;
    if (!sess) return;
    sess.cand = { x, z, rot: rot ?? sess.cand.rot, ...(y != null ? { y } : sess.cand.y != null ? { y: sess.cand.y } : {}) };
    sess.pinned = true;
    this.validate();
  }

  // ───────────── configuration (new parametric items) ─────────────

  setConfig(uid: string, patch: ItemConfig): boolean {
    const it = this.s.items[uid];
    if (!it) return false;
    return this.apply(reno.setConfig(this.draft!, uid, { ...normalizeConfig(itemDef(it.def), it.config, this.clearance), ...patch }));
  }

  /** Free wall span around a wall-backed item, ignoring the item itself. */
  wallGap(uid: string): { side: WallSide; a0: number; a1: number; length: number; before?: string; after?: string } | null {
    const it = this.s.items[uid];
    const w = it?.where;
    if (!it || w?.kind !== 'floor') return null;
    const d = defOf(it);
    if (!d.floor?.againstWall && d.floor?.mount !== 'wall') return null;
    const side: WallSide = w.rot === 3 ? 'left' : w.rot === 1 ? 'right' : 'rear';
    const y0 = itemElevation(this.vd, { uid, def: it.def, x: w.x, z: w.z, rot: w.rot, y: w.y, config: it.config, state: it.state });
    const without: GameState = { ...this.s, items: { ...this.s.items } };
    delete without.items[uid];
    const span = freeWallSpan(without, this.vid, side, side === 'rear' ? w.x : w.z, y0 + 0.01, y0 + d.floor.height - 0.01);
    return { side, ...span };
  }

  /** Widen (or narrow) a new cabinet to the largest width that fills its gap, centred in it. */
  fitToGap(uid: string): boolean {
    const it = this.s.items[uid];
    const fam = it ? itemDef(it.def).family : undefined;
    const gap = this.wallGap(uid);
    if (!it || !fam?.w || !gap || gap.length <= 0) {
      this.g.ui.toast({ text: 'Put the cabinet against a wall first.', kind: 'warn' });
      return false;
    }
    const [min, max, step] = fam.w;
    const width = clamp(Math.floor((gap.length + 1e-6 - min) / step) * step + min, min, max);
    if (gap.length + 1e-6 < min) {
      this.g.ui.toast({ text: `The gap is only ${formatLength(gap.length, 'metric')}; this cabinet is at least ${min.toFixed(2)} m wide.`, kind: 'bad' });
      return false;
    }
    const w = it.where as Extract<ItemInstance['where'], { kind: 'floor' }>;
    const center = (gap.a0 + gap.a1) / 2;
    const move = gap.side === 'rear' ? { uid, x: center, z: w.z } : { uid, x: w.x, z: center };
    if (!this.apply(reno.moveItems(this.draft!, [move]))) return false;
    return this.setConfig(uid, { w: Number(width.toFixed(4)) });
  }

  // ───────────── per-frame update ─────────────

  update(dt: number) {
    const g = this.g, inp = g.input;
    if (!this.draft || !this.cam) return;
    if (this.walking) return this.updateWalk(dt);
    const shift = inp.isDown('Shift'), ctrl = inp.isDown('Control'), alt = inp.isDown('Alt');
    // camera: right-drag orbits, middle-drag or Shift+right-drag pans, wheel zooms toward the pointer
    const panDrag = inp.mouseButtons.has(1) || (inp.mouseButtons.has(2) && shift);
    // grab-the-floor panning: the plan follows the pointer
    if (panDrag) this.cam.pan(-inp.mouseDX * this.cam.dist * 0.0011, inp.mouseDY * this.cam.dist * 0.0011);
    else if (inp.mouseButtons.has(2)) this.cam.orbit(-inp.mouseDX * 0.005, inp.mouseDY * 0.004);
    if (inp.isDown('Q')) this.cam.orbit(dt * 1.4, 0);
    if (inp.isDown('E')) this.cam.orbit(-dt * 1.4, 0);
    if (!ctrl) {
      const k = dt * Math.max(1.2, this.cam.dist * 0.35);
      const px = inp.axis(['A'], ['D']), pz = inp.axis(['S'], ['W']);
      if (px || pz) this.cam.pan(px * k, pz * k);
    }
    this.updatePointer();
    if (inp.wheel) this.cam.zoom(inp.wheel, this.floorPoint ?? undefined);
    this.keys(shift, ctrl);
    if (this.session) this.updateSession(alt);
    else if (this.tool === 'measure') this.updateMeasure(alt);
    else this.updateSelect();
    // right-click (without dragging) cancels a placement or the measure line
    if (inp.clicked.has(2)) this.rightPress = { x: inp.mouseX, y: inp.mouseY };
    if (this.rightPress && !inp.mouseButtons.has(2)) {
      if (Math.hypot(inp.mouseX - this.rightPress.x, inp.mouseY - this.rightPress.y) < 5) {
        if (this.session) this.endSession();
        else if (this.tool === 'measure') this.setTool('measure');
      }
      this.rightPress = null;
    }
    this.lastMouse = { x: inp.mouseX, y: inp.mouseY };
    this.cam.apply(g.camera, g.vv!.body, g.focus);
    this.fadeHighPieces();
    this.updateBoxes();
    this.overlay?.updateLabels(g.camera, g.vv!.body, this.labelLayer);
  }

  private keys(shift: boolean, ctrl: boolean) {
    const inp = this.g.input;
    if (ctrl && inp.wasPressed('Z')) return shift ? this.redo() : this.undo();
    if (ctrl && inp.wasPressed('Y')) return this.redo();
    if (ctrl && inp.wasPressed('D')) return this.duplicateSelected();
    if (inp.wasPressed('Delete') || inp.wasPressed('Backspace')) this.removeSelected();
    if (inp.wasPressed('R')) this.rotateSelected(shift ? -1 : 1);
    if (inp.wasPressed('M')) this.setTool(this.tool === 'measure' ? 'select' : 'measure');
    if (inp.wasPressed('T')) this.cam!.top();
    if (inp.wasPressed('V')) this.toggleWalk();
    if (inp.wasPressed('N')) this.cyclePreview();
    if (inp.wasPressed('G')) this.toggleGrid();
    if (inp.wasPressed('B') && this.tool === 'measure') {
      this.measure.band = this.measure.band === 'floor' ? 'upper' : 'floor';
      this.g.ui.invalidate();
    }
    if (inp.wasPressed('1')) this.setWalls('up');
    if (inp.wasPressed('2')) this.setWalls('cut');
    if (inp.wasPressed('3')) this.setWalls('down');
    const step = shift ? 0.05 : FINE;
    if (inp.wasPressed('ArrowLeft')) this.nudgeArrow(-1, 0, step);
    if (inp.wasPressed('ArrowRight')) this.nudgeArrow(1, 0, step);
    if (inp.wasPressed('ArrowUp')) this.nudgeArrow(0, 1, step);
    if (inp.wasPressed('ArrowDown')) this.nudgeArrow(0, -1, step);
    if (inp.wasPressed('PageUp')) this.nudgeSelected(0, 0, step);
    if (inp.wasPressed('PageDown')) this.nudgeSelected(0, 0, -step);
  }

  /** Arrow keys move along the camera's screen axes, snapped to the vehicle axes. */
  private nudgeArrow(sx: number, sz: number, step: number) {
    const { forward, right } = this.cam!.basis();
    const v = right.multiplyScalar(sx).add(forward.multiplyScalar(sz));
    const dx = Math.abs(v.x) >= Math.abs(v.z) ? Math.sign(v.x) * step : 0;
    const dz = Math.abs(v.z) > Math.abs(v.x) ? Math.sign(v.z) * step : 0;
    this.nudgeSelected(dx, dz);
  }

  private updatePointer() {
    const g = this.g, inp = g.input;
    const ndc = new THREE.Vector2((inp.mouseX / window.innerWidth) * 2 - 1, -(inp.mouseY / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(ndc, g.camera);
    g.vv!.body.updateMatrixWorld(true);
    const inv = g.vv!.body.matrixWorld.clone().invert();
    const o = this.ray.ray.origin.clone().applyMatrix4(inv);
    const d = this.ray.ray.direction.clone().transformDirection(inv);
    const t = (this.vd.interior.floorY - o.y) / (d.y || -1e-6);
    this.floorPoint = t > 0 ? o.addScaledVector(d, t) : null;
  }

  private pickItem(): string | null {
    const hits = this.ray.intersectObjects([...this.g.vv!.itemMeshes.values()].filter((m) => m.visible), true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.uid) o = o.parent;
      if (o) return o.userData.uid as string;
    }
    return null;
  }

  private updateSession(alt: boolean) {
    const sess = this.session!, inp = this.g.input;
    const moved = inp.mouseX !== this.lastMouse.x || inp.mouseY !== this.lastMouse.y;
    if (moved) sess.pinned = false;
    if (!sess.pinned && this.floorPoint && !inp.mouseButtons.has(2) && !inp.mouseButtons.has(1)) {
      const p = this.floorPoint.clone();
      if (sess.kind === 'move') {
        p.x += sess.grab.dx;
        p.z += sess.grab.dz;
      }
      const next = this.candidateAt(p, this.sessionDef(sess), sess.cand, alt);
      if (next.x !== sess.cand.x || next.z !== sess.cand.z || next.rot !== sess.cand.rot || next.y !== sess.cand.y) {
        sess.cand = next;
        this.validate();
      }
    }
    if (sess.dragging) {
      if (!inp.mouseButtons.has(0)) this.place();
    } else if (inp.clicked.has(0)) this.place();
  }

  private updateSelect() {
    const inp = this.g.input;
    const hover = this.pickItem();
    if (hover !== this.hovered) this.hovered = hover;
    if (inp.clicked.has(0)) this.press = { uid: hover, x: inp.mouseX, y: inp.mouseY, shift: inp.isDown('Shift') };
    const p = this.press;
    if (p && p.uid && inp.mouseButtons.has(0) && Math.hypot(inp.mouseX - p.x, inp.mouseY - p.y) > 5) {
      const uids = this.selected.includes(p.uid) ? [...this.selected] : [p.uid];
      this.selected = uids;
      this.press = null;
      this.startMove(uids, p.uid);
      if (this.session) this.session.dragging = true;
      return;
    }
    if (p && !inp.mouseButtons.has(0)) {
      this.press = null;
      this.click(p.uid, p.shift);
    }
  }

  /** Select (Shift adds/removes); a second click on the same piece focuses the camera on it. */
  click(uid: string | null, shift = false) {
    if (!uid) {
      if (!shift) this.selected = [];
    } else if (shift) {
      this.selected = this.selected.includes(uid) ? this.selected.filter((u) => u !== uid) : [...this.selected, uid];
    } else {
      const now = performance.now();
      if (this.lastClick.uid === uid && now - this.lastClick.t < 380) this.cam?.focus(this.itemCenter(uid));
      this.lastClick = { t: now, uid };
      this.selected = [uid];
    }
    this.g.ui.invalidate();
  }

  private itemCenter(uid: string): THREE.Vector3 {
    const w = this.s.items[uid]?.where;
    return w?.kind === 'floor' ? new THREE.Vector3(w.x, 0, w.z) : new THREE.Vector3();
  }

  private updateMeasure(alt: boolean) {
    const p = this.floorPoint;
    if (!p) return;
    const inp = this.g.input, inr = this.vd.interior, units = this.g.settings.units;
    const q = alt ? p.clone() : this.snapMeasure(p);
    q.y = inr.floorY + 0.03;
    const m = this.measure;
    if (inp.clicked.has(0)) {
      if (!m.a || m.b) {
        m.a = q.clone();
        m.b = null;
      } else m.b = q.clone();
      this.g.ui.invalidate();
    }
    const lines: DimLine[] = [];
    if (m.a) {
      const b = m.b ?? q;
      lines.push({ a: m.a, b, label: formatLength(m.a.distanceTo(b), units), accent: true });
    }
    const near = nearestWall(this.vd, q.x, q.z);
    let text = '';
    if (near.dist < 0.35) {
      const along = near.side === 'rear' ? q.x : q.z;
      const [y0, y1] = m.band === 'floor' ? [0.02, 0.9] : [1.35, this.clearance - 0.02];
      const span = freeWallSpan(this.s, this.vid, near.side, along, y0, y1);
      if (span.length > 0.02) {
        const l = inr.living, y = inr.floorY + 0.03;
        const a = near.side === 'rear' ? new THREE.Vector3(span.a0, y, l.z0 + 0.06) : new THREE.Vector3(near.side === 'left' ? l.x1 - 0.06 : l.x0 + 0.06, y, span.a0);
        const b = near.side === 'rear' ? new THREE.Vector3(span.a1, y, l.z0 + 0.06) : new THREE.Vector3(a.x, y, span.a1);
        lines.push({ a, b, label: `Free wall ${formatLength(span.length, units)}` });
        text = `Free wall: ${formatLength(span.length, units)} between ${span.before ?? 'the wall end'} and ${span.after ?? 'the wall end'}`;
      }
    }
    if (text !== m.text) {
      m.text = text;
      this.g.ui.invalidate();
    }
    this.overlay?.setDims(lines);
  }

  /** Snap a measuring point to nearby walls and item corners (5 cm). */
  private snapMeasure(p: THREE.Vector3): THREE.Vector3 {
    const l = this.vd.interior.living;
    const xs = [l.x0, l.x1], zs = [l.z0, l.z1];
    for (const r of this.standingRects(new Set())) {
      xs.push(r.x0, r.x1);
      zs.push(r.z0, r.z1);
    }
    const pick = (v: number, list: number[]) => list.reduce((best, c) => (Math.abs(c - v) < Math.abs(best - v) ? c : best), Infinity);
    const q = p.clone();
    const bx = pick(p.x, xs), bz = pick(p.z, zs);
    if (Math.abs(bx - p.x) < 0.05) q.x = bx;
    if (Math.abs(bz - p.z) < 0.05) q.z = bz;
    return q;
  }

  /** With the walls cut or down, wall-hung pieces above the cut turn translucent (still clickable). */
  private fadeHighPieces() {
    const fade = this.walls !== 'up' && !this.walking;
    for (const [uid, root] of this.g.vv!.itemMeshes) {
      const it = this.s.items[uid];
      const w = it?.where;
      if (!it || w?.kind !== 'floor') continue;
      const high = itemElevation(this.vd, { uid, def: it.def, x: w.x, z: w.z, rot: w.rot, y: w.y, config: it.config, state: it.state }) >= 0.95;
      const want = fade && high;
      if (root.userData.designFade === want) continue;
      root.userData.designFade = want;
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          const mat = m as THREE.MeshStandardMaterial;
          mat.transparent = want;
          mat.opacity = want ? 0.28 : 1;
          mat.depthWrite = !want;
        }
      });
    }
  }

  private clearBoxes() {
    for (const b of this.boxes) b.removeFromParent();
    this.boxes = [];
  }

  /** Outline the selection (teal) and the hovered piece (pale). */
  private updateBoxes() {
    const vv = this.g.vv!;
    const want: { uid: string; color: number }[] = this.selected.map((uid) => ({ uid, color: 0x2fd0c0 }));
    if (this.hovered && !this.selected.includes(this.hovered) && !this.session) want.push({ uid: this.hovered, color: 0xdff6f2 });
    while (this.boxes.length < want.length) {
      const helper = new THREE.Box3Helper(new THREE.Box3(), 0x2fd0c0);
      (helper.material as THREE.LineBasicMaterial).depthTest = false;
      helper.renderOrder = 12;
      this.g.scene.add(helper);
      this.boxes.push(helper);
    }
    this.boxes.forEach((helper, i) => {
      const w = want[i];
      const mesh = w ? vv.itemMeshes.get(w.uid) : undefined;
      helper.visible = !!mesh && mesh.visible;
      if (!w || !mesh) return;
      helper.box.setFromObject(mesh);
      (helper.material as THREE.LineBasicMaterial).color.setHex(w.color);
    });
  }

  // ───────────── walk-through preview ─────────────

  toggleWalk() {
    const g = this.g;
    if (this.walking) {
      this.walking = false;
      g.input.releaseLock();
      g.vv!.setCutaway(this.walls);
      if (this.overlay) this.overlay.group.visible = true;
      g.camera.near = 0.08;
      g.camera.updateProjectionMatrix();
    } else {
      this.endSession();
      this.clearBoxes();
      const dz = this.vd.interior.door.zone;
      this.walk = { x: (dz.x0 + dz.x1) / 2 + 0.15, z: (dz.z0 + dz.z1) / 2, yaw: Math.PI / 2, pitch: -0.05 };
      this.walking = true;
      g.vv!.setCutaway(false);
      if (this.overlay) this.overlay.group.visible = false;
      g.camera.near = 0.03;
      g.camera.updateProjectionMatrix();
      g.input.requestLock();
    }
    g.ui.invalidate();
  }

  private updateWalk(dt: number) {
    const g = this.g, inp = g.input, inr = this.vd.interior;
    if (inp.wasPressed('V')) return this.toggleWalk();
    if (!inp.pointerLocked && inp.clicked.has(0)) inp.requestLock();
    const sens = 0.0024 * g.settings.sensitivity;
    this.walk.yaw -= inp.mouseDX * sens;
    this.walk.pitch = clamp(this.walk.pitch - inp.mouseDY * sens * (g.settings.invertY ? -1 : 1), -1.3, 1.2);
    const fwd = inp.axis(['S', 'ArrowDown'], ['W', 'ArrowUp']), side = inp.axis(['A', 'ArrowLeft'], ['D', 'ArrowRight']);
    if (fwd || side) {
      const fx = Math.sin(this.walk.yaw), fz = Math.cos(this.walk.yaw);
      let mx = fx * fwd - Math.cos(this.walk.yaw) * side, mz = fz * fwd + Math.sin(this.walk.yaw) * side;
      const l = Math.hypot(mx, mz);
      mx /= l;
      mz /= l;
      const boxes = this.standingRects(new Set());
      const next = this.resolveWalk(this.walk.x + mx * 1.35 * dt, this.walk.z + mz * 1.35 * dt, boxes);
      this.walk.x = next[0];
      this.walk.z = next[1];
    }
    const body = g.vv!.body;
    body.updateMatrixWorld(true);
    const eye = new THREE.Vector3(this.walk.x, inr.floorY + Math.min(1.6, this.clearance - 0.14), this.walk.z).applyMatrix4(body.matrixWorld);
    const dir = new THREE.Vector3(Math.sin(this.walk.yaw) * Math.cos(this.walk.pitch), Math.sin(this.walk.pitch), Math.cos(this.walk.yaw) * Math.cos(this.walk.pitch));
    dir.applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(body.matrixWorld));
    g.camera.position.copy(eye);
    g.camera.lookAt(eye.clone().add(dir));
    g.focus.copy(g.vv!.root.position);
  }

  private resolveWalk(x: number, z: number, boxes: Rect[]): [number, number] {
    const l = this.vd.interior.living;
    x = clamp(x, l.x0 + BODY_R, l.x1 - BODY_R);
    z = clamp(z, l.z0 + BODY_R, l.z1 - BODY_R);
    for (const b of boxes) {
      const qx = clamp(x, b.x0, b.x1), qz = clamp(z, b.z0, b.z1);
      const dx = x - qx, dz = z - qz, d2 = dx * dx + dz * dz;
      if (d2 >= BODY_R * BODY_R) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        x = qx + (dx / d) * BODY_R;
        z = qz + (dz / d) * BODY_R;
      } else {
        const opts: [number, number][] = [[b.x0 - BODY_R, z], [b.x1 + BODY_R, z], [x, b.z0 - BODY_R], [x, b.z1 + BODY_R]];
        [x, z] = opts.reduce((best, o) => (Math.hypot(o[0] - x, o[1] - z) < Math.hypot(best[0] - x, best[1] - z) ? o : best));
      }
    }
    return [x, z];
  }
}
