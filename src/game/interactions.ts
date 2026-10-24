import { EVENTS, ODD_JOBS } from '../data/content';
import { ANCHORS, CAMPGROUND_BY_ID, DISCOVERIES, type AnchorDef } from '../data/map';
import { inReservedSite, outdoorItemsNear } from '../sim/camping';
import { dist, localToWorld } from '../sim/geo';
import { oddPoints } from '../sim/jobs';
import { npcStop } from '../sim/npcs';
import { activeEvent } from '../sim/services';
import { activeVehicle, capacities, defOf, hasTool, itemsInVehicle, vdef } from '../sim/vehicle';
import { NPCS } from '../data/content';
import { complete } from '../sim/objectives';
import type { Game } from './game';

// Interaction targets near the player on foot. Each has one or more actions;
// the HUD prompt shows the nearest, E runs it (or opens a menu).

export interface Action {
  label: string;
  run: () => void;
  disabled?: string;
  hidden?: boolean;
}

export interface Target {
  id: string;
  label: string;
  sub?: string;
  x: number;
  z: number;
  radius: number;
  actions: Action[];
  hold?: number;
  priority?: number;
}

function oddDone(g: Game, jobId: string): Set<number> {
  const raw = (g.sim!.s.flags[`odd:${jobId}`] as string | undefined) ?? '';
  return new Set(raw.split(',').filter(Boolean).map(Number));
}

function markOdd(g: Game, jobId: string, i: number) {
  const set = oddDone(g, jobId);
  set.add(i);
  g.sim!.s.flags[`odd:${jobId}`] = [...set].join(',');
}

function anchorTarget(g: Game, a: AnchorDef): Target | null {
  const sc = g.screens;
  const sim = g.sim!;
  const base = { id: `a:${a.id}`, x: a.x, z: a.z, radius: 2.6 };
  switch (a.kind) {
    case 'shop':
      return { ...base, label: `Enter ${a.name}`, actions: [{ label: `Shop at ${a.name}`, run: () => sc.shop(a.ref!) }] };
    case 'dealer':
      return { ...base, label: `Enter ${a.name}`, actions: [{ label: `Visit ${a.name}`, run: () => sc.shop(a.ref!) }] };
    case 'diner':
      return { ...base, label: a.name, actions: [{ label: `Eat a hot meal ($${a.price})`, run: () => sc.timed(() => sim.diner(a.id), 'A plate of enchiladas and coffee.') }] };
    case 'mechanic':
      return { ...base, label: a.name, actions: [{ label: `Talk to ${a.name}`, run: () => sc.service(a.ref!) }] };
    case 'jobboard':
      return { ...base, label: 'Job board', actions: [{ label: 'Read the job board', run: () => sc.jobBoard(a.ref!) }] };
    case 'dock':
      return { ...base, radius: 4, label: a.name, actions: [{ label: `Loading dock`, run: () => sc.dock(a.id) }] };
    case 'fuel':
      return { ...base, label: 'Fuel pump', actions: [{ label: 'Use the fuel pump', run: () => sc.fuel(a.id) }] };
    case 'dump':
      return { ...base, radius: 3, label: 'Dump station', actions: [{ label: 'Empty waste tanks', run: () => sc.dump(a.id) }] };
    case 'water':
      return { ...base, label: a.name, actions: [{ label: 'Fill fresh water', run: () => sc.water(a.id) }] };
    case 'propane':
      return { ...base, radius: 3, label: 'Propane refill', actions: [{ label: 'Refill propane', run: () => sc.propane(a.id) }] };
    case 'carwash':
      return { ...base, radius: 4, label: 'Car wash', actions: [{ label: `Wash the RV`, run: () => sc.timed(() => sim.carWash(a.id), 'Suds, scrub, rinse. She shines!') }] };
    case 'kiosk':
      return { ...base, label: a.name, actions: [{ label: 'Rent a campsite', run: () => sc.campground(a.ref!) }] };
    case 'shower':
      return { ...base, label: a.name, actions: [{ label: 'Take a shower', run: () => sc.paidShower(a.id) }] };
    case 'locker':
      return { ...base, label: a.name, actions: [{ label: 'Storage locker', run: () => sc.locker() }] };
    case 'fishing':
      return { ...base, label: 'End of the pier', actions: [{ label: 'Go fishing (1 h)', run: () => sc.timed(() => sim.fish(), 'You cast a line into the clear water...') }] };
    case 'canoe':
      return { ...base, label: 'Canoe rental', actions: [{ label: `Rent a canoe ($${a.price}, 75 min)`, run: () => sc.timed(() => sim.canoe(a.id), 'Paddling across the still lake...') }] };
    case 'campfire': {
      const ev = activeEvent(sim.s, a.x, a.z);
      if (!ev) return null;
      return { ...base, radius: 5, label: 'Campfire Night', actions: [{ label: 'Join the campfire', run: () => sc.timed(() => sim.campfire(a.x, a.z), 'Songs, stories and marshmallows.') }] };
    }
    case 'viewpoint':
      return { ...base, radius: 4, label: 'Viewpoint', actions: [{ label: 'Take in the view', run: () => sc.timed(() => sim.relax(true), 'You sit for a while and watch the light change.') }] };
    case 'info':
      return { ...base, label: 'Ranger desk', actions: [{ label: 'Ask the ranger', run: () => sc.ranger() }] };
    default:
      return null;
  }
}

export function worldTargets(g: Game, px: number, pz: number): Target[] {
  const out: Target[] = [];
  const sim = g.sim!;
  const s = sim.s;
  const v = activeVehicle(s);
  const phys = g.phys!;
  const def = vdef(v);
  const sc = g.screens;
  const carrying = s.player.carrying;
  // ── the RV ──
  const door = g.vehicleDoorOutside();
  out.push({
    id: 'rv-door', label: 'Enter your RV', x: door.x, z: door.z, radius: 1.8, priority: 0.5,
    actions: [{ label: 'Enter your RV', run: () => g.explore && g.interiorFromOutside() }],
  });
  const drv = g.driverDoorOutside();
  out.push({
    id: 'rv-drive', label: 'Driver’s seat', x: drv.x, z: drv.z, radius: 1.6, priority: 0.4,
    actions: [{ label: 'Get in and drive', run: () => g.driveFromOutside() }],
  });
  const dv = dist(px, pz, phys.x, phys.z);
  if (dv < def.dims.length / 2 + 2.2) {
    const acts = [
      { label: 'Inspect your RV', run: () => { complete(s, 'inspect'); sc.inspect(); } },
      { label: 'Camp setup...', run: () => sc.campSetup() },
    ];
    const caps = capacities(s, v.id);
    if (caps.outdoorShower) acts.push({ label: 'Outdoor shower', run: () => sc.timed(() => sim.outdoorShower(), 'Brisk, but refreshing.') });
    const parts = itemsInVehicle(s, v.id).filter((i) => i.where.kind === 'stored' && defOf(i).features?.part);
    if (parts.length && hasTool(s, v.id, 'toolkit')) acts.push({ label: 'Work on the RV (DIY)...', run: () => sc.diy() });
    if (carrying?.kind === 'item') acts.unshift({ label: 'Put it back in storage', run: () => { sim.packOutdoor(carrying.uid); s.player.carrying = null; sim.changed(); } });
    out.push({ id: 'rv-body', label: 'Your RV', x: phys.x, z: phys.z, radius: def.dims.length / 2 + 2.2, priority: -1.5, actions: acts });
  }
  // ── anchors ──
  for (const a of ANCHORS) {
    if (Math.abs(a.x - px) > 30 || Math.abs(a.z - pz) > 30) continue;
    const t = anchorTarget(g, a);
    if (t) out.push(t);
  }
  // ── hookup pedestal at a reserved site ──
  const here = inReservedSite(s);
  if (here?.site.pedestal) {
    const p = here.site.pedestal;
    out.push({ id: 'pedestal', label: 'Hookup pedestal', x: p.x, z: p.z, radius: 2.4, priority: 0.3, actions: [{ label: 'Hookups (power / water / sewer)', run: () => sc.hookups() }] });
  } else if (s.reservation) {
    const camp = CAMPGROUND_BY_ID[s.reservation.camp];
    const site = camp.sites.find((x) => x.id === s.reservation!.site);
    if (site?.pedestal && dist(px, pz, site.pedestal.x, site.pedestal.z) < 3) {
      out.push({ id: 'pedestal', label: 'Hookup pedestal', x: site.pedestal.x, z: site.pedestal.z, radius: 2.4, actions: [{ label: 'Hookups', run: () => sc.hookups() }] });
    }
  }
  // ── NPC travelers ──
  for (const id in NPCS) {
    const st = npcStop(s, id);
    if (!st) continue;
    const [cx, cz] = localToWorld(-2.6, 1.0, st.x, st.z, st.heading);
    if (dist(px, pz, cx, cz) > 6) continue;
    out.push({ id: `npc:${id}`, label: `Talk to ${NPCS[id].name}`, x: cx, z: cz, radius: 2.6, priority: 0.8, actions: [{ label: `Talk to ${NPCS[id].name}`, run: () => sc.dialog(id) }] });
  }
  // ── odd jobs ──
  for (const job of s.jobs.active) {
    if (job.offer.kind !== 'odd') continue;
    const od = ODD_JOBS[job.offer.odd];
    const pts = oddPoints(job);
    const total = pts.length;
    if (od.mechanic === 'visit') {
      const done = oddDone(g, job.offer.id);
      pts.forEach(([x, z], i) => {
        if (done.has(i) || dist(px, pz, x, z) > 8) return;
        out.push({
          id: `odd:${job.offer.id}:${i}`, label: `${od.title} (${job.progress}/${total})`, x, z, radius: 1.7, hold: 1.2, priority: 1,
          actions: [{ label: od.id === 'dj_litter' ? 'Pick up litter' : od.id === 'pl_trail' ? 'Clear branches' : 'Check the connection', run: () => {
            const r = sim.oddStep(job.offer.id);
            if (r.ok) markOdd(g, job.offer.id, i);
            else g.ui.toast({ text: r.reason, kind: 'warn' });
          } }],
        });
      });
    } else {
      const holding = carrying?.kind === 'job' && carrying.jobId === job.offer.id;
      if (!holding && !carrying) {
        const [x, z] = pts[Math.min(job.progress, pts.length - 1)];
        if (dist(px, pz, x, z) < 10) {
          out.push({
            id: `odd-pick:${job.offer.id}`, label: `Pick up (${job.progress}/${total})`, x, z, radius: 2.2, priority: 1,
            actions: [{ label: od.carryModel === 'firewood' ? 'Pick up a firewood bundle' : 'Pick up a box', run: () => { s.player.carrying = { kind: 'job', jobId: job.offer.id }; sim.changed(); } }],
          });
        }
      } else if (holding && od.drop) {
        const [x, z] = od.drop;
        if (dist(px, pz, x, z) < 12) {
          out.push({
            id: `odd-drop:${job.offer.id}`, label: `Drop off (${job.progress}/${total})`, x, z, radius: 2.4, hold: 0.8, priority: 1.2,
            actions: [{ label: od.carryModel === 'firewood' ? 'Stack the firewood' : 'Set the box down', run: () => {
              const r = sim.oddStep(job.offer.id);
              if (r.ok) s.player.carrying = null;
              else g.ui.toast({ text: r.reason, kind: 'warn' });
              sim.changed();
            } }],
          });
        }
      }
    }
  }
  // ── outdoor items ──
  for (const it of outdoorItemsNear(s, 60)) {
    if (it.where.kind !== 'outdoor') continue;
    const d = defOf(it);
    const acts: Action[] = [];
    if (d.features?.outdoor?.kind === 'chair') acts.push({ label: 'Sit and relax', run: () => sc.timed(() => sim.relax(true), 'You kick back and watch the world go by.') });
    acts.push({ label: `Pick up the ${d.name.toLowerCase()}`, run: () => { s.player.carrying = { kind: 'item', uid: it.uid }; it.where = { kind: 'carried' }; sim.changed(); } });
    out.push({ id: `out:${it.uid}`, label: d.name, x: it.where.x, z: it.where.z, radius: 1.6, priority: 0.6, actions: acts });
  }
  // carrying an outdoor item: place it
  if (carrying?.kind === 'item') {
    const it = s.items[carrying.uid];
    if (it) {
      out.push({
        id: 'place-outdoor', label: `Set down the ${defOf(it).name.toLowerCase()}`, x: px, z: pz, radius: 99, priority: 2,
        actions: [{ label: `Set down the ${defOf(it).name.toLowerCase()}`, run: () => {
          const fx = Math.sin(g.explore.yaw), fz = Math.cos(g.explore.yaw);
          const r = sim.placeOutdoor(carrying.uid, px + fx * 1.2, pz + fz * 1.2, g.explore.yaw + Math.PI);
          if (!r.ok) g.ui.toast({ text: r.reason, kind: 'warn' });
        } }],
      });
    }
  }
  // ── events ──
  const market = EVENTS.find((e) => e.id === 'farmers_market')!;
  if (dist(px, pz, market.x, market.z) < 22 && activeEvent(s, market.x, market.z)) {
    out.push({ id: 'market', label: 'Farmers Market', x: market.x, z: market.z, radius: 22, priority: -0.5, actions: [{ label: 'Browse the farmers market', run: () => { sim.s && sc.shop('market'); } }] });
  }
  // ── viewpoints from discoveries (only those without anchors) ──
  for (const d of DISCOVERIES) {
    if (d.kind !== 'viewpoint' || d.id === 'canyon_overlook' || d.id === 'vista_point') continue;
    if (dist(px, pz, d.x, d.z) > d.radius) continue;
    out.push({ id: `view:${d.id}`, label: d.name, x: d.x, z: d.z, radius: d.radius, actions: [{ label: 'Take in the view', run: () => sc.timed(() => sim.relax(true), d.text) }] });
  }
  return out;
}
