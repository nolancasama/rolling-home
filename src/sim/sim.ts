import { REMOTE_GIGS } from '../data/content';
import { JOBS } from '../data/config';
import { PROCEDURES, type ProcMistake } from '../data/procedures';
import type { VehicleId } from '../data/types';
import * as camping from './camping';
import { dayOf, fail, journal, note, ok, onNote, type Note, type Result } from './core';
import { checkDiscoveries, checkVisit } from './discovery';
import * as furnish from './furnish';
import * as jobs from './jobs';
import * as living from './living';
import * as maint from './maintenance';
import { addMood } from './needs';
import { complete } from './objectives';
import * as npcs from './npcs';
import { stayOf } from './places';
import { deserialize, serialize } from './save';
import * as services from './services';
import * as shop from './shop';
import { moveToCompartment } from './storage';
import { advance, type AdvanceCtx } from './time';
import * as travel from './travel';
import type { GameState, PlayerMode } from './types';
import { activeVehicle } from './vehicle';

export interface SleepSummary {
  minutes: number;
  quality: number;
  reasons: string[];
  energyBefore: number;
  energyAfter: number;
  day: number;
  earned: number;
  spent: number;
  km: number;
  discoveries: string[];
}

type Listener = () => void;

/**
 * Facade over the pure simulation. Wraps actions so that successful ones
 * advance time by what they cost, track objectives and notify listeners.
 */
export class Sim {
  s: GameState;
  private listeners: Listener[] = [];
  private noteListeners: ((n: Note) => void)[] = [];
  notes: Note[] = [];
  private unsub: () => void;

  constructor(state: GameState) {
    this.s = state;
    this.unsub = onNote((n) => {
      this.notes.push(n);
      if (this.notes.length > 100) this.notes.shift();
      for (const f of this.noteListeners) f(n);
    });
  }

  dispose(): void {
    this.unsub();
  }

  onChange(f: Listener): () => void {
    this.listeners.push(f);
    return () => (this.listeners = this.listeners.filter((x) => x !== f));
  }

  onNote(f: (n: Note) => void): () => void {
    this.noteListeners.push(f);
    return () => (this.noteListeners = this.noteListeners.filter((x) => x !== f));
  }

  changed(): void {
    for (const f of this.listeners) f();
  }

  get v() {
    return activeVehicle(this.s);
  }

  /** Context for the player's current situation. */
  ctxFor(activity: AdvanceCtx['activity'] = 'idle'): AdvanceCtx {
    const mode = this.s.player.mode;
    return { activity, inVehicle: mode !== 'explore', occupied: mode !== 'explore', driving: mode === 'drive' };
  }

  advance(minutes: number, ctx: AdvanceCtx = this.ctxFor()): void {
    advance(this.s, minutes, ctx);
  }

  private timed<T extends { minutes: number }>(r: Result<T>, activity: AdvanceCtx['activity'] = 'idle', extra: Partial<AdvanceCtx> = {}): Result<T> {
    if (r.ok) {
      this.advance(r.minutes, { ...this.ctxFor(activity), ...extra });
      this.changed();
    }
    return r;
  }

  setMode(mode: PlayerMode): void {
    this.s.player.mode = mode;
  }

  // ── living ──
  cook(uid: string) { return this.timed(living.cook(this.s, uid), 'idle'); }
  eat(uid: string) { return this.timed(living.eat(this.s, uid), 'idle'); }
  discard(uid: string) { const r = living.discard(this.s, uid); this.changed(); return r; }
  rvShower() { return this.timed(living.rvShower(this.s)); }
  outdoorShower() { return this.timed(living.outdoorShower(this.s)); }
  toilet() { return this.timed(living.useToilet(this.s)); }
  wash() { return this.timed(living.washUp(this.s)); }
  hobby(uid: string) { return this.timed(living.hobby(this.s, uid), 'relax'); }
  relax(outside: boolean) { return this.timed(living.relax(this.s, outside), 'relax'); }

  sleep(nap: boolean): SleepSummary {
    const s = this.s;
    const plan = living.sleepPlan(s, nap);
    const before = s.player.needs.energy;
    const startDay = s.stats.today;
    this.advance(plan.minutes, { activity: 'sleep', sleepQuality: plan.quality, inVehicle: true, occupied: true, sleeping: true });
    if (plan.quality < 0.6) addMood(s, 'bad_sleep', 'Rough night', -6, 6);
    else if (plan.quality > 0.95) addMood(s, 'good_sleep', 'Slept like a log', 6, 8);
    const summary: SleepSummary = {
      minutes: plan.minutes, quality: plan.quality, reasons: plan.reasons, energyBefore: before, energyAfter: s.player.needs.energy,
      day: dayOf(s.time.minutes), earned: startDay.earned, spent: startDay.spent, km: startDay.km, discoveries: [...startDay.discoveries],
    };
    if (!nap) {
      const st = this.stayHere();
      s.stats.nights++;
      if (st.camp && st.camp.stayLimitNights > 0) {
        const n = (s.freeNights[st.camp.id] = (s.lastNightPlace === st.camp.id ? (s.freeNights[st.camp.id] ?? 0) : 0) + 1);
        if (n > st.camp.stayLimitNights) {
          note(s, `You have stayed at ${st.camp.name} longer than the ${st.camp.stayLimitNights}-night limit. Time to move on.`, 'warn');
          addMood(s, 'overstay', 'Overstayed my welcome', -4, 10);
        }
      }
      s.lastNightPlace = st.camp?.id ?? st.kind;
      s.stats.history.push({ ...s.stats.today });
      if (s.stats.history.length > 60) s.stats.history.shift();
      s.stats.today = { day: dayOf(s.time.minutes), earned: 0, spent: 0, km: 0, discoveries: [] };
    }
    this.changed();
    return summary;
  }

  stayHere() {
    return stayOf(this.s, activeVehicle(this.s));
  }

  // ── services ──
  refuel(anchor: string, liters: number) { return this.timed(services.refuel(this.s, anchor, liters)); }
  fillWater(anchor: string, target: number) { return this.timed(services.fillWater(this.s, anchor, target)); }
  drainFresh(target: number) { return this.timed(services.drainFresh(this.s, target)); }
  pourJug(uid: string) { return this.timed(services.pourJug(this.s, uid)); }
  dump(anchor: string) {
    const r = services.dump(this.s, anchor);
    if (r.ok) complete(this.s, 'dump');
    return this.timed(r, 'labor');
  }
  refillPropane(anchor: string) { return this.timed(services.refillPropane(this.s, anchor)); }
  carWash(anchor: string) { return this.timed(services.carWash(this.s, anchor)); }
  paidShower(anchor: string) { return this.timed(services.paidShower(this.s, anchor)); }
  diner(anchor: string) { return this.timed(services.dinerMeal(this.s, anchor)); }
  canoe(anchor: string) { return this.timed(services.rentCanoe(this.s, anchor), 'run'); }
  fish() { return this.timed(services.goFishing(this.s), 'relax'); }
  campfire(x: number, z: number) { return this.timed(services.joinCampfire(this.s, x, z), 'relax'); }
  rentLocker() { const r = services.lockerRent(this.s); this.changed(); return r; }

  procedureMistake(m: ProcMistake) {
    services.applyMistake(this.s, m);
    this.changed();
  }

  completeProcedure(procId: string, quick: boolean) {
    services.completeProcedure(this.s, procId);
    const p = PROCEDURES[procId];
    if (p) this.advance(quick ? p.quickMinutes : p.minutes, this.ctxFor('labor'));
    this.changed();
  }

  // ── camping ──
  reserve(camp: string, site: string, nights: number) {
    const r = camping.reserve(this.s, camp, site, nights);
    if (r.ok) complete(this.s, 'campsite');
    this.changed();
    return r;
  }
  connect(kind: camping.HookupKind) {
    const r = camping.connect(this.s, kind);
    if (r.ok && (kind === 'power' || kind === 'water')) complete(this.s, 'hookups');
    this.changed();
    return r;
  }
  disconnect(kind: camping.HookupKind) { camping.disconnect(this.s, kind); this.changed(); }
  level() { const r = camping.level(this.s); if (r.ok) this.advance(4, this.ctxFor('labor')); this.changed(); return r; }
  setAwning(open: boolean) { const r = camping.setAwning(this.s, open); if (r.ok) this.advance(3, this.ctxFor('labor')); this.changed(); return r; }
  packUp() {
    const r = camping.packUp(this.s);
    if (r.minutes) this.advance(r.minutes, this.ctxFor('labor'));
    this.changed();
    return r;
  }
  placeOutdoor(uid: string, x: number, z: number, rot: number) { const r = camping.placeOutdoor(this.s, uid, x, z, rot); this.changed(); return r; }
  packOutdoor(uid: string) { const r = camping.packOutdoor(this.s, uid); this.changed(); return r; }

  // ── jobs ──
  accept(offerId: string, board: string) {
    const r = jobs.acceptJob(this.s, offerId, board);
    if (r.ok) {
      const j = jobs.activeJob(this.s, offerId);
      if (j?.offer.kind === 'delivery') complete(this.s, 'accept');
    }
    this.changed();
    return r;
  }
  loadCargo(jobId: string, assignment: string[]) {
    const r = jobs.loadCargo(this.s, jobId, assignment);
    if (r.ok) complete(this.s, 'load');
    return this.timed(r, 'labor');
  }
  deliver(jobId: string) {
    const r = jobs.deliver(this.s, jobId);
    if (r.ok) {
      complete(this.s, 'deliver');
      if (this.s.flags.boughtUpgradeEarly) {
        // upgrades bought before the first job count once money has been earned
      }
    }
    return this.timed(r, 'labor');
  }
  oddStep(jobId: string) { return this.timed(jobs.oddStep(this.s, jobId), 'labor'); }
  abandon(jobId: string) { const r = jobs.abandonJob(this.s, jobId); this.changed(); return r; }

  remoteWork(gigId: string, hours: number, atTable: boolean): Result<{ hours: number; pay: number }> {
    const s = this.s;
    const q = jobs.remoteQuote(s, gigId, atTable);
    if (!q.ok) return fail(q.reason ?? 'Cannot work right now.');
    hours = Math.max(0.5, Math.min(q.maxHours, hours));
    const v = activeVehicle(s);
    const gig = REMOTE_GIGS.find((g) => g.id === gigId)!;
    let done = 0;
    const chunk = 10;
    let stopped = '';
    while (done < hours * 60 - 0.01) {
      const powered = v.hookups.power || v.generatorOn;
      if (!powered && v.batteryWh < 12) {
        stopped = 'The laptop died: the house battery is flat.';
        break;
      }
      if (s.player.needs.energy < 5) {
        stopped = 'You are too exhausted to continue.';
        break;
      }
      const step = Math.min(chunk, hours * 60 - done);
      this.advance(step, { ...this.ctxFor('work'), extraW: 63 });
      done += step;
    }
    const pay = jobs.payRemote(s, gig.id, done / 60, q.perHour);
    if (stopped) note(s, stopped, 'warn');
    if (s.jobs.remoteHoursToday >= JOBS.remoteMaxHoursPerDay) note(s, 'That is a full day of screen time.', 'info');
    this.changed();
    return ok({ hours: done / 60, pay });
  }

  // ── shopping ──
  buy(shopId: string, itemId: string, opts: shop.BuyOptions = {}) {
    const r = shop.buy(this.s, shopId, itemId, opts);
    if (r.ok) this.advance(2, this.ctxFor('walk'));
    this.changed();
    return r;
  }
  sell(shopId: string, uid: string) { const r = shop.sell(this.s, shopId, uid); this.changed(); return r; }
  buyVehicle(defId: VehicleId) { const r = shop.buyVehicle(this.s, defId); if (r.ok) this.advance(60, this.ctxFor('walk')); this.changed(); return r; }
  toLocker(uid: string) { const r = shop.toLocker(this.s, uid); this.changed(); return r; }
  fromLocker(uid: string) { const r = shop.fromLocker(this.s, uid); this.changed(); return r; }
  moveItem(uid: string, comp: string) { const r = moveToCompartment(this.s, uid, this.v.id, comp); this.changed(); return r; }

  // ── maintenance ──
  repair(mechanicId: string, comps: maint.RepairTarget[]) { return this.timed(maint.payRepair(this.s, this.v.id, mechanicId, comps)); }
  diy(partUid: string) {
    const r = maint.diyRepair(this.s, this.v.id, partUid);
    if (r.ok) this.advance(maint.DIY_MINUTES, this.ctxFor('labor'));
    this.changed();
    return r;
  }

  // ── furnishing (time is paused in furnishing mode: no advance) ──
  place(uid: string, x: number, z: number, rot: number) { const r = furnish.placeItem(this.s, this.v.id, uid, x, z, rot); this.changed(); return r; }
  uninstall(uid: string) { const r = furnish.uninstall(this.s, this.v.id, uid); this.changed(); return r; }
  installSlot(uid: string) { const r = furnish.installSlot(this.s, this.v.id, uid); this.changed(); return r; }
  uninstallSlot(uid: string) { const r = furnish.uninstallSlot(this.s, this.v.id, uid); this.changed(); return r; }
  swapMattress(bed: string, mattress: string) { const r = furnish.swapMattress(this.s, this.v.id, bed, mattress); this.changed(); return r; }

  // ── travel / world ──
  assistedTravel(destNode: string) { const r = travel.runAssisted(this.s, destNode); this.changed(); return r; }
  discover(x: number, z: number) {
    const found = checkDiscoveries(this.s, x, z);
    checkVisit(this.s, x, z);
    if (found.length) this.changed();
    return found;
  }

  // ── npcs ──
  npcDialog(id: string) { return npcs.npcDialog(this.s, id); }
  npcChoose(id: string, option: string) { const r = npcs.npcChoose(this.s, id, option); this.changed(); return r; }

  // ── objectives ──
  objective(id: string) { complete(this.s, id); this.changed(); }

  // ── save ──
  serialize(savedAt: string): string { return serialize(this.s, savedAt); }
  static fromJSON(json: string): Result<{ sim: Sim }> {
    const r = deserialize(json);
    if (!r.ok) return r;
    return ok({ sim: new Sim(r.state) });
  }

  journal(text: string) { journal(this.s, 'event', text); }
}
