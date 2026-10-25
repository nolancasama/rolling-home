import { ANCHOR_BY_ID, CAMPGROUND_BY_ID, PLACES } from '../data/map';
import { worldToLocal, wrapAngle } from '../sim/geo';
import { inReservedSite } from '../sim/camping';
import { performance as vehiclePerformance } from '../sim/maintenance';
import { vehicleAtAnchor } from '../sim/places';
import { activeVehicle, capacities } from '../sim/vehicle';
import { computeWeight } from '../sim/weight';
import { EDGE_BY_ID, pointAlong, routeTo, type Route } from '../world/roads';
import type { Game } from '../game/game';
import { worldTargets } from '../game/interactions';
import type { Finish, WindowTreatment } from '../data/types';
import { designApi } from './designApi';

// Automation/test hooks on window.__rh. Used by the acceptance harness; harmless in play.

export function installTestApi(game: Game) {
  let pilot: { route: Route; resolve: (ok: boolean, speed: number) => void; started: number; maxMs: number; stopAt: number; full?: boolean } | null = null;

  const pilotStep = () => {
    requestAnimationFrame(pilotStep);
    if (!pilot || game.mode !== 'drive' || !game.phys) return;
    const p = game.phys;
    const pts = pilot.route.points;
    // nearest point index
    let bi = 0, bd = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = (pts[i][0] - p.x) ** 2 + (pts[i][1] - p.z) ** 2;
      if (d < bd) { bd = d; bi = i; }
    }
    const look = Math.max(8, Math.min(26, 7 + Math.abs(p.speed) * 1.1));
    let acc = 0, li = bi;
    while (li < pts.length - 1 && acc < look) {
      acc += Math.hypot(pts[li + 1][0] - pts[li][0], pts[li + 1][1] - pts[li][1]);
      li++;
    }
    const a = pts[Math.max(0, li - 1)], b = pts[li];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    const lane = 1.6;
    const gx = b[0] + -tz * lane, gz = b[1] + tx * lane;
    const desired = Math.atan2(gx - p.x, gz - p.z);
    const err = wrapAngle(desired - p.heading);
    // curvature ahead → target speed
    let maxTurn = 0;
    for (let k = bi; k < Math.min(pts.length - 3, bi + 30); k++) {
      const ax = pts[k + 1][0] - pts[k][0], az = pts[k + 1][1] - pts[k][1];
      const bx = pts[k + 3][0] - pts[k + 1][0], bz = pts[k + 3][1] - pts[k + 1][1];
      const c = (ax * bx + az * bz) / ((Math.hypot(ax, az) * Math.hypot(bx, bz)) || 1);
      maxTurn = Math.max(maxTurn, Math.acos(Math.max(-1, Math.min(1, c))));
    }
    let remaining = 0;
    for (let k = bi; k < pts.length - 1; k++) remaining += Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]);
    let target = maxTurn > 0.5 ? 9 : maxTurn > 0.25 ? 14 : 22;
    target = Math.min(target, Math.max(3, remaining * 0.35));
    const spd = p.speed;
    let throttle = spd < target - 0.5 ? Math.min(1, (target - spd) * 0.4) : 0;
    let brake = spd > target + 1.5 ? Math.min(1, (spd - target) * 0.3) : 0;
    if (pilot.full) {
      throttle = 1;
      brake = 0;
    }
    game.drive.auto = { throttle, brake, steer: Math.max(-1, Math.min(1, err * 2.2)) };
    if (remaining < pilot.stopAt || performance.now() - pilot.started > pilot.maxMs) {
      const endSpeed = p.speed;
      // stop on the handbrake: holding S at a standstill would engage reverse
      game.drive.auto = { throttle: 0, brake: 0, steer: 0, handbrake: true };
      const ok = remaining < pilot.stopAt;
      const res = pilot.resolve;
      pilot = null;
      setTimeout(() => {
        game.drive.auto = null;
        res(ok, endSpeed);
      }, 1500);
    }
  };
  requestAnimationFrame(pilotStep);

  const api = {
    game,
    ready: () => !!game.world.traffic,
    mode: () => game.mode,
    screens: () => game.ui.stack.map((s) => s.id),
    state: () => game.sim?.s,
    snapshot: () => {
      const s = game.sim?.s;
      if (!s) return { mode: game.mode, started: false, screens: game.ui.stack.map((x) => x.id) };
      const v = activeVehicle(s);
      const w = computeWeight(s, v.id);
      const c = capacities(s, v.id);
      return {
        started: true, mode: game.mode, screens: game.ui.stack.map((x) => x.id), minutes: s.time.minutes, cash: s.cash,
        needs: { ...s.player.needs },
        player: game.mode === 'explore' ? { x: game.explore.x, z: game.explore.z } : { x: game.interior.lx, z: game.interior.lz, local: true },
        vehicle: {
          def: v.def, x: game.phys?.x, z: game.phys?.z, heading: game.phys?.heading, speed: game.phys?.speed, fuel: v.fuel,
          fresh: v.fresh, gray: v.gray, black: v.black, battery: v.batteryWh, propane: v.propane, condition: { ...v.condition },
          hookups: { ...v.hookups }, odometer: v.odometerKm, capacities: { fresh: c.fresh, gray: c.gray, black: c.black, fuel: c.fuel },
        },
        weight: { total: w.total, front: w.front, rear: w.rear, payload: w.payloadLeft, status: w.status, cargo: w.byCat.cargo },
        jobs: s.jobs.active.map((j) => ({ id: j.offer.id, kind: j.offer.kind, status: j.status })),
        completedJobs: s.jobs.completed,
        reservation: s.reservation,
        objectives: Object.keys(s.objectives.done),
        items: Object.keys(s.items).length,
        prompt: (document.getElementById('prompt')?.textContent ?? '').trim(),
        fps: game.fps,
      };
    },
    teleport(x: number, z: number, yaw?: number) {
      if (game.mode !== 'explore') game.setMode('explore');
      game.explore.teleport(x, z, yaw);
    },
    teleportVehicle(x: number, z: number, heading: number) {
      const s = game.sim!.s;
      const v = activeVehicle(s);
      v.pose = { x, z, heading };
      game.phys!.place(x, z, heading);
      game.updateVehicleView(0);
    },
    targets: () => (game.mode === 'explore' ? worldTargets(game, game.explore.x, game.explore.z).map((t) => ({ id: t.id, label: t.label, x: t.x, z: t.z, actions: t.actions.map((a) => a.label) })) : game.interior.buildTargets().map((t) => ({ id: t.id, label: t.label, x: t.x, z: t.z, actions: t.actions.map((a) => a.label) }))),
    current: () => (game.mode === 'explore' ? game.explore.current?.id : game.mode === 'interior' ? game.interior.current?.id : null) ?? null,
    /** Walk to a target and run one of its actions by label substring. */
    act(targetId: string, labelPart?: string): string {
      const list = game.mode === 'explore' ? worldTargets(game, game.explore.x, game.explore.z) : game.interior.buildTargets();
      const t = list.find((x) => x.id === targetId);
      if (!t) return `no target ${targetId}`;
      const acts = t.actions.filter((a) => !a.hidden);
      const a = labelPart ? acts.find((x) => x.label.toLowerCase().includes(labelPart.toLowerCase())) : acts[0];
      if (!a) return `no action ${labelPart} on ${targetId}: ${acts.map((x) => x.label).join(' | ')}`;
      if (a.disabled) return `disabled: ${a.disabled}`;
      a.run();
      return 'ok';
    },
    /** Interior: stand at a vehicle-local point facing a direction. */
    standInside(x: number, z: number, yaw: number) {
      if (game.mode !== 'interior') game.setMode('interior');
      game.interior.lx = x;
      game.interior.lz = z;
      game.interior.yaw = yaw;
    },
    // 'furnish' is the old name of Design Mode, kept for older harness scripts.
    setMode: (m: 'explore' | 'interior' | 'drive' | 'design' | 'furnish') => game.setMode(m === 'furnish' ? 'design' : m),
    setTraffic(on: boolean) {
      for (const c of game.world.traffic.cars) {
        c.mesh.visible = on;
        c.collider.y0 = on ? c.collider.y0 : -2000;
        c.collider.y1 = on ? c.collider.y1 : -1999;
      }
      game.world.traffic.update = on ? game.world.traffic.constructor.prototype.update.bind(game.world.traffic) : () => {};
    },
    /** Drive (real physics) along a GPS route to a node; resolves true on arrival. */
    autodrive(destNode: string, maxMs = 240000, stopAt = 18): Promise<boolean> {
      const s = game.sim!.s;
      const v = activeVehicle(s);
      const r = routeTo(game.phys!.x, game.phys!.z, destNode, { vehicleWidth: game.phys!.def.dims.width, revealed: s.revealed });
      if (!r) return Promise.resolve(false);
      void v;
      game.route = r;
      game.routeDest = destNode;
      return new Promise((resolve) => {
        pilot = { route: r, resolve, started: performance.now(), maxMs, stopAt };
      });
    },
    /** Drive to an arbitrary point via a route to the nearest node then straight in. */
    autodriveTo(x: number, z: number, maxMs = 60000): Promise<boolean> {
      const p = game.phys!;
      const pts: [number, number][] = [];
      const n = Math.max(2, Math.ceil(Math.hypot(x - p.x, z - p.z) / 3));
      for (let i = 0; i <= n; i++) pts.push([p.x + ((x - p.x) * i) / n, p.z + ((z - p.z) * i) / n]);
      const route: Route = { steps: [], points: pts, worldLength: Math.hypot(x - p.x, z - p.z), km: 0, minutes: 0, majorEdges: [], destNode: '' };
      return new Promise((resolve) => {
        pilot = { route, resolve, started: performance.now(), maxMs, stopAt: 1.5 };
      });
    },
    /** Drive through explicit waypoints. */
    autodrivePath(points: [number, number][], maxMs = 90000, stopAt = 2): Promise<boolean> {
      const p = game.phys!;
      const pts: [number, number][] = [[p.x, p.z]];
      for (const q of points) {
        const [ax, az] = pts[pts.length - 1];
        const n = Math.max(1, Math.ceil(Math.hypot(q[0] - ax, q[1] - az) / 3));
        for (let i = 1; i <= n; i++) pts.push([ax + ((q[0] - ax) * i) / n, az + ((q[1] - az) * i) / n]);
      }
      const route: Route = { steps: [], points: pts, worldLength: 0, km: 0, minutes: 0, majorEdges: [], destNode: '' };
      return new Promise((resolve) => {
        pilot = { route, resolve, started: performance.now(), maxMs, stopAt };
      });
    },
    /** Full-throttle run along a road edge for `seconds`; resolves with the final speed (m/s). */
    speedRun(edgeId: string, along: number, seconds: number): Promise<number> {
      const e = EDGE_BY_ID[edgeId];
      const start = pointAlong(e, along);
      const heading = Math.atan2(start.dx, start.dz);
      const sx = start.x + -start.dz * 1.8, sz = start.z + start.dx * 1.8;
      const s = game.sim!.s;
      activeVehicle(s).pose = { x: sx, z: sz, heading };
      game.phys!.place(sx, sz, heading);
      game.phys!.perf = null;
      const pts: [number, number][] = [];
      for (let a = along; a < Math.min(e.length, along + 600); a += 3) {
        const q = pointAlong(e, a);
        pts.push([q.x, q.z]);
      }
      const route: Route = { steps: [], points: pts, worldLength: 0, km: 0, minutes: 0, majorEdges: [], destNode: '' };
      return new Promise<number>((resolve) => {
        pilot = { route, resolve: (_ok, speed) => resolve(speed), started: performance.now(), maxMs: seconds * 1000, stopAt: -1, full: true };
      });
    },
    placeNode: (id: string) => PLACES.find((p) => p.id === id)?.node,
    edgeLength: (edgeId: string) => EDGE_BY_ID[edgeId]?.length ?? 0,
    /** Pose on a road edge (right lane), heading along the edge. */
    roadPose: (edgeId: string, along: number) => {
      const e = EDGE_BY_ID[edgeId];
      if (!e) return null;
      const pt = pointAlong(e, along);
      return { x: pt.x + -pt.dz * 1.8, z: pt.z + pt.dx * 1.8, heading: Math.atan2(pt.dx, pt.dz) };
    },
    design: designApi(game),
    /** Old furnishing helpers mapped onto Design Mode (placing applies to the draft; done() confirms it). */
    furnish: {
      startMove: (uid: string) => game.design.startOwned(uid),
      moveTo: (x: number, z: number, rot?: number) => game.design.moveCandidate(x, z, rot),
      issues: () => game.design.session?.issues.filter((i) => i.severity === 'block').map((i) => i.text) ?? [],
      place: () => game.design.place(),
      done: () => {
        if (game.mode !== 'design') return true;
        if (game.design.summary().changed) return game.design.confirm().ok;
        game.setMode('interior');
        return true;
      },
    },
    ...(import.meta.env.DEV ? { dev: {
      setSurface(id: string, finish: Finish) {
        const s = game.sim!.s, v = activeVehicle(s);
        if (!game.vv!.def.interior.surfaces.some(surface => surface.id === id)) throw new Error(`Unknown surface ${id}`);
        v.custom.surfaces[id] = structuredClone(finish);
        game.vv!.sync(s);
      },
      setWindow(id: string, treatment: WindowTreatment) {
        const s = game.sim!.s, v = activeVehicle(s);
        if (!game.vv!.def.interior.windows.some(window => window.id === id && !window.door)) throw new Error(`Unknown or protected window ${id}`);
        v.custom.windows[id] = structuredClone(treatment);
        game.vv!.sync(s);
      },
      setCovering(id: string, open: number) {
        const s = game.sim!.s, v = activeVehicle(s);
        const window = game.vv!.def.interior.windows.find(window => window.id === id);
        const treatment = v.custom.windows[id] ?? window?.factory;
        if (!treatment || window?.door) throw new Error(`Window ${id} has no treatment`);
        v.custom.windows[id] = { ...structuredClone(treatment), open: Math.max(0, Math.min(1, open)) };
        game.vv!.sync(s);
      },
      previewHour(hour: number | null) { game.previewMinutes = hour === null ? null : ((hour % 24 + 24) % 24) * 60; },
      cutaway(level: false | 'up' | 'cut' | 'down') { game.vv!.setCutaway(level); },
      /** JSON snapshots: controller waits on semantic state, never animation sleeps. */
      state: () => ({
        previewMinutes: game.previewMinutes,
        cutaway: game.vv?.cutaway,
        coverings: game.vv?.coverings.animationState,
        lights: game.vv?.interiorLights.state,
        exposure: game.renderer.toneMappingExposure,
        targetExposure: game.targetExposure,
        post: game.post?.metrics,
        programs: game.renderer.info.programs?.length,
        drawCalls: game.renderer.info.render.calls,
        textureGeneration: game.vv?.textureGeneration,
        surfaces: game.sim ? structuredClone(activeVehicle(game.sim.s).custom.surfaces) : {},
      }),
    } } : {}),
    save: (slot: 'slot1' | 'slot2' | 'slot3' | 'auto') => game.save(slot),
    anchor: (id: string) => {
      const a = ANCHOR_BY_ID[id];
      return a ? { x: a.x, z: a.z, r: a.vehicleRadius ?? 0 } : null;
    },
    site: (campId: string, siteId: string) => {
      const s = CAMPGROUND_BY_ID[campId]?.sites.find((x) => x.id === siteId);
      return s ? { x: s.x, z: s.z, heading: s.heading, pedestal: s.pedestal ?? null } : null;
    },
    inSite: () => !!game.sim && !!inReservedSite(game.sim.s),
    vehicleAt: (anchorId: string) => !!game.sim && vehicleAtAnchor(activeVehicle(game.sim.s), anchorId),
    perf: () => (game.sim ? vehiclePerformance(game.sim.s, activeVehicle(game.sim.s).id) : null),
    caps: () => (game.sim ? capacities(game.sim.s, activeVehicle(game.sim.s).id) : null),
    doorOutside: () => {
      const p = game.vehicleDoorOutside();
      return { x: p.x, z: p.z };
    },
    driverDoor: () => {
      const p = game.driverDoorOutside();
      return { x: p.x, z: p.z };
    },
    /** Vehicle-local OBB test: is a world point inside the vehicle footprint? */
    insideVehicle: (x: number, z: number, margin = 0) => {
      const p = game.phys!;
      const [lx, lz] = worldToLocal(x, z, p.x, p.z, p.heading);
      return Math.abs(lx) < p.def.dims.width / 2 - margin && Math.abs(lz) < p.def.dims.length / 2 - margin;
    },
    /** Accept + load a delivery through the sim (precondition helper). */
    setupLoadedJob: (jobId: string, comps: string[]) => {
      const sim = game.sim!;
      const board = 'dj_board';
      if (!sim.s.jobs.active.some((j) => j.offer.id === jobId)) sim.accept(jobId, board);
      const v = activeVehicle(sim.s);
      const lot = { x: -893, z: 826 };
      v.pose = { x: lot.x, z: lot.z, heading: Math.PI };
      game.phys!.place(lot.x, lot.z, Math.PI);
      const r = sim.loadCargo(jobId, comps);
      for (const it of Object.values(sim.s.items)) if (it.cargo) it.secured = true;
      return r.ok ? 'ok' : r.reason;
    },
  };
  (window as unknown as { __rh: typeof api }).__rh = api;
}
