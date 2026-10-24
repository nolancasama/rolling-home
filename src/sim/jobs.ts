import { BOARDS, CARGO_TEMPLATES, DOCKS, ODD_JOBS, REMOTE_GIGS, type OddJobDef } from '../data/content';
import { ECONOMY, JOBS } from '../data/config';
import { ANCHOR_BY_ID, PLACE_BY_ID } from '../data/map';
import { routeTo } from '../world/roads';
import { bill, dayOf, difficulty, earn, fail, fmtDuration, journal, money, newItem, note, ok, type Result } from './core';
import { addMood, restore, workEfficiency } from './needs';
import { pick, intRange, range, rngFor } from './rng';
import { signalAt, vehicleAtAnchor } from './places';
import { canStore } from './storage';
import type { ActiveJob, CrateSpec, DeliveryOffer, GameState, JobOffer, OddOffer } from './types';
import { activeVehicle, capacities, compartmentById, itemsInVehicle, vdef } from './vehicle';
import { computeWeight, type WeightReport } from './weight';

// Delivery contracts, odd jobs and remote work. Pay is only ever granted on
// verified completion.

export function dockLabel(dockId: string): string {
  return DOCKS[dockId]?.label ?? dockId;
}

export function dockDistanceKm(from: string, to: string): number {
  const a = ANCHOR_BY_ID[DOCKS[from].anchor];
  const destNode = PLACE_BY_ID[DOCKS[to].place].node;
  const r = routeTo(a.x, a.z, destNode, { vehicleWidth: 2.5 });
  return r ? r.km : 50;
}

const kmCache: Record<string, number> = {};
function cachedKm(from: string, to: string): number {
  const k = `${from}>${to}`;
  return (kmCache[k] ??= dockDistanceKm(from, to));
}

export function deliveryPay(s: GameState, km: number, crates: CrateSpec[], payMul: number): number {
  const kg = crates.reduce((a, c) => a + c.mass, 0);
  let pay = JOBS.baseDelivery + JOBS.perKm * km + JOBS.perKg * kg;
  if (crates.some((c) => c.fragile)) pay *= 1 + JOBS.fragileBonus;
  if (crates.some((c) => c.refrigerated)) pay *= 1 + JOBS.coldBonus;
  pay *= payMul * difficulty(s).payMul;
  return Math.round(pay / 5) * 5;
}

function starterJob(s: GameState): DeliveryOffer {
  const crates: CrateSpec[] = [0, 1, 2].map(() => ({ name: 'Hardware supplies', dims: [0.6, 0.45, 0.4], mass: 58 }));
  const km = cachedKm('dj_dock', 'pl_lodge_dock');
  return {
    id: 'starter', kind: 'delivery', board: 'dj_board', title: 'Hardware for Pine Lake Lodge', client: 'Pine Lake Lodge',
    description: 'Three crates of fixings and tools for the lodge renovation. Heavy for their size.',
    pickup: 'dj_dock', dropoff: 'pl_lodge_dock', crates, distanceKm: km, pay: deliveryPay(s, km, crates, 1.1),
    deadlineMin: s.time.minutes + 40 * 60, postedDay: 1,
  };
}

function generateBoard(s: GameState, boardId: string, day: number): JobOffer[] {
  const b = BOARDS[boardId];
  const rng = rngFor(s.seed, 'board', boardId, day);
  const offers: JobOffer[] = [];
  if (boardId === 'dj_board' && day === 1 && !s.flags.starterTaken) offers.push(starterJob(s));
  const n = b.deliveries;
  for (let i = 0; i < n; i++) {
    const t = pick(rng, CARGO_TEMPLATES);
    const dest = pick(rng, b.destinations);
    const count = intRange(rng, t.count[0], t.count[1]);
    const crates: CrateSpec[] = [];
    for (let k = 0; k < count; k++) {
      crates.push({
        name: t.name, dims: t.dims, mass: Math.round(range(rng, t.mass[0], t.mass[1])),
        fragile: t.fragile, refrigerated: t.refrigerated,
      });
    }
    const km = cachedKm(b.dock, dest);
    const hours = Math.ceil(km / 55 + range(rng, 14, 34));
    offers.push({
      id: `j${day}_${boardId}_${i}`, kind: 'delivery', board: boardId,
      title: `${t.name} to ${PLACE_BY_ID[DOCKS[dest].place].name}`, client: t.client,
      description: `${count} × ${t.name.toLowerCase()} (${crates.reduce((a, c) => a + c.mass, 0)} kg).` +
        (t.fragile ? ' Fragile: secure it well.' : '') + (t.refrigerated ? ' Must stay refrigerated.' : ''),
      pickup: b.dock, dropoff: dest, crates, distanceKm: km, pay: deliveryPay(s, km, crates, b.payMul),
      deadlineMin: day * 1440 - 1440 + Math.max(s.time.minutes % 1440, 8 * 60) + hours * 60, postedDay: day,
    });
  }
  for (const oj of b.oddJobs) {
    const d = ODD_JOBS[oj];
    if ((day + oj.length) % 3 === 0 && b.oddJobs.length > 1) continue; // some days a job is not posted
    offers.push({
      id: `o${day}_${oj}`, kind: 'odd', board: boardId, title: d.title, description: d.description, odd: oj,
      pay: Math.round((d.pay * difficulty(s).payMul) / 2) * 2, postedDay: day,
    });
  }
  return offers;
}

export function boardOffers(s: GameState, boardId: string): JobOffer[] {
  const day = dayOf(s.time.minutes);
  const cur = s.jobs.boards[boardId];
  if (!cur || cur.day !== day) s.jobs.boards[boardId] = { day, offers: generateBoard(s, boardId, day) };
  const activeIds = new Set(s.jobs.active.map((j) => j.offer.id));
  const doneIds = new Set((s.flags.doneJobs as string | undefined)?.split(',') ?? []);
  return s.jobs.boards[boardId].offers.filter((o) => !activeIds.has(o.id) && !doneIds.has(o.id));
}

export interface Requirement {
  label: string;
  met: boolean;
}

export function offerRequirements(s: GameState, o: JobOffer): Requirement[] {
  const v = activeVehicle(s);
  if (o.kind === 'odd') return [{ label: 'Energy above 20', met: s.player.needs.energy > 20 }];
  const kg = o.crates.reduce((a, c) => a + c.mass, 0);
  const liters = o.crates.reduce((a, c) => a + c.dims[0] * c.dims[1] * c.dims[2] * 1000, 0);
  const w = computeWeight(s, v.id);
  const req: Requirement[] = [
    { label: `Payload for ${kg} kg (you have ${Math.max(0, Math.round(w.payloadLeft))} kg free)`, met: w.payloadLeft >= kg },
    { label: `About ${Math.round(liters)} L of cargo space`, met: true },
  ];
  if (o.crates.some((c) => c.refrigerated)) {
    const fr = capacities(s, v.id).fridge;
    req.push({ label: 'Fridge space for chilled goods', met: !!fr });
  }
  if (o.crates.some((c) => c.fragile)) req.push({ label: 'Fragile: secure storage or straps', met: true });
  return req;
}

export function acceptJob(s: GameState, offerId: string, boardId: string): Result {
  if (s.jobs.active.length >= JOBS.maxActive) return fail(`You can hold at most ${JOBS.maxActive} jobs at once.`);
  const offer = boardOffers(s, boardId).find((o) => o.id === offerId);
  if (!offer) return fail('That job is no longer available.');
  if (offer.kind === 'odd' && s.jobs.active.some((j) => j.offer.kind === 'odd')) return fail('Finish your current odd job first.');
  s.jobs.active.push({ offer, acceptedMin: s.time.minutes, status: 'accepted', progress: 0 });
  if (offer.id === 'starter') s.flags.starterTaken = true;
  journal(s, 'job', `Accepted: ${offer.title} (${money(offer.pay)}).`);
  return ok();
}

export function acceptDirect(s: GameState, offer: JobOffer): Result {
  if (s.jobs.active.length >= JOBS.maxActive) return fail(`You can hold at most ${JOBS.maxActive} jobs at once.`);
  s.jobs.active.push({ offer, acceptedMin: s.time.minutes, status: 'accepted', progress: 0 });
  journal(s, 'job', `Accepted: ${offer.title} (${money(offer.pay)}).`);
  return ok();
}

export function activeJob(s: GameState, jobId: string): ActiveJob | undefined {
  return s.jobs.active.find((j) => j.offer.id === jobId);
}

// ── cargo loading ──

export interface LoadPreview {
  crateErrors: (string | null)[];
  weight: WeightReport;
  ok: boolean;
  messages: string[];
}

function placeCrates(s: GameState, job: ActiveJob, assignment: string[]): { uids: string[]; errors: (string | null)[] } {
  const v = activeVehicle(s);
  const offer = job.offer as DeliveryOffer;
  const uids: string[] = [];
  const errors: (string | null)[] = [];
  offer.crates.forEach((c, i) => {
    const comp = assignment[i];
    if (!comp) {
      errors.push('Choose where this crate goes.');
      return;
    }
    const inst = newItem(s, 'cargo', { kind: 'carried' }, { cargo: { ...c, jobId: offer.id, damage: 0 } });
    const chk = canStore(s, v.id, comp, inst);
    if (!chk.ok) {
      errors.push(chk.reason);
      delete s.items[inst.uid];
      s.uidCounter--;
      return;
    }
    const info = compartmentById(s, v.id, comp)!;
    inst.where = { kind: 'stored', vehicle: v.id, comp };
    inst.secured = info.secure ? undefined : false;
    uids.push(inst.uid);
    errors.push(null);
  });
  return { uids, errors };
}

export function previewLoad(s: GameState, jobId: string, assignment: string[]): LoadPreview {
  const job = activeJob(s, jobId)!;
  const counter = s.uidCounter;
  const { uids, errors } = placeCrates(s, job, assignment);
  const weight = computeWeight(s, activeVehicle(s).id);
  for (const u of uids) delete s.items[u];
  s.uidCounter = counter;
  const messages = [...weight.messages.filter((m) => m.startsWith('Over') || m.includes('axle'))];
  const allPlaced = errors.every((e) => e == null);
  return { crateErrors: errors, weight, ok: allPlaced && weight.worstFraction <= 0, messages };
}

export function loadCheck(s: GameState, jobId: string): Result {
  const job = activeJob(s, jobId);
  if (!job || job.offer.kind !== 'delivery') return fail('No such delivery.');
  if (job.status !== 'accepted') return fail('This cargo is already loaded.');
  const v = activeVehicle(s);
  if (!vehicleAtAnchor(v, ANCHOR_BY_ID[DOCKS[job.offer.pickup].anchor].id)) {
    return fail(`Park your RV at the loading dock (${dockLabel(job.offer.pickup)}).`);
  }
  return ok();
}

export function loadCargo(s: GameState, jobId: string, assignment: string[]): Result<{ minutes: number }> {
  const chk = loadCheck(s, jobId);
  if (!chk.ok) return chk;
  const pv = previewLoad(s, jobId, assignment);
  const bad = pv.crateErrors.find((e) => e);
  if (bad) return fail(bad);
  if (pv.weight.worstFraction > 0) return fail(`Cannot load: ${pv.weight.messages.join('; ')}. Remove weight or rearrange first.`);
  const job = activeJob(s, jobId)!;
  placeCrates(s, job, assignment);
  job.status = 'loaded';
  const n = (job.offer as DeliveryOffer).crates.length;
  note(s, `Loaded ${n} crate${n > 1 ? 's' : ''}. Deliver to ${dockLabel((job.offer as DeliveryOffer).dropoff)}.`, 'good');
  return ok({ minutes: 4 * n });
}

export function jobCargo(s: GameState, jobId: string) {
  return Object.values(s.items).filter((i) => i.cargo?.jobId === jobId);
}

export function deliverCheck(s: GameState, jobId: string): Result {
  const job = activeJob(s, jobId);
  if (!job || job.offer.kind !== 'delivery') return fail('No such delivery.');
  if (job.status !== 'loaded') return fail('Load the cargo at the pickup dock first.');
  const v = activeVehicle(s);
  const dock = DOCKS[job.offer.dropoff];
  if (!vehicleAtAnchor(v, dock.anchor)) return fail(`Park at ${dock.label} to unload.`);
  const cargo = jobCargo(s, jobId).filter((i) => (i.where.kind === 'stored' && i.where.vehicle === v.id));
  if (cargo.length !== job.offer.crates.length) return fail('Some of the cargo is missing from your RV.');
  return ok();
}

export function deliver(s: GameState, jobId: string): Result<{ pay: number; minutes: number; late: boolean }> {
  const chk = deliverCheck(s, jobId);
  if (!chk.ok) return chk;
  const job = activeJob(s, jobId)!;
  const offer = job.offer as DeliveryOffer;
  const cargo = jobCargo(s, jobId);
  const damage = cargo.reduce((a, c) => a + (c.cargo?.damage ?? 0), 0) / Math.max(1, cargo.length);
  const lateH = Math.max(0, (s.time.minutes - offer.deadlineMin) / 60);
  const lateMul = lateH > 0 ? Math.max(0.4, 1 - ECONOMY.latePenaltyPerHour * lateH) : 1;
  const pay = Math.round(offer.pay * (1 - damage * 0.8) * lateMul);
  for (const c of cargo) delete s.items[c.uid];
  s.jobs.active = s.jobs.active.filter((j) => j !== job);
  earn(s, pay, 'job', `Delivery: ${offer.title}`);
  s.jobs.completed++;
  s.jobs.history.push({ title: offer.title, pay, day: dayOf(s.time.minutes), result: lateH > 0 ? 'late' : 'paid' });
  markDone(s, offer.id);
  journal(s, 'job', `Delivered ${offer.title}: paid ${money(pay)}${damage > 0.02 ? ' (some damage deducted)' : ''}${lateH > 0 ? ' (late)' : ''}.`);
  note(s, `Delivery complete: +${money(pay)}`, 'money');
  addMood(s, 'job_done', 'Job well done', 5, 6);
  return ok({ pay, minutes: 4 * offer.crates.length, late: lateH > 0 });
}

function markDone(s: GameState, id: string) {
  const list = ((s.flags.doneJobs as string | undefined) ?? '').split(',').filter(Boolean);
  list.push(id);
  s.flags.doneJobs = list.slice(-80).join(',');
}

export function abandonJob(s: GameState, jobId: string): Result {
  const job = activeJob(s, jobId);
  if (!job) return fail('No such job.');
  for (const c of jobCargo(s, jobId)) delete s.items[c.uid];
  s.jobs.active = s.jobs.active.filter((j) => j !== job);
  if (job.status === 'loaded' || (job.offer.kind === 'odd' && job.progress > 0)) bill(s, ECONOMY.failPenalty, 'fees', `Cancelled job: ${job.offer.title}`);
  s.jobs.failed++;
  s.jobs.history.push({ title: job.offer.title, pay: 0, day: dayOf(s.time.minutes), result: 'failed' });
  if (s.player.carrying?.kind === 'job' && s.player.carrying.jobId === jobId) s.player.carrying = null;
  note(s, `Job cancelled: ${job.offer.title}.`, 'warn');
  return ok();
}

/** Expire deliveries past their deadline plus grace (called from time advance). */
export function deadlineTick(s: GameState): void {
  for (const job of [...s.jobs.active]) {
    if (job.offer.kind !== 'delivery') continue;
    if (s.time.minutes > job.offer.deadlineMin + JOBS.graceHours * 60) {
      for (const c of jobCargo(s, job.offer.id)) delete s.items[c.uid];
      s.jobs.active = s.jobs.active.filter((j) => j !== job);
      s.jobs.failed++;
      s.jobs.history.push({ title: job.offer.title, pay: 0, day: dayOf(s.time.minutes), result: 'failed' });
      bill(s, ECONOMY.failPenalty, 'fees', `Missed deadline: ${job.offer.title}`);
      note(s, `Missed the deadline for "${job.offer.title}". The client recovered the cargo and charged a ${money(ECONOMY.failPenalty)} fee.`, 'bad');
      journal(s, 'job', `Failed: ${job.offer.title} (deadline missed).`);
    }
  }
}

// ── odd jobs ──

export function oddDef(job: ActiveJob): OddJobDef {
  return ODD_JOBS[(job.offer as OddOffer).odd];
}

export function oddPoints(job: ActiveJob): [number, number][] {
  const o = job.offer as OddOffer;
  return o.points ?? oddDef(job).points;
}

export function oddTotal(job: ActiveJob): number {
  return oddPoints(job).length;
}

/** One unit of odd-job work done (caller validated position). Returns minutes. */
export function oddStep(s: GameState, jobId: string): Result<{ minutes: number; done: boolean; pay: number }> {
  const job = activeJob(s, jobId);
  if (!job || job.offer.kind !== 'odd') return fail('No such odd job.');
  const d = oddDef(job);
  if (s.player.needs.energy < 6) return fail('You are too exhausted to keep working.');
  job.progress++;
  restore(s, 'energy', -d.energyPerStep);
  restore(s, 'hygiene', -d.hygienePerStep);
  const total = oddTotal(job);
  if (job.progress >= total) {
    const pay = Math.round(job.offer.pay * Math.max(0.7, workEfficiency(s)));
    s.jobs.active = s.jobs.active.filter((j) => j !== job);
    earn(s, pay, 'job', job.offer.title);
    s.jobs.completed++;
    s.jobs.history.push({ title: job.offer.title, pay, day: dayOf(s.time.minutes), result: 'paid' });
    markDone(s, job.offer.id);
    note(s, `${job.offer.title}: done! +${money(pay)}`, 'money');
    addMood(s, 'job_done', 'Honest work', 4, 5);
    return ok({ minutes: d.minutesPer, done: true, pay });
  }
  return ok({ minutes: d.minutesPer, done: false, pay: 0 });
}

// ── remote work ──

export interface RemoteQuote {
  ok: boolean;
  reason?: string;
  perHour: number;
  bars: number;
  maxHours: number;
}

export function remoteQuote(s: GameState, gigId: string, atTable: boolean): RemoteQuote {
  const gig = REMOTE_GIGS.find((g) => g.id === gigId)!;
  const v = activeVehicle(s);
  const c = capacities(s, v.id);
  const bars = signalAt(v.pose.x, v.pose.z, c.boosterBars);
  const day = dayOf(s.time.minutes);
  const used = s.jobs.remoteDay === day ? s.jobs.remoteHoursToday : 0;
  const maxHours = Math.max(0, JOBS.remoteMaxHoursPerDay - used);
  const hasLaptop = itemsInVehicle(s, v.id).some((i) => i.def === 'laptop' && i.where.kind === 'stored');
  let reason: string | undefined;
  if (!hasLaptop) reason = 'You need a laptop in the RV.';
  else if (bars < gig.minSignal) reason = `Needs ${gig.minSignal} bars of signal; you have ${bars}.${c.boosterBars ? '' : ' A cell booster would help.'}`;
  else if (maxHours <= 0) reason = 'You have done enough screen time for today.';
  else if (s.player.needs.energy < 10) reason = 'Too tired to concentrate.';
  else if (!v.hookups.power && !v.generatorOn && v.batteryWh < 70) reason = 'Battery too low to run the laptop. Find shore power or sun.';
  const sigMul = bars >= 4 ? 1 : bars === 3 ? 0.95 : bars === 2 ? 0.85 : 0.7;
  const perHour = gig.perHour * sigMul * (atTable ? 1 : 0.85) * workEfficiency(s) * difficulty(s).payMul;
  return { ok: !reason, reason, perHour: Math.round(perHour * 100) / 100, bars, maxHours };
}

export function payRemote(s: GameState, gigId: string, hours: number, perHour: number): number {
  const gig = REMOTE_GIGS.find((g) => g.id === gigId)!;
  const pay = Math.round(perHour * hours * 100) / 100;
  const day = dayOf(s.time.minutes);
  if (s.jobs.remoteDay !== day) {
    s.jobs.remoteDay = day;
    s.jobs.remoteHoursToday = 0;
  }
  s.jobs.remoteHoursToday += hours;
  if (pay > 0) {
    earn(s, pay, 'job', `Remote work: ${gig.title} (${fmtDuration(hours * 60)})`);
    note(s, `Remote work: +${money(pay)} for ${fmtDuration(hours * 60)}.`, 'money');
  }
  return pay;
}

export function vehicleWidth(s: GameState): number {
  return vdef(activeVehicle(s)).dims.width;
}
