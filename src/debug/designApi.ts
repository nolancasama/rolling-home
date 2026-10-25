import type { Finish, ItemConfig, SlotKind, WindowTreatment } from '../data/types';
import type { Game } from '../game/game';
import { newBlueprintId } from '../game/blueprintStore';
import type { DesignTab, WallsLevel } from '../game/design/designMode';
import { blueprintStore, refreshTabs } from '../ui/screens/design/tabs';
import { checkBlueprint, factoryBlueprint, makeBlueprint, parseBlueprint } from '../sim/blueprints';
import type { Result } from '../sim/core';
import { checkPlacement, freeWallSpan } from '../sim/furnish';
import * as reno from '../sim/renovation';
import type { LightSettings } from '../sim/types';
import { defOf } from '../sim/vehicle';

// window.__rh.design: drives Design Mode for the acceptance harness. Every
// call returns plain JSON (results, uids, semantic state), never DOM text.

type Place = { x: number; z: number; rot: number; y?: number } | { slot: SlotKind };

const plain = (r: Result<object>) => (r.ok ? { ...r } : { ok: false, reason: r.reason });

export function designApi(game: Game) {
  const dm = () => game.design;
  const draft = () => {
    if (game.mode !== 'design' || !dm().draft) throw new Error('Design Mode is not open');
    return dm().draft!;
  };
  const edit = (r: Result<object>) => {
    if (r.ok) dm().changed();
    return plain(r);
  };
  return {
    enter: () => { if (game.mode !== 'design') game.setMode('design'); return game.mode === 'design'; },
    active: () => game.mode === 'design',
    state: () => ({
      mode: game.mode, selected: [...dm().selected], session: dm().session ? { kind: dm().session!.kind, cand: { ...dm().session!.cand }, issues: dm().session!.issues.map((i) => ({ code: i.code, severity: i.severity, text: i.text })) } : null,
      tool: dm().tool, walls: dm().walls, walking: dm().walking, preview: dm().previewIndex, undo: dm().draft?.undo.length ?? 0, redo: dm().draft?.redo.length ?? 0,
      camera: dm().cam ? { yaw: dm().cam!.yaw, pitch: dm().cam!.pitch, dist: dm().cam!.dist, target: dm().cam!.target.toArray() } : null,
    }),
    /** Draft items in this vehicle (uid, def, where, config, finish, state). */
    items: () => Object.values(draft().s.items).filter((it) => 'vehicle' in it.where && it.where.vehicle === draft().vid)
      .map((it) => ({ uid: it.uid, def: it.def, name: defOf(it).name, where: { ...it.where }, config: it.config, finish: it.finish, state: it.state, light: it.light })),
    custom: () => structuredClone(draft().s.vehicles.find((v) => v.id === draft().vid)!.custom),
    catalog: (category?: string) => dm().catalog().filter((e) => !category || e.category === category)
      .map((e) => ({ id: e.def.id, name: e.def.name, category: e.category, price: e.def.price, mass: e.def.mass, owned: e.owned.map((o) => o.uid) })),
    /** Probe a placement without applying it (block and warn issues with their texts). */
    check: (defId: string, place: { x: number; z: number; rot: number; y?: number }, opts: { uid?: string; config?: ItemConfig; state?: string } = {}) =>
      checkPlacement(draft().s, draft().vid, { uid: opts.uid ?? '__probe', def: defId, ...place, config: opts.config, state: opts.state })
        .map((i) => ({ code: i.code, severity: i.severity, text: i.text })),
    add: (defId: string, place: Place, opts: { config?: ItemConfig; finish?: Record<string, Finish>; state?: string; light?: LightSettings } = {}) =>
      edit(reno.addFromCatalog(draft(), defId, place as never, opts)),
    placeOwned: (uid: string, place: Place) => edit(reno.placeOwned(draft(), uid, place as never)),
    move: (moves: { uid: string; x: number; z: number; rot?: number; y?: number }[]) => edit(reno.moveItems(draft(), moves)),
    rotate: (uid: string, dir = 1) => edit(reno.rotate(draft(), uid, dir)),
    remove: (uid: string) => edit(reno.remove(draft(), uid)),
    setRemoval: (uid: string, disposition: reno.Removal) => edit(reno.setRemoval(draft(), uid, disposition)),
    setConfig: (uid: string, config: ItemConfig) => edit(reno.setConfig(draft(), uid, config)),
    fitToGap: (uid: string) => dm().fitToGap(uid),
    setState: (uid: string, state: string) => edit(reno.setState(draft(), uid, state)),
    setFinish: (target: reno.FinishTarget, finish: Finish) => edit(reno.setFinish(draft(), target, finish)),
    setWindow: (id: string, treatment: WindowTreatment) => edit(reno.setWindow(draft(), id, treatment)),
    setLight: (uid: string, settings: Partial<LightSettings>) => edit(reno.setLight(draft(), uid, settings)),
    swapMattress: (bed: string, mattress: string) => edit(reno.swapMattress(draft(), bed, mattress)),
    measureWall: (side: 'left' | 'right' | 'rear', at: number, y0 = 0.02, y1 = 0.9) => freeWallSpan(draft().s, draft().vid, side, at, y0, y1),
    wallGap: (uid: string) => dm().wallGap(uid),
    select: (uids: string[]) => { dm().selected = uids.filter((u) => !!draft().s.items[u]); game.ui.invalidate(); return dm().selected; },
    startNew: (defId: string, opts: { config?: ItemConfig; finish?: Record<string, Finish>; state?: string } = {}) => { dm().startNew(defId, opts); return !!dm().session; },
    startMove: (uids: string[]) => { dm().startMove(uids); return !!dm().session; },
    moveCandidate: (x: number, z: number, rot?: number, y?: number) => { dm().moveCandidate(x, z, rot, y); return dm().session?.issues.map((i) => i.text) ?? null; },
    place: () => dm().place(),
    cancel: () => dm().endSession(),
    undo: () => { dm().undo(); return draft().undo.length; },
    redo: () => { dm().redo(); return draft().redo.length; },
    summary: () => {
      const s = dm().summary();
      return {
        changed: s.changed, canCommit: s.canCommit, reason: s.reason, total: s.total, goods: s.goods, delivery: s.delivery, labor: s.labor, sales: s.sales,
        minutes: s.minutes, diyMinutes: s.diyMinutes, proMinutes: s.proMinutes, proCost: s.proCost,
        lines: s.lines.map((l) => ({ ...l })), removed: s.removed.map((r) => ({ ...r })),
        issues: s.issues.map((i) => ({ code: i.code, severity: i.severity, text: i.text, uid: i.uid })),
        weightBefore: { total: s.weightBefore.total, front: s.weightBefore.front, rear: s.weightBefore.rear },
        weightAfter: { total: s.weightAfter.total, front: s.weightAfter.front, rear: s.weightAfter.rear, payload: s.weightAfter.payloadLeft, status: s.weightAfter.status },
        storageBefore: { ...s.storageBefore }, storageAfter: { ...s.storageAfter }, nightLoadBefore: s.nightLoadBefore, nightLoadAfter: s.nightLoadAfter,
      };
    },
    setPro: (pro: boolean) => { dm().pro = pro; game.ui.invalidate(); return dm().pro; },
    review: () => { dm().done(); return game.ui.stack.map((s) => s.id); },
    confirm: (opts: { pro?: boolean } = {}) => { if (opts.pro != null) dm().pro = opts.pro; return plain(dm().confirm()); },
    discard: () => { dm().discard(); return game.mode; },
    camera: (c: { yaw?: number; pitch?: number; dist?: number; target?: [number, number, number] }) => {
      const cam = dm().cam!;
      if (c.yaw != null) cam.yaw = c.yaw;
      if (c.pitch != null) cam.pitch = c.pitch;
      if (c.dist != null) cam.dist = c.dist;
      if (c.target) cam.target.set(...c.target);
      return { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist, target: cam.target.toArray() };
    },
    orbit: (dYaw: number, dPitch = 0) => { dm().cam!.orbit(dYaw, dPitch); return dm().cam!.yaw; },
    zoom: (steps: number) => { dm().cam!.zoom(steps); return dm().cam!.dist; },
    pan: (dx: number, dz: number) => { dm().cam!.pan(dx, dz); return dm().cam!.target.toArray(); },
    top: () => { dm().cam!.top(); return dm().cam!.pitch; },
    walls: (level: WallsLevel) => { dm().setWalls(level); return dm().walls; },
    previewHour: (index: number) => { dm().cyclePreview(index); return game.previewMinutes; },
    walk: (on: boolean) => { if (dm().walking !== on) dm().toggleWalk(); return dm().walking; },
    tool: (tool: 'select' | 'measure') => { dm().setTool(tool); return dm().tool; },
    tab: (tab: DesignTab) => { dm().setTab(tab); return dm().tab; },
    selectSurface: (id: string | null) => { dm().selectSurface(id); return dm().surface; },
    selectWindow: (id: string | null) => { dm().selectWindow(id); return dm().windowId; },
    /** Open an item material slot's picker in the inspector. */
    editSlot: (slot: string | null) => { dm().slot = slot; game.ui.invalidate(); return dm().slot; },
    relaxed: (on: boolean) => { dm().setRelaxed(on); return !!game.sim!.s.creativeRelaxed; },
    blueprints: {
      list: () => blueprintStore.list().map((b) => ({ id: b.id, name: b.name, vehicle: b.vehicle, items: b.stats.items, fits: checkBlueprint(b, game.phys!.def).ok })),
      save: (name: string) => {
        const bp = makeBlueprint(draft().s, draft().vid, { id: newBlueprintId(), name, createdAt: new Date().toISOString() });
        const saved = blueprintStore.put(bp);
        refreshTabs(game);
        return saved ? bp.id : null;
      },
      load: (id: string) => {
        const bp = blueprintStore.list().find((b) => b.id === id);
        return bp ? edit(reno.applyBlueprint(draft(), bp)) : { ok: false, reason: 'No such blueprint.' };
      },
      factory: () => edit(reno.applyBlueprint(draft(), factoryBlueprint(game.phys!.def.id))),
      remove: (id: string) => { const done = blueprintStore.remove(id); refreshTabs(game); return done; },
      exportJson: (id: string) => {
        const bp = blueprintStore.list().find((b) => b.id === id);
        return bp ? JSON.stringify(bp) : null;
      },
      importJson: (json: string) => {
        const r = parseBlueprint(json);
        if (!r.ok) return { ok: false, reason: r.reason };
        blueprintStore.put(r.blueprint);
        refreshTabs(game);
        return { ok: true, id: r.blueprint.id };
      },
    },
  };
}
